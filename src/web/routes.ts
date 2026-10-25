import { pathOnOrigin, schemeOf } from './url'

/**
 * The website pages the app may be asked to open from outside (a notification, a
 * uniflow:// link). Anything else opens the home page instead. These match the website's
 * routes (frontend/src/router.tsx in the web repository).
 */
const PAGES = [
  /^\/$/,
  /^\/insights\/[1-9]\d{0,15}$/,
  /^\/timetable$/,
  /^\/notifications$/,
  /^\/digest$/,
  /^\/search$/,
  /^\/sources$/,
  /^\/profile$/,
]

/** Is 'YYYY-MM-DD' a real calendar day? */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** `path` if it is one of the pages above (with a trailing slash removed), else null. Only
 * the digest takes a query: `?date=YYYY-MM-DD`. Fragments are dropped. */
export function safeInAppPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null
  if (path.length > 200) return null
  const [withoutFragment = ''] = path.split('#', 1)
  const [rawPathname = '', query = '', ...extra] = withoutFragment.split('?')
  if (extra.length) return null
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/$/, '') : rawPathname
  if (!PAGES.some((page) => page.test(pathname))) return null

  if (pathname === '/digest' && query) {
    const date = /^date=(.*)$/.exec(query)?.[1]
    return date && isCalendarDate(date) ? `/digest?date=${date}` : null
  }
  return query ? null : pathname
}

/**
 * The page a link into the app asks for: `uniflow://insights/42` or a link to the website
 * itself (`https://<website>/insights/42`). Null for anything else, including links that
 * Expo's development client uses.
 */
export function pathFromAppLink(url: unknown, webOrigin: string): string | null {
  if (typeof url !== 'string') return null
  if (schemeOf(url) === 'uniflow') {
    // uniflow://insights/42 and uniflow:///insights/42 both mean /insights/42.
    const rest = url.slice('uniflow:'.length).replace(/^\/+/, '')
    return safeInAppPath(`/${rest}`)
  }
  const path = pathOnOrigin(url, webOrigin)
  return path === null ? null : safeInAppPath(path)
}

// Pages a visitor sees before logging in, and onboarding (logged in, but not finished).
const SIGNED_OUT_PREFIXES = [
  '/login',
  '/register',
  '/privacy',
  '/verify-email/',
  '/forgot-password',
  '/reset-password/',
  '/onboarding',
]

/**
 * A best guess from the page alone: is a student logged in and past onboarding? The website
 * sends logged-out visitors to /login, so being on any other page means they are. Used to
 * pick the moment to offer notifications until the website tells the app itself.
 */
export function looksSignedIn(path: string | null): boolean {
  if (path === null) return false
  const [pathname = ''] = path.split(/[?#]/, 1)
  if (pathname.startsWith('/staff')) return false // staff don't get student alerts
  return !SIGNED_OUT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`),
  )
}
