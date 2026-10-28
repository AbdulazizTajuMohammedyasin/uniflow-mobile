# Setup, builds and release

How to work on the UniFlow app, build it, put it on phones, and publish it. The app is the
UniFlow website (`https://uni-flow-inky.vercel.app`) inside a native frame, plus push
notifications. The website and backend live in their own repository; this one never changes
them (see [backend-integration.md](backend-integration.md) for the work they need).

All builds run in the cloud on EAS (Expo's build service). No Android Studio or Xcode is
needed, and local Android builds on Windows fail anyway (see Troubleshooting).

## 1. What you need

| What | Why |
| --- | --- |
| Node.js 24 and npm | install packages, run checks |
| An Expo account with access to `@abdulaziztaju/uniflow` | builds, credentials, push |
| `npx eas-cli@latest login` (once per computer) | lets the EAS commands below act for you |
| An Android phone (or the Android Studio emulator) | to run builds |
| Later: Google Play Developer account (one-time US$25) | publishing on Google Play |
| Later: Apple Developer Program (US$99 per year) | any iPhone build, and the App Store |

```bash
npm ci        # install exactly what package-lock.json lists
```

## 2. The three kinds of build

| Profile | For | What you get | Talks to |
| --- | --- | --- | --- |
| `development` | working on the app's code | an APK with a developer menu; it loads the app's code from your computer | the live website |
| `preview` | testing a finished version, sharing with testers | an APK that works on its own, like the real app | the live website |
| `production` | the stores | Android: an `.aab` for Google Play; iOS: an `.ipa` for the App Store | the live website |

Build commands (the result appears on expo.dev, with a QR code and a download link):

```bash
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform android
```

A new development build is only needed when native parts change: a new package with native
code, `app.config.ts`, icons, splash screen, or Expo SDK upgrades. Changes to `src/` and
`App.tsx` don't need one (see section 3).

Installing an APK on a phone: open the build's link on the phone, download it, and allow
"install unknown apps" for the browser when Android asks. Installing a new build over the old
one keeps the student logged in, as long as it was signed with the same key (EAS always uses
the same one).

## 3. Everyday development

1. Install the latest `development` build on the phone (section 2), once.
2. On the computer, start the code server:

   ```bash
   npm start
   ```

3. Open UniFlow on the phone, and pick the computer from the list (same Wi-Fi), or scan the
   QR code shown in the terminal.
4. Saving a file reloads the app. Shake the phone for the developer menu.

Expo Go (the store app) can't be used: it can't receive push notifications, and it lacks
this app's native settings.

### Before every commit

```bash
npm run check    # typecheck + lint + tests
npm run doctor   # Expo's dependency and config check
```

Add packages with `npx expo install <package>`, never `npm install <package>`: it picks the
version that matches the Expo SDK.

## 4. Credentials: what lives where

None of these are ever in this repository, in a commit, or in a log. `.gitignore` already
excludes the usual file names.

| Credential | Where it lives | Used for |
| --- | --- | --- |
| `google-services.json` (Firebase) | EAS environment variable `GOOGLE_SERVICES_JSON` (file, sensitive) in development, preview and production; a local copy may sit in the project folder, git-ignored | lets Android phones get a push address |
| FCM V1 service account key | expo.dev → project → Credentials → Android | lets Expo deliver to Android phones |
| Android signing key (keystore) | expo.dev → project → Credentials → Android (made by EAS on the first build) | signs every Android build; **never delete it**, or installed apps can't be updated |
| Expo access token for the backend | Render → uniflow-api → Environment → `EXPO_ACCESS_TOKEN` | lets the backend send pushes; required because enhanced push security is on |
| Google Play service account key | expo.dev → Credentials → Android → "Google service account key for EAS Submit" | `eas submit` to Google Play (section 5) |
| Apple certificates, provisioning profiles, APNs key | expo.dev → project → Credentials → iOS (made by EAS) | iPhone builds and pushes (section 6) |

The Expo project ID and owner in `app.config.ts` are public identifiers, not secrets.

If a credential leaks: revoke it where it was created (Firebase, Expo, Google Cloud, Apple),
create a new one, and replace it in the place listed above.

## 5. Publishing on Google Play

One-time setup:

1. Create a Google Play Developer account at play.google.com/console.
2. In Play Console, **Create app**: name UniFlow, free, app.
3. Create a Google service account key for uploads (Expo's guide:
   https://docs.expo.dev/submit/android/) and add it to EAS:

   ```bash
   npx eas-cli@latest credentials --platform android
   ```

   Choose the production profile, then the Play Store submission key.
4. Fill in Play Console's store listing and policy forms: description, screenshots, privacy
   policy URL, data safety (the website's account data, plus each phone's push address,
   kept by the backend to send notifications), content rating, target audience.

Each release:

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android
```

The build goes to the **internal testing** track as a draft. Check it there, then promote it
to production in Play Console. Nothing reaches students until you do that.

## 6. iPhone (when there is an Apple Developer account)

The app's iOS settings are ready (bundle ID `io.github.abcd001100.uniflow`, camera and photo
permission texts, push). Nothing has been built or tested on iOS yet.

1. Join the Apple Developer Program.
2. Build. EAS signs in to Apple, creates the certificate and provisioning profile, and asks
   whether to set up a **push notifications key**: answer yes.

   ```bash
   npx eas-cli@latest build --profile production --platform ios
   ```

   For testing on your own iPhone first, register it and build a development or preview
   version:

   ```bash
   npx eas-cli@latest device:create
   npx eas-cli@latest build --profile development --platform ios
   ```

3. Create the app in App Store Connect, then add its Apple ID to `eas.json`:

   ```json
   "submit": { "production": { "ios": { "ascAppId": "<App Store Connect app ID>" } } }
   ```

4. Send it to TestFlight, test, then submit for review in App Store Connect:

   ```bash
   npx eas-cli@latest submit --profile production --platform ios
   ```

   Apple reviews web-wrapper apps closely. UniFlow's app adds native push, the app icon
   badge, notification taps that open the right page, and an offline screen; mention these
   in the review notes, plus a test student login.

## 7. Versions

- `version` in `app.config.ts` (now `1.0.0`) is what students see. Raise it for each store
  release: `1.0.1` for fixes, `1.1.0` for new features.
- The build number (Android `versionCode`, iOS `buildNumber`) is kept by EAS and goes up by
  itself on every production build (`appVersionSource: remote`, `autoIncrement`). Never set it
  by hand.

There are no over-the-air updates (`expo-updates` isn't installed). Most changes students see
come from the website, which updates the moment it is deployed, with no new app build. A new
build is needed only for changes to the app itself.

## 8. Changing the website address

The address comes from `UNIFLOW_WEB_ORIGIN` in `eas.json` (the `base` profile), with
`https://uni-flow-inky.vercel.app` as the default. It must be `https://`; only development
builds may use `http://` (for a website running on your computer). After changing it, make a
new build. Push addresses don't change.

## 9. Troubleshooting

| Problem | Cause and fix |
| --- | --- |
| `npx expo run:android` fails on Windows with a long-path or ninja error | Windows' 260-character path limit. Build on EAS instead (section 2). |
| An EAS build fails at `npm ci` with missing `@emnapi/...` | npm version mismatch. `eas.json` pins Node 24.13.0 (npm 11) for this; keep it. |
| No push address in a build | `GOOGLE_SERVICES_JSON` missing from that EAS environment, or notifications not allowed on the phone. |
| Expo's push tool says the request is unauthorized | Enhanced push security is on: every send needs the Expo access token. |
| The app shows "can't reach UniFlow" | The phone is offline (it retries by itself), or the website or backend is down. Render's free plan can take a minute to wake up. |
| An `android/` or `ios/` folder appears | Made by a local `expo run`. It's generated and git-ignored; never edit it. Delete it if in doubt. |
| A build installs but the old app was "not updated" | It was signed with a different key: always build on EAS with the same project. |
