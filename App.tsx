import * as SplashScreen from 'expo-splash-screen'
import { useColorScheme, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AppScreen } from './src/AppScreen'
import { ErrorScreen } from './src/components/ErrorScreen'
import { WEB_ORIGIN } from './src/config'
import { configureForegroundNotifications } from './src/push/native'
import { paletteFor } from './src/theme'

// The splash stays until the first frame is drawn; from then the app's own loading screen
// (the same mark, plus a spinner) covers the website until it has loaded.
void SplashScreen.preventAutoHideAsync().catch(() => undefined)
configureForegroundNotifications()

export default function App() {
  const palette = paletteFor(useColorScheme() === 'dark')
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: palette.background }} onLayout={() => void SplashScreen.hideAsync()}>
        {WEB_ORIGIN ? <AppScreen webOrigin={WEB_ORIGIN} /> : <ErrorScreen kind="misconfigured" palette={palette} />}
      </View>
    </SafeAreaProvider>
  )
}
