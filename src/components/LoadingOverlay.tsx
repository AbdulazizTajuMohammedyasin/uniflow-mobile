import { ActivityIndicator, StyleSheet, View } from 'react-native'

import type { Palette } from '../theme'
import { Mark } from './Mark'

/** Covers the WebView until the first page has loaded: the mark (as on the splash screen)
 * and a spinner. No made-up progress: the WebView can't know how long the server takes. */
export function LoadingOverlay({ palette }: { palette: Palette }) {
  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: palette.background }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading UniFlow"
    >
      <Mark size={96} />
      <ActivityIndicator style={styles.spinner} color={palette.mutedForeground} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  spinner: { position: 'absolute', bottom: '30%' },
})
