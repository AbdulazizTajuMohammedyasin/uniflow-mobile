import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { EAS_PROJECT_ID, IS_EXPO_GO } from '../config'
import { ensureChannels } from './channels'
import { pathFromPushData } from './payload'
import { tokenChangeFilter, type PushDeps } from './registration'

/** The real phone, for the rules in registration.ts. */
export const nativePushDeps: PushDeps = {
  isDevice: Device.isDevice,
  isExpoGo: IS_EXPO_GO, // Expo Go can't receive remote notifications (SDK 53+ on Android)
  projectId: EAS_PROJECT_ID,
  getPermissions: () => Notifications.getPermissionsAsync(),
  requestPermissions: () => Notifications.requestPermissionsAsync(),
  getExpoPushToken: async (projectId) => (await Notifications.getExpoPushTokenAsync({ projectId })).data,
  ensureChannels,
}

/** While the app is open, UniFlow's alerts still show as a banner: they are the ones that
 * matter right now (class changes, things that need the student). */
export function configureForegroundNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

// A tap can be reported twice (at launch and by the listener): each one is opened once.
const handledTaps = new Set<string>()

/** The page a tapped notification opens, once per tap. Null for anything else. */
export function pathFromTap(response: Notifications.NotificationResponse | null): string | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null
  const id = response.notification.request.identifier
  if (handledTaps.has(id)) return null
  handledTaps.add(id)
  void Notifications.clearLastNotificationResponseAsync().catch(() => undefined)
  return pathFromPushData(response.notification.request.content.data)
}

/** The tap that launched the app, if any. */
export async function launchTapPath(): Promise<string | null> {
  try {
    return pathFromTap(await Notifications.getLastNotificationResponseAsync())
  } catch {
    return null
  }
}

/** Taps while the app is running (in the foreground or the background). */
export function onNotificationTap(open: (path: string) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const path = pathFromTap(response)
    if (path) open(path)
  })
  return () => subscription.remove()
}

/**
 * Keeps the app icon in step with the website's unread alerts.
 * - iOS: the icon shows exactly that number.
 * - Android: there is no standard way to set a number (launchers count, or dot, the
 *   notifications in the shade), and expo-notifications' setBadgeCountAsync(0) removes all
 *   of the app's notifications. So nothing is set while there are unread alerts; once there
 *   are none (all read, or logged out) UniFlow's notifications leave the shade, and with
 *   them the icon's number or dot.
 */
export function syncAppBadge(unread: number) {
  if (Platform.OS === 'ios') {
    void Notifications.setBadgeCountAsync(unread).catch(() => undefined)
  } else if (unread === 0) {
    void Notifications.dismissAllNotificationsAsync().catch(() => undefined)
  }
}

/** Calls `listener` when the system gives this phone a new push token. Android also reports
 * the current token every time the app asks for its address, so only a different token
 * counts; otherwise asking again would report again, endlessly. */
export function onPushTokenChange(listener: () => void) {
  const changed = tokenChangeFilter()
  const subscription = Notifications.addPushTokenListener((token) => {
    if (changed(String(token.data))) listener()
  })
  return () => subscription.remove()
}
