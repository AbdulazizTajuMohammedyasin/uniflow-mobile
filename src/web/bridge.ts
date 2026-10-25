import { parseHttpUrl } from './url'

/**
 * The small, one-purpose channel between the app and the UniFlow website.
 *
 * Nothing secret ever crosses it: no passwords, no access or refresh tokens. The website
 * keeps doing its own login; the app only hands it the phone's Expo push address so the
 * website can register it with its own (in-memory) access token, and the page tells the
 * app a few harmless facts (light or dark, logged in or not, whether registration worked).
 *
 * Every script checks it is running on UniFlow's origin, and every message is accepted only
 * from UniFlow's origin, in a fixed shape, and at most 1 KB.
 * The contract is documented in docs/backend-integration.md.
 */

export const BRIDGE_VERSION = 1
const MAX_MESSAGE_BYTES = 1024

export type PageMessage =
  | { type: 'theme'; dark: boolean }
  | { type: 'session'; signedIn: boolean }
  | { type: 'push-registration'; status: 'registered' | 'unregistered' | 'failed' }

const REGISTRATION_STATUSES = new Set(['registered', 'unregistered', 'failed'])

/** A message from the page, or null if it isn't one UniFlow's website may send. */
export function parsePageMessage(data: unknown, fromUrl: string, webOrigin: string): PageMessage | null {
  if (typeof data !== 'string' || data.length > MAX_MESSAGE_BYTES) return null
  if (parseHttpUrl(fromUrl)?.origin !== webOrigin) return null

  let message: unknown
  try {
    message = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) return null
  const { v, type, ...fields } = message as Record<string, unknown>
  if (v !== BRIDGE_VERSION) return null
  const keys = Object.keys(fields)

  if (type === 'theme' && keys.length === 1 && typeof fields.dark === 'boolean') {
    return { type, dark: fields.dark }
  }
  if (type === 'session' && keys.length === 1 && typeof fields.signedIn === 'boolean') {
    return { type, signedIn: fields.signedIn }
  }
  if (
    type === 'push-registration' &&
    keys.length === 1 &&
    typeof fields.status === 'string' &&
    REGISTRATION_STATUSES.has(fields.status)
  ) {
    return { type, status: fields.status as 'registered' | 'unregistered' | 'failed' }
  }
  return null
}

/** Expo push addresses look like ExponentPushToken[xxxxxxxx]. */
export function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/.test(value)
}

// Values go into scripts only through JSON.stringify, never by pasting strings together.
const js = (value: unknown) => JSON.stringify(value)

/**
 * Runs before the website's own scripts on every page load. It tells the website it is
 * inside the app (window.UniFlowApp) and reports light/dark mode, so the app's status bar
 * and edges match the page even when the student picks a theme on the website.
 */
export function bootstrapScript(webOrigin: string, info: { platform: string; appVersion: string }): string {
  return `(function () {
  if (window.location.origin !== ${js(webOrigin)} || window.UniFlowApp) return;
  var app = { bridgeVersion: ${BRIDGE_VERSION}, platform: ${js(info.platform)}, appVersion: ${js(info.appVersion)}, pushToken: null };
  Object.defineProperty(window, 'UniFlowApp', { value: app, writable: false, configurable: false });
  var lastDark = null;
  function reportTheme() {
    var root = document.documentElement;
    if (!root || !window.ReactNativeWebView) return;
    var dark = root.classList.contains('dark');
    if (dark === lastDark) return;
    lastDark = dark;
    window.ReactNativeWebView.postMessage(JSON.stringify({ v: ${BRIDGE_VERSION}, type: 'theme', dark: dark }));
  }
  if (document.documentElement) {
    new MutationObserver(reportTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  document.addEventListener('DOMContentLoaded', reportTheme);
})();
true;`
}

/** Gives the page the phone's push address (or null when there is none), and tells it with
 * a 'uniflow:push-token' event. The website decides whether to register it. */
export function pushTokenScript(webOrigin: string, token: string | null, platform: string): string {
  const value = isExpoPushToken(token) ? token : null
  return `(function () {
  if (window.location.origin !== ${js(webOrigin)} || !window.UniFlowApp) return;
  window.UniFlowApp.pushToken = ${js(value)};
  window.dispatchEvent(new CustomEvent('uniflow:push-token', { detail: { token: ${js(value)}, platform: ${js(platform)} } }));
})();
true;`
}

/** Opens a UniFlow page (already checked with safeInAppPath) in the current WebView. */
export function navigateScript(webOrigin: string, path: string): string {
  return `(function () {
  if (window.location.origin !== ${js(webOrigin)}) return;
  window.location.assign(${js(webOrigin + path)});
})();
true;`
}
