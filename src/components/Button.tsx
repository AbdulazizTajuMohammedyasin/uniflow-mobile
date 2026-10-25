import { Pressable, StyleSheet, Text } from 'react-native'

import type { Palette } from '../theme'

/** The website's two button styles: lime fill (main action) and plain (secondary). */
export function Button({
  label,
  onPress,
  palette,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  palette: Palette
  variant?: 'primary' | 'plain'
}) {
  const primary = variant === 'primary'
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: palette.primary }
          : { borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, { color: primary ? palette.primaryForeground : palette.foreground }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48, // a comfortable touch target
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  pressed: { opacity: 0.8 },
  label: { fontSize: 16, fontWeight: '600' },
})
