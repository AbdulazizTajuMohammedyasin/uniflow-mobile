import { isCalendarDate, safeInAppPath } from '../web/routes'

/**
 * What a UniFlow push notification carries, and which page a tap opens.
 *
 * The server sends the alert's target (as on the website's notifications page), never a
 * URL or path, and the app works the page out itself, the same way the website does
 * (notificationLink in frontend/src/lib/notifications.ts):
 *   { v: 1, notification_id: 12, target_type: 'insight', target_id: 42 } -> /insights/42
 *   { v: 1, target_type: 'digest', target_id: 20261009 }   -> /digest?date=2026-10-09
 * A UniFlow alert without a usable target opens /notifications. Anything else is ignored.
 */

export const PAYLOAD_VERSION = 1

function positiveInteger(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : null
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value)) return Number(value)
  return null
}

/** The page for an alert's target, or null when it opens nothing. */
export function pathForTarget(targetType: unknown, targetId: unknown): string | null {
  const id = positiveInteger(targetId)
  if (id === null) return null
  if (targetType === 'insight') return safeInAppPath(`/insights/${id}`)
  if (targetType === 'digest') {
    const day = String(id)
    const date = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`
    return day.length === 8 && isCalendarDate(date) ? `/digest?date=${date}` : null
  }
  return null
}

/** The page to open for a tapped notification's data, or null if it isn't UniFlow's. */
export function pathFromPushData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
  const fields = data as Record<string, unknown>
  if (fields.v !== PAYLOAD_VERSION && fields.v !== String(PAYLOAD_VERSION)) return null
  return pathForTarget(fields.target_type, fields.target_id) ?? '/notifications'
}
