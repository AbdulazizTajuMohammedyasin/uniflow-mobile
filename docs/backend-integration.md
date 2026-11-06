# Push notifications: what the UniFlow backend and website need

The mobile app is ready to receive push notifications (tested on a real Android phone:
permission, push address, delivery through Expo → Firebase, opening the right page from a
tap). **Nothing sends them yet**, because the UniFlow server has no devices and no push
sender. This document is the complete specification for that work in the web repository
(`uni-flow`). It was written without changing that repository.

Contents:

1. [How it fits together](#1-how-it-fits-together)
2. [Backend: devices](#2-backend-devices)
3. [Backend: push preferences](#3-backend-push-preferences)
4. [Backend: sending](#4-backend-sending)
5. [Website: registering the phone](#5-website-registering-the-phone)
6. [Configuration and rollout](#6-configuration-and-rollout)
7. [Tests](#7-tests)
8. [Reference: the app–website bridge](#8-reference-the-appwebsite-bridge)

---

## 1. How it fits together

```
 Phone (UniFlow app)                     UniFlow website (in the app's WebView)
 ───────────────────                     ──────────────────────────────────────
 gets its Expo push address  ──bridge──▶ logged in? POST /notifications/devices/
                                          (with its own access token, as every API call)

 UniFlow backend
 ───────────────
 an insight is published → deliver() → notify_deliveries() → notifications.send()
                                                              │ Notification rows
                                                              ▼  (already targeted + deduplicated)
                          Inngest "push-notifications" job ──▶ Expo Push API ──▶ Google / Apple ──▶ phone
                          Inngest "check-push-receipts" job ◀─ receipts (bad tokens are switched off)
```

Why it is built this way:

- **The website registers the phone, not the app.** The website's access token lives only
  in its own memory and the refresh token in an httpOnly cookie (`accounts/cookie_jwt.py`).
  The app can't (and shouldn't) read either. So the app hands the website the phone's push
  address, which is not a credential, and the website sends it with its normal
  authenticated API call. No login changes, no tokens on the bridge.
- **Push follows the existing `Notification` rows.** Every alert UniFlow decides to send
  already becomes one row through `notifications.services.send()`: targeted by
  `intelligence/delivery.py` (named students, the right sections and courses, the
  audience; never everyone for an AI insight), only for **published** insights, never
  twice (`dedupe_key`, `Delivery.notified_at`), including the daily digest and
  retractions. A push is simply "this row, on this user's phones". Nothing about who gets
  what is decided again, so push can never reach someone the in-app bell wouldn't.
- **Expo Push Service** talks to Firebase (Android) and Apple (iPhone) for us; the server
  sends one simple HTTPS request per 100 messages.

## 2. Backend: devices

### Model (`apps/notifications/models.py`)

```python
class Device(TimeStampedModel):
    """A phone with the UniFlow app that may get push notifications for its user."""

    class Platform(models.TextChoices):
        ANDROID = "android", "Android"
        IOS = "ios", "iOS"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="devices")
    # "ExponentPushToken[…]": an address, not a secret, but personal: never logged in full.
    expo_token = models.CharField(max_length=200, unique=True)
    platform = models.CharField(max_length=10, choices=Platform)
    app_version = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField()  # the last registration call: the app was used
    deactivated_reason = models.CharField(max_length=30, blank=True)  # logout / not_registered / stale

    class Meta:
        indexes = [models.Index(fields=["user", "is_active"])]
```

Rules:

- **Ownership comes from `request.user` only.** The request body never names a user.
- **One phone, one owner.** `expo_token` is unique. Registering a token that belongs to
  someone else **moves it** to the current user (a shared or handed-on phone must never
  get the previous student's alerts). Registering one's own token again reactivates it and
  updates `last_seen_at`, `platform` and `app_version`.
- **Many phones per user** are fine.
- Only **students** (`role = student`, active, not suspended) register; others get 403.
  Staff don't receive student alerts.

### API (`apps/notifications/urls.py`, under `/api/v1/notifications/`)

| Method and path | Body | Answer |
|---|---|---|
| `POST devices/` | `{"token": "ExponentPushToken[…]", "platform": "android", "app_version": "1.0.0"}` | `201` new / `200` updated: `{"registered": true}` |
| `POST devices/unregister/` | `{"token": "ExponentPushToken[…]"}` | `204`, also when the token is unknown or someone else's (nothing is revealed); deactivates it only if it is the caller's |

- Validation: `token` must match `^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$`;
  `platform` one of `android`, `ios`; `app_version` at most 20 characters.
  Otherwise the usual `400` error format (`docs/04-api.md`).
- Authentication: the normal `ActiveUserJWTAuthentication`.
- Throttle: a `devices` scope, e.g. `30/hour` per user (the website calls on every page
  load in the app, so allow some room; see §5).
- Unregister is a `POST` (not `DELETE` with a body, which some proxies drop).

### Lifecycle

| Event | What happens |
|---|---|
| Login in the app, and every app start while logged in | `POST devices/`: active, `last_seen_at` = now |
| Logout in the app | the website calls `POST devices/unregister/` **before** `jwt/logout/` → inactive, reason `logout` |
| Expo or the platform says the token is gone (`DeviceNotRegistered`) | inactive, reason `not_registered` (§4) |
| Not seen for longer than the login lasts (`REFRESH_TOKEN_LIFETIME`, 14 days) | inactive, reason `stale`, by a daily job. The session on that phone has ended anyway; this stops alerts to a phone whose student never logged out |
| Account suspended or deactivated | no pushes (checked when sending, §4) |

## 3. Backend: push preferences

Students can choose which alerts reach their phone. The in-app bell always shows
everything; these only control the phone.

```python
class PushSettings(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, primary_key=True,
                                related_name="push_settings")
    class_changes = models.BooleanField(default=True)  # timetable_change_proposed / _retracted
    needs_you = models.BooleanField(default=True)      # direct_attention, action_required, important_update
    daily_digest = models.BooleanField(default=True)   # digest
```

- `GET notifications/push-settings/` → `{"class_changes": true, "needs_you": true, "daily_digest": true}`
  (defaults when no row exists yet).
- `PATCH notifications/push-settings/` with any of the three booleans → the full object.
- `system` alerts (admin broadcasts) always go out.

## 4. Backend: sending

### Which rows get pushed

Add to `Notification`:

```python
pushed_at = models.DateTimeField(null=True, blank=True)  # claimed for push (sent or skipped)
```

The migration sets `pushed_at = now()` on **all existing rows**, so turning the feature on
never sends a backlog of old alerts.

A row is pushed once, to each of its recipient's active devices that were registered
**before the row was created** (a newly installed app doesn't receive old alerts).

### The job (`apps/notifications/functions.py`, Inngest)

`notifications.services.send()` keeps its current behaviour and adds one line: after the
save commits, start the push job.

```python
def send(alerts: list[Notification]) -> None:
    Notification.objects.bulk_create(alerts, batch_size=1000, ignore_conflicts=True)
    transaction.on_commit(lambda: inngest_send(NOTIFICATIONS_CREATED))
```

(`bulk_create(ignore_conflicts=True)` doesn't report which rows are new, which is why the
job finds unsent rows itself instead of being told their ids.)

`NotificationsConfig.ready()` imports `functions` (like `IntelligenceConfig`).

**`push-notifications`**, on `uniflow/notifications.created`, at most one run at a time
(`Concurrency(limit=1)`), plus a safety-net schedule every 5 minutes (a missed event, a
deploy during sending). The `@function` helper in `config/inngest.py` only knows
`daily_at` today: give it an `every_minutes` (or plain `cron`) option that creates
`inngest.TriggerCron(cron=f"TZ={settings.TIME_ZONE} */5 * * * *")` the same way, and make
`run_now` tests call these jobs directly.

1. In a transaction, claim up to 500 rows:
   `Notification.objects.select_for_update(skip_locked=True).filter(pushed_at__isnull=True)`
   `.order_by("id")[:500]`, then set `pushed_at = now()`. A row claimed is never claimed
   again, so a job that runs twice (Inngest retry, the schedule, two events) can't push it
   twice.
2. Skip, without sending: recipients that are inactive or suspended; kinds the student
   switched off (§3); rows older than 1 hour (a delayed job must not wake people with stale
   alerts; they're still in the bell).
3. For each remaining row and each of the recipient's active devices with
   `created_at <= row.created_at`, build one message (below) and a `PushTicket` row
   (`notification`, `device`, `status = pending`, unique together).
4. Send in batches of at most 100 messages to `https://exp.host/--/api/v2/push/send` with
   `Authorization: Bearer <EXPO_ACCESS_TOKEN>`, `httpx` (add it to the Pipfile; it is
   already installed through `inngest`), a 15-second timeout.
5. Record each ticket: `ok` + Expo's ticket id, or `error` + the error code.
   `DeviceNotRegistered` deactivates the device at once.
6. If the whole request fails (network error, HTTP 429 or 5xx), leave those tickets
   `pending` and raise `inngest.RetryAfterError` (1, 2, 4… minutes, at most 5 tries). The
   retry sends only `pending` tickets younger than 1 hour. HTTP 4xx other than 429 is a bug
   in the request: log it, mark the tickets `error`, don't retry.

**`check-push-receipts`**, every 15 minutes: for `ok` tickets 15 minutes to 24 hours old
without a receipt, ask `https://exp.host/--/api/v2/push/getReceipts` (at most 1000 ids per
request). `DeviceNotRegistered` → deactivate the device. `MessageRateExceeded` → log.
`InvalidCredentials` / `MismatchSenderId` → log an error (the Firebase or Apple setup is
wrong). Store the receipt status on the ticket. Delete tickets older than 7 days.

**`deactivate-stale-devices`**, daily (with the 03:00 clean-up): devices with
`last_seen_at` older than `REFRESH_TOKEN_LIFETIME` → inactive, reason `stale`.

**Logging:** ticket ids, error codes, counts and device ids only. Never the full Expo
token, never `EXPO_ACCESS_TOKEN`, never message text.

### The message

```json
{
  "to": "ExponentPushToken[…]",
  "title": "<Notification.title>",
  "body": "<Notification.body>",
  "data": { "v": 1, "notification_id": 812, "target_type": "insight", "target_id": 42 },
  "channelId": "class-changes",
  "priority": "high",
  "sound": "default",
  "badge": 3
}
```

- **`data`** is exactly what the app reads (`src/push/payload.ts`): version `1` and the
  row's `target_type` / `target_id`, as on the website's notifications page. The app works
  out the page itself (`/insights/42`, `/digest?date=2026-10-09`, otherwise
  `/notifications`) and ignores anything else. **Never put a URL or path in the payload.**
- **`channelId`** (Android; the app creates these channels, each can be muted separately
  in the phone's settings):

  | Notification kind | `channelId` | `priority` |
  |---|---|---|
  | `timetable_change_proposed`, `timetable_change_retracted` | `class-changes` | `high` |
  | `direct_attention`, `action_required`, `important_update` | `needs-you` | `high` |
  | `digest` | `digest` | `normal` |
  | `system` | `general` | `normal` |

- **`badge`** (iPhone): the recipient's unread count after this row
  (`Notification.objects.filter(recipient=…, read_at__isnull=True).count()`), so the app
  icon shows the same number as the bell. Android ignores it and counts the notifications
  in the shade.
- Keep the whole message under 4 KB: titles are at most 200 characters and bodies 500
  already.
- Lock screens show the title and body. They are the same texts the bell shows; if that
  is too much for some kinds later, send a generic title ("A class of yours changed") and
  let the app open the item.

## 5. Website: registering the phone

The website runs inside the app's WebView. A small module (e.g. `src/lib/app.ts`, used from
`AuthContext`) does three things. Everything is inert in an ordinary browser, because
`window.UniFlowApp` only exists inside the app.

```ts
declare global {
  interface Window {
    UniFlowApp?: { bridgeVersion: 1; platform: 'android' | 'ios'; appVersion: string; pushToken: string | null }
    ReactNativeWebView?: { postMessage(message: string): void }
  }
}

const tell = (message: object) => window.ReactNativeWebView?.postMessage(JSON.stringify({ v: 1, ...message }))
```

1. **Register when logged in.** When `user` becomes a student (login, or a restored
   session on load) and `window.UniFlowApp?.pushToken` is set, call
   `POST /notifications/devices/` with `{ token, platform, app_version }`. Do it again when
   the app announces a (new) address with the `uniflow:push-token` window event
   (`event.detail.token`; `null` means notifications are off on the phone, then there's
   nothing to do). Then `tell({ type: 'push-registration', status: 'registered' })`, or
   `'failed'` on an error. At most once per token per page load.
   Listen for the event from the start: on Android the app's script can run late on a page
   restored by Back, so `window.UniFlowApp` may not exist yet when the session is
   restored; the app dispatches `uniflow:push-token` again after every page load.
2. **Unregister on logout.** In `logout()`, **before** `authApi.logout()`: if there is a
   token, `POST /notifications/devices/unregister/` (ignore errors; never block logging
   out), then `tell({ type: 'push-registration', status: 'unregistered' })`.
3. **Say whether someone is logged in**: `tell({ type: 'session', signedIn: user !== null })`
   whenever `user` changes after loading. The app then stops guessing from the page address
   when to offer notifications.

Plus two small things:

- **Push settings on the Profile page**, shown only inside the app
  (`window.UniFlowApp`): three switches bound to `notifications/push-settings/`
  ("Class changes", "When something needs you", "Daily digest").
- **Keep the unread badge's label** `aria-label="{count} unread"` (`AppLayout.tsx`). The
  app reads it to keep its icon in step. Better still, also
  `tell({ type: 'unread', count })` whenever the count changes; the app accepts that
  message as it is.

## 6. Configuration and rollout

| Setting | Where | Notes |
|---|---|---|
| `EXPO_ACCESS_TOKEN` | Render environment (**secret**) | A robot user's token (expo.dev → Account settings → Access tokens), role Developer. Read with `env_str("EXPO_ACCESS_TOKEN", "")`; when empty, the push job logs once and skips (development without push) |
| Enhanced push security | expo.dev → project `uniflow` → Settings → Push notifications | **On.** Expo rejects any send without the access token, so a leaked push address alone can't be used to send anything |
| Firebase (Android) | done | `google-services.json` is an EAS file variable; the FCM key is uploaded to Expo |
| Apple (iPhone) | needs a paid Apple Developer account | EAS creates the push key during the first iOS build |

Order:

1. Backend: models + migration (backfilling `pushed_at`), device and settings API, tests.
   Deploy. Nothing is sent yet (no token).
2. Website: the registration module and Profile switches. Deploy. Phones start registering
   (visible in the Django admin under Notifications → Devices).
3. Set `EXPO_ACCESS_TOKEN` on Render → pushes start for new alerts.
4. Check with a real phone: publish a test insight to a test section (or a `system`
   broadcast to a test account) and watch Inngest → Runs → `push-notifications`.

## 7. Tests

Backend (pytest, `INNGEST_RUN_NOW`, Expo's HTTP calls replaced with `httpx.MockTransport`
or a monkeypatched client; no real requests):

- Devices: register creates; registering again updates `last_seen_at`; a token of another
  user moves to the caller; unregister deactivates only the caller's own token and answers
  `204` for others' (no change); invalid token or platform → `400`; anonymous → `401`;
  staff → `403`; throttle applies.
- Settings: defaults without a row; `PATCH` changes only the given fields; only one's own.
- Sending:
  - a published insight's alert reaches each active device of the recipient, with the
    right `data`, `channelId`, `priority` and `badge`;
  - running the job twice sends once; two parallel runs send once (`skip_locked`);
  - devices registered after the alert, inactive devices, suspended users and switched-off
    kinds get nothing;
  - alerts older than 1 hour are claimed but not sent;
  - existing rows are not sent after the migration;
  - `DeviceNotRegistered` in a ticket or receipt deactivates the device;
  - HTTP 500/429 keeps tickets pending and asks to retry; HTTP 400 doesn't retry;
  - more than 100 messages are split into batches of 100;
  - logs contain no full token.
- Existing behaviour is unchanged: the bell's API and the current `delivery.py` tests pass
  as they are.

Website (vitest): with `window.UniFlowApp` and `window.ReactNativeWebView` stubbed:
registers once after login and after `uniflow:push-token`; nothing without a token, or
without `window.UniFlowApp`; unregisters before `jwt/logout/` and still logs out if that
call fails; posts `session` on login and logout.

End to end (real phone, development build): log in → the device appears in the admin;
publish a test alert to yourself → it arrives, its tap opens the item; log out → the
device is inactive and further alerts don't arrive.

## 8. Reference: the app–website bridge

Implemented in the app in `src/web/bridge.ts`. All messages are JSON with `"v": 1`; the
app ignores anything else, anything over 1 KB, and anything from another origin.

**App → page** (only on UniFlow's own origin):

| What | Form |
|---|---|
| The app is present | `window.UniFlowApp = { bridgeVersion: 1, platform, appVersion, pushToken }` before the website's own scripts run |
| The phone's push address | `window.UniFlowApp.pushToken` is set, then `window.dispatchEvent(new CustomEvent('uniflow:push-token', { detail: { token, platform } }))`; `token` is `null` when notifications are off. Sent on every page load and whenever it changes |
| The user agent | ends with `UniFlowApp/<version> (android|ios)` |

**Page → app** (`window.ReactNativeWebView.postMessage(JSON.stringify(message))`):

| Message | Sent by | Meaning |
|---|---|---|
| `{ "v": 1, "type": "session", "signedIn": true }` | website (§5) | someone is logged in, or not |
| `{ "v": 1, "type": "push-registration", "status": "registered" }` | website (§5) | `registered`, `unregistered` or `failed` |
| `{ "v": 1, "type": "unread", "count": 3 }` | the app's own page script today; the website may send it too | unread alerts, for the app icon |
| `{ "v": 1, "type": "theme", "dark": true }` | the app's own page script | light or dark, for the status bar |
| `{ "v": 1, "type": "layout", "bottomBar": true, "insetBottom": 24 }` | the app's own page script | whether the page draws its own bottom bar above the system bar |

Never send login tokens, passwords or personal data over the bridge; the app doesn't
accept them and has no use for them.
