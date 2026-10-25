import { StyleSheet, Text, View } from 'react-native'

import type { LoadErrorKind } from '../web/screenState'
import type { Palette } from '../theme'
import { Button } from './Button'
import { Mark } from './Mark'

const MESSAGES: Record<LoadErrorKind | 'misconfigured', { title: string; body: string }> = {
  offline: {
    title: 'You’re offline',
    body: 'Connect to the internet and UniFlow will load again.',
  },
  unreachable: {
    title: 'Can’t reach UniFlow',
    body: 'UniFlow didn’t answer. If it hasn’t been used for a while it can take up to a minute to wake up.',
  },
  server: {
    title: 'UniFlow is having trouble',
    body: 'Something went wrong on UniFlow’s side. Try again in a moment.',
  },
  misconfigured: {
    title: 'This build can’t open UniFlow',
    body: 'The website address in this build isn’t valid. Install the latest version of the app.',
  },
}

export function ErrorScreen({
  kind,
  palette,
  onRetry,
}: {
  kind: LoadErrorKind | 'misconfigured'
  palette: Palette
  onRetry?: () => void
}) {
  const { title, body } = MESSAGES[kind]
  return (
    <View style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: palette.background }]}>
      <View style={styles.content}>
        <Mark size={48} />
        <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>
          {title}
        </Text>
        <Text style={[styles.body, { color: palette.mutedForeground }]}>{body}</Text>
        {onRetry && <Button label="Try again" onPress={onRetry} palette={palette} />}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', paddingHorizontal: 24 },
  content: { alignItems: 'center', gap: 12, maxWidth: 420, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  body: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 12 },
})
