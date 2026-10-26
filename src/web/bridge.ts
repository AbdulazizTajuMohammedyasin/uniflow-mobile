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
  | { type: 'layout'; bottomBar: boolean; insetBottom: number }
  | { type: 'unread'; count: number }
  | { type: 'session'; signedIn: boolean }
  | { type: 'push-registration'; status: 'registered' | 'unregistered' | 'failed' }

const REGISTRATION_STATUSES = new Set(['registered', 'unregistered', 'failed'])
const MAX_INSET = 500 // CSS pixels; no phone's system bar comes close
const MAX_UNREAD = 9999

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
  if (
    type === 'layout' &&
    keys.length === 2 &&
    typeof fields.bottomBar === 'boolean' &&
    Number.isInteger(fields.insetBottom) &&
    (fields.insetBottom as number) >= 0 &&
    (fields.insetBottom as number) <= MAX_INSET
  ) {
    return { type, bottomBar: fields.bottomBar, insetBottom: fields.insetBottom as number }
  }
  if (
    type === 'unread' &&
    keys.length === 1 &&
    Number.isInteger(fields.count) &&
    (fields.count as number) >= 0 &&
    (fields.count as number) <= MAX_UNREAD
  ) {
    return { type, count: fields.count as number }
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
 * inside the app (window.UniFlowApp) and reports three things about the page:
 * - the number of unread alerts, read from the website's own badge (its accessible label,
 *   "3 unread"), so the app icon can follow it (see syncAppBadge); 0 on the login page,
 *   and nothing on pages that don't show the badge;
 * - light or dark (also when the student picks a theme on the website): the status bar
 *   and edges follow it;
 * - whether the page has its own bar along the bottom (the student pages' navigation), and
 *   the bottom safe-area inset the page sees. Android's WebView gives the page the system
 *   bar's height, and the website's bar already makes room for it
 *   (padding-bottom: env(safe-area-inset-bottom)), so the app must not add the same space
 *   again under it. Pages without such a bar keep the app's own space.
 *   The bar is found by what is drawn at the bottom of the screen (a fixed element, less
 *   than a third of the screen tall, touching the bottom), not by the website's class names.
 */
export function bootstrapScript(webOrigin: string, info: { platform: string; appVersion: string }): string {
  return `(function () {
  if (window.location.origin !== ${js(webOrigin)} || window.UniFlowApp) return;
  var app = { bridgeVersion: ${BRIDGE_VERSION}, platform: ${js(info.platform)}, appVersion: ${js(info.appVersion)}, pushToken: null };
  Object.defineProperty(window, 'UniFlowApp', { value: app, writable: false, configurable: false });
  function post(message) {
    if (!window.ReactNativeWebView) return;
    message.v = ${BRIDGE_VERSION};
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }

  var lastDark = null;
  function reportTheme() {
    var root = document.documentElement;
    if (!root) return;
    var dark = root.classList.contains('dark');
    if (dark === lastDark) return;
    lastDark = dark;
    post({ type: 'theme', dark: dark });
  }

  var lastLayout = null;
  var layoutPending = false;
  function insetBottom() {
    var probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(probe);
    var inset = Math.round(parseFloat(getComputedStyle(probe).paddingBottom) || 0);
    probe.remove();
    return Math.max(0, Math.min(inset, ${MAX_INSET}));
  }
  function hasBottomBar() {
    var element = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 1);
    for (; element && element !== document.body; element = element.parentElement) {
      var style = getComputedStyle(element);
      if (style.position !== 'fixed') continue;
      var box = element.getBoundingClientRect();
      return Math.abs(box.bottom - window.innerHeight) < 1 && box.height < window.innerHeight / 3;
    }
    return false;
  }
  function reportLayout() {
    var layout = { type: 'layout', bottomBar: hasBottomBar(), insetBottom: insetBottom() };
    var key = layout.bottomBar + ':' + layout.insetBottom;
    if (key === lastLayout) return;
    lastLayout = key;
    post(layout);
  }

  var lastUnread = null;
  function unreadCount() {
    if (/^\\/login(\\/|$)/.test(window.location.pathname)) return 0; // logged out: no badge
    // Only the student pages show the count; elsewhere it is unknown, not zero.
    if (!document.querySelector('a[href="/notifications"]')) return null;
    var count = 0;
    var badges = document.querySelectorAll('[aria-label$=" unread"]');
    for (var i = 0; i < badges.length; i++) {
      var match = /^(\\d+) unread$/.exec(badges[i].getAttribute('aria-label') || '');
      if (match) count = Math.max(count, Number(match[1]));
    }
    return Math.min(count, ${MAX_UNREAD});
  }
  function reportUnread() {
    var count = unreadCount();
    if (count === null || count === lastUnread) return;
    lastUnread = count;
    post({ type: 'unread', count: count });
  }

  function report() {
    layoutPending = false;
    if (!document.body) return;
    reportLayout();
    reportUnread();
  }
  function scheduleLayout() {
    if (layoutPending) return;
    layoutPending = true;
    window.requestAnimationFrame(report);
  }

  if (document.documentElement) {
    new MutationObserver(reportTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  // The app asks again after every page load (see frameRefreshScript), in case a report got
  // lost: the answer is sent even if nothing changed here.
  Object.defineProperty(app, 'reportFrame', {
    value: function () {
      lastDark = null;
      lastLayout = null;
      lastUnread = null;
      reportTheme();
      scheduleLayout();
    },
  });
  function start() {
    reportTheme();
    // Page changes inside the website (React) replace parts of the page, and a new unread
    // count only edits the badge's text and label: check again on any of these.
    new MutationObserver(scheduleLayout).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    window.addEventListener('resize', scheduleLayout);
    scheduleLayout();
  }
  // Android can run this script late for a page restored by Back, after the page has
  // loaded: then DOMContentLoaded has already happened and won't come again.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
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

/** Asks the page to report its theme and layout again (after each page load, in case a
 * report got lost). */
export function frameRefreshScript(webOrigin: string): string {
  return `(function () {
  if (window.location.origin !== ${js(webOrigin)} || !window.UniFlowApp || !window.UniFlowApp.reportFrame) return;
  window.UniFlowApp.reportFrame();
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
