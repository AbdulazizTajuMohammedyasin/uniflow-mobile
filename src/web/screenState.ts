/**
 * What the app shows over or instead of the website:
 * - loading: the first page (or a retry) is on its way; the WebView is covered;
 * - ready: the website is showing (later page changes show the website's own loading);
 * - error: the page couldn't load; a native screen offers Retry.
 */

export type LoadErrorKind = 'offline' | 'unreachable' | 'server'

export type ScreenState =
  | { phase: 'loading' }
  | { phase: 'ready' }
  | { phase: 'error'; error: LoadErrorKind }

export type ScreenAction =
  | { type: 'loaded' }
  | { type: 'failed'; error: LoadErrorKind }
  | { type: 'retry' }

export const initialScreenState: ScreenState = { phase: 'loading' }

export function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
  switch (action.type) {
    case 'loaded':
      // A failed page still "finishes loading" (the WebView's own error page): keep the error.
      return state.phase === 'error' ? state : { phase: 'ready' }
    case 'failed':
      return { phase: 'error', error: action.error }
    case 'retry':
      return { phase: 'loading' }
  }
}

// Not real failures: a navigation the app itself stopped (an outside link, a blocked
// address), or one replaced by a newer navigation.
const IGNORED_ERRORS = [
  { domain: 'NSURLErrorDomain', code: -999 }, // iOS: cancelled
  { domain: 'WebKitErrorDomain', code: 102 }, // iOS: frame load interrupted
  { domain: 'WebKitErrorDomain', code: 101 }, // iOS: the address can't be shown
  { domain: undefined, code: -3 }, // Android: ERROR_UNSUPPORTED_SCHEME
]

/** The error to show for a failed page load, or null to ignore it. */
export function classifyLoadError(
  { code, domain }: { code: number; domain?: string },
  isConnected: boolean | null,
): LoadErrorKind | null {
  if (IGNORED_ERRORS.some((ignored) => ignored.code === code && (ignored.domain ?? domain) === domain)) {
    return null
  }
  return isConnected === false ? 'offline' : 'unreachable'
}

/** A page answered with an HTTP error: only server failures (5xx) replace the website, since
 * the website shows its own "not found" and permission pages. */
export function classifyHttpError(statusCode: number): LoadErrorKind | null {
  return statusCode >= 500 ? 'server' : null
}

export type PageLayout = { bottomBar: boolean; insetBottom: number }
export type Edge = 'top' | 'right' | 'bottom' | 'left'

/**
 * Which phone edges the app keeps clear around the website. The bottom is left to the page
 * when it has its own bottom bar that already makes room for the system bar (it sees a
 * non-zero inset); otherwise the same space would appear twice, a gap under the bar.
 */
export function safeAreaEdges(layout: PageLayout | null): Edge[] {
  const pageOwnsBottom = layout !== null && layout.bottomBar && layout.insetBottom > 0
  return pageOwnsBottom ? ['top', 'left', 'right'] : ['top', 'right', 'bottom', 'left']
}

/** Android Back: go back in the website if possible, otherwise let the system leave the app.
 * Returns true when the app handled it. */
export function handleBack(canGoBack: boolean, goBack: () => void): boolean {
  if (!canGoBack) return false
  goBack()
  return true
}
