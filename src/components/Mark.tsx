import { StyleSheet, View } from 'react-native'

import { COLORS } from '../theme'

/** UniFlow's mark, as on the website (frontend/src/components/Wordmark.tsx): a rounded lime
 * square with two ink lines, like a short list. Decorative. */
export function Mark({ size = 56 }: { size?: number }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.square,
        {
          width: size,
          height: size,
          borderRadius: size * (0.3 / 1.1),
          paddingHorizontal: size * (0.24 / 1.1),
          gap: size * (0.14 / 1.1),
        },
      ]}
    >
      {[0, 1].map((line) => (
        <View key={line} style={[styles.line, { height: size * (0.11 / 1.1) }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  square: { backgroundColor: COLORS.light.primary, justifyContent: 'center' },
  line: { backgroundColor: COLORS.light.primaryForeground, borderRadius: 999 },
})
