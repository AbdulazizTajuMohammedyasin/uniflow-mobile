import { parseHttpUrl, schemeOf } from './url'

/**
 * What happens when the WebView is about to open an address:
 * - UniFlow's own pages load inside the app;
 * - other HTTPS pages (a WhatsApp or Telegram source link), email and phone links open in
 *   the app made for them;
 * - everything else is blocked: plain HTTP, javascript:, data:, file:, intent:, unknown
 *   schemes, and other websites inside frames.
 */
export type NavigationDecision =
  | { action: 'load' }
  | { action: 'open-externally'; url: string }
  | { action: 'block'; reason: string }

const EXTERNAL_SCHEMES = new Set(['mailto', 'tel'])
// Empty frames that WebKit and Chromium create on their own; they contain nothing.
const EMPTY_DOCUMENTS = new Set(['about:blank', 'about:srcdoc'])

export function decideNavigation(
  url: string,
  { webOrigin, isTopFrame = true }: { webOrigin: string; isTopFrame?: boolean },
): NavigationDecision {
  if (typeof url !== 'string' || url === '') return { action: 'block', reason: 'empty' }
  if (EMPTY_DOCUMENTS.has(url)) return { action: 'load' }

  const scheme = schemeOf(url)
  if (scheme === 'http' || scheme === 'https') {
    const parsed = parseHttpUrl(url)
    if (!parsed) return { action: 'block', reason: 'invalid-url' }
    if (parsed.origin === webOrigin) return { action: 'load' }
    // A frame from another site must never open a browser by itself.
    if (!isTopFrame) return { action: 'block', reason: 'foreign-frame' }
    if (parsed.scheme !== 'https') return { action: 'block', reason: 'insecure' }
    return { action: 'open-externally', url }
  }

  if (scheme && EXTERNAL_SCHEMES.has(scheme) && isTopFrame) {
    return { action: 'open-externally', url }
  }
  return { action: 'block', reason: scheme ? `scheme:${scheme}` : 'invalid-url' }
}
