/**
 * Push permission and the phone's Expo push address. The native modules are passed in, so
 * the rules can be tested without a phone.
 *
 * Status:
 * - unsupported: a simulator, Expo Go, or a build without an EAS project (push can't work);
 * - undetermined: the app may ask;
 * - blocked: the student said no and the system won't show the question again;
 * - granted: allowed (on iOS, "provisional" counts: quiet notifications are allowed).
 */

export type PushStatus = 'unsupported' | 'undetermined' | 'blocked' | 'granted'

export type PermissionResponse = {
  granted: boolean
  canAskAgain: boolean
  ios?: { status?: number | null } | null
}

export type PushDeps = {
  isDevice: boolean
  isExpoGo: boolean
  projectId: string | undefined
  getPermissions(): Promise<PermissionResponse>
  requestPermissions(): Promise<PermissionResponse>
  getExpoPushToken(projectId: string): Promise<string>
  /** Android: notification channels must exist before asking (Android 13+). */
  ensureChannels(): Promise<void>
}

// Notifications.IosAuthorizationStatus.PROVISIONAL and EPHEMERAL
const IOS_QUIETLY_ALLOWED = new Set([3, 4])

export function statusFrom(response: PermissionResponse): Exclude<PushStatus, 'unsupported'> {
  if (response.granted) return 'granted'
  const iosStatus = response.ios?.status
  if (typeof iosStatus === 'number' && IOS_QUIETLY_ALLOWED.has(iosStatus)) return 'granted'
  return response.canAskAgain ? 'undetermined' : 'blocked'
}

export function isSupported(deps: Pick<PushDeps, 'isDevice' | 'isExpoGo' | 'projectId'>): boolean {
  return deps.isDevice && !deps.isExpoGo && Boolean(deps.projectId)
}

/** The current status, without asking the student anything. */
export async function readPushStatus(deps: PushDeps): Promise<PushStatus> {
  if (!isSupported(deps)) return 'unsupported'
  return statusFrom(await deps.getPermissions())
}

/** Shows the system question (only call this after the student chose "Turn on"). */
export async function requestPushPermission(deps: PushDeps): Promise<PushStatus> {
  if (!isSupported(deps)) return 'unsupported'
  await deps.ensureChannels()
  const current = statusFrom(await deps.getPermissions())
  if (current !== 'undetermined') return current // never ask again after a final "no"
  return statusFrom(await deps.requestPermissions())
}

export type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'unsupported' | 'not-allowed' | 'failed' }

/** The phone's Expo push address, if push is allowed. Never asks for permission. */
export async function fetchPushToken(deps: PushDeps): Promise<TokenResult> {
  if (!isSupported(deps) || !deps.projectId) return { ok: false, reason: 'unsupported' }
  if (statusFrom(await deps.getPermissions()) !== 'granted') return { ok: false, reason: 'not-allowed' }
  try {
    await deps.ensureChannels()
    return { ok: true, token: await deps.getExpoPushToken(deps.projectId) }
  } catch {
    // No network, or Firebase/APNs isn't set up for this build. Tried again next time the
    // app comes to the foreground. The error itself may contain device details: not logged.
    return { ok: false, reason: 'failed' }
  }
}

// --- When to offer notifications ------------------------------------------------------------

export type OfferRecord = { offers: number; lastOfferAt: number }

export const MAX_OFFERS = 2
export const OFFER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Offer notifications (the app's own explanation first, then the system question) only to
 * a logged-in student who hasn't decided yet: at most twice, a week apart. After the
 * system's "Don't allow" the app never asks again; the student can still turn them on in
 * the phone's settings.
 */
export function shouldOffer(
  status: PushStatus,
  record: OfferRecord,
  { signedIn, now }: { signedIn: boolean; now: number },
): boolean {
  if (!signedIn || status !== 'undetermined') return false
  if (record.offers >= MAX_OFFERS) return false
  return record.offers === 0 || now - record.lastOfferAt >= OFFER_INTERVAL_MS
}

export function parseOfferRecord(raw: string | null): OfferRecord {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null
    if (typeof value === 'object' && value !== null) {
      const { offers, lastOfferAt } = value as Record<string, unknown>
      if (Number.isInteger(offers) && typeof lastOfferAt === 'number') {
        return { offers: offers as number, lastOfferAt }
      }
    }
  } catch {
    // A damaged value counts as "never offered".
  }
  return { offers: 0, lastOfferAt: 0 }
}
