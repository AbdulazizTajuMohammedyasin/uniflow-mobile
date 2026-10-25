import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { Palette } from '../theme'
import { Button } from './Button'

/**
 * Explains notifications before the system question, so the student knows what they are
 * agreeing to. "Not now" (or Back, or tapping outside) never shows the system question,
 * which keeps it available for later.
 */
export function PushOffer({
  visible,
  palette,
  onAccept,
  onDecline,
}: {
  visible: boolean
  palette: Palette
  onAccept: () => void
  onDecline: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDecline} accessibilityLabel="Not now" />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: 24 + insets.bottom },
          ]}
        >
          <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>
            Hear about class changes right away
          </Text>
          <Text style={[styles.body, { color: palette.mutedForeground }]}>
            UniFlow can notify you when one of your classes changes, when something needs you, and with your daily
            digest. Only what UniFlow would show you anyway; never every group message.
          </Text>
          <Text style={[styles.body, { color: palette.mutedForeground }]}>
            You can turn them off at any time in your phone’s settings.
          </Text>
          <View style={styles.actions}>
            <Button label="Turn on notifications" onPress={onAccept} palette={palette} />
            <Button label="Not now" onPress={onDecline} palette={palette} variant="plain" />
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 12,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  actions: { gap: 10, marginTop: 12 },
})
