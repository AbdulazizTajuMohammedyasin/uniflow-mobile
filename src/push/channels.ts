import { AndroidImportance, setNotificationChannelAsync } from 'expo-notifications'
import { Platform } from 'react-native'

/**
 * Android notification channels: students can mute each one separately in the phone's
 * settings. The server picks one per alert kind (docs/backend-integration.md). Only a
 * channel's name and description can change once it exists, so the ids are permanent.
 */
export const CHANNELS = {
  classChanges: 'class-changes',
  needsYou: 'needs-you',
  digest: 'digest',
  general: 'general',
} as const

const LIME = '#8fcc2e'

export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Promise.all([
    setNotificationChannelAsync(CHANNELS.classChanges, {
      name: 'Class changes',
      description: 'A class of yours moved, was cancelled, or a change was taken back.',
      importance: AndroidImportance.HIGH,
      lightColor: LIME,
    }),
    setNotificationChannelAsync(CHANNELS.needsYou, {
      name: 'Needs you',
      description: 'You were named, something needs action, or an important update.',
      importance: AndroidImportance.HIGH,
      lightColor: LIME,
    }),
    setNotificationChannelAsync(CHANNELS.digest, {
      name: 'Daily digest',
      description: 'One evening summary of the day’s other updates.',
      importance: AndroidImportance.DEFAULT,
    }),
    setNotificationChannelAsync(CHANNELS.general, {
      name: 'From UniFlow',
      description: 'Other messages from UniFlow.',
      importance: AndroidImportance.DEFAULT,
    }),
  ])
}
