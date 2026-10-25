import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'

import { EAS_PROJECT_ID, IS_EXPO_GO } from '../config'
import { ensureChannels } from './channels'
import { pathFromPushData } from './payload'
import type { PushDeps } from './registration'

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

export function onPushTokenChange(listener: () => void) {
  const subscription = Notifications.addPushTokenListener(listener)
  return () => subscription.remove()
}
