import { existsSync } from 'node:fs'

import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * UniFlow's app configuration. Everything here is public (it ships inside the app), so no
 * secrets: Firebase and Apple credentials live in EAS (docs/setup.md).
 *
 * Environment (all optional):
 * - APP_VARIANT=development   development builds (`eas build --profile development`); only
 *                             these may point at a plain-HTTP website on a laptop
 * - UNIFLOW_WEB_ORIGIN        the website, default https://uni-flow-inky.vercel.app
 * - EAS_PROJECT_ID            set once with `eas init` (see docs/setup.md)
 * - GOOGLE_SERVICES_JSON      path to google-services.json (an EAS file variable on EAS)
 */

const DEFAULT_WEB_ORIGIN = 'https://uni-flow-inky.vercel.app'
const APP_ID = 'io.github.abcd001100.uniflow' // permanent: the stores identify the app by it

const PAPER = '#f5f5eb'
const NIGHT = '#121210'
const LIME = '#8fcc2e'

export default ({ config }: ConfigContext): ExpoConfig => {
  const isDevelopment = process.env.APP_VARIANT === 'development'
  const webOrigin = (process.env.UNIFLOW_WEB_ORIGIN ?? DEFAULT_WEB_ORIGIN).replace(/\/$/, '')
  if (!webOrigin.startsWith('https://') && !isDevelopment) {
    throw new Error('UNIFLOW_WEB_ORIGIN must use https:// outside development builds.')
  }
  const projectId = process.env.EAS_PROJECT_ID
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'

  return {
    ...config,
    name: 'UniFlow',
    slug: 'uniflow',
    scheme: 'uniflow',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
    backgroundColor: PAPER,
    ios: {
      bundleIdentifier: APP_ID,
      supportsTablet: false,
      infoPlist: {
        // The timetable import lets students pick a photo or take one of a printed timetable.
        NSCameraUsageDescription: 'Take a photo of your timetable to add your classes.',
        NSPhotoLibraryUsageDescription: 'Choose a photo of your timetable to add your classes.',
        ITSAppUsesNonExemptEncryption: false, // only the system's standard HTTPS
      },
    },
    android: {
      package: APP_ID,
      adaptiveIcon: {
        foregroundImage: './assets/android-icon-foreground.png',
        monochromeImage: './assets/android-icon-monochrome.png',
        backgroundColor: LIME,
      },
      softwareKeyboardLayoutMode: 'resize',
      // The app handles Back itself (WebView history first), so the system's predictive
      // animation would preview the wrong thing.
      predictiveBackGestureEnabled: false,
      // Without Firebase's file the app still runs; it just can't get a push address.
      ...(existsSync(googleServicesFile) ? { googleServicesFile } : {}),
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 96,
          resizeMode: 'contain',
          backgroundColor: PAPER,
          dark: { image: './assets/splash-icon.png', backgroundColor: NIGHT },
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: LIME,
          defaultChannel: 'general',
        },
      ],
    ],
    extra: {
      webOrigin,
      ...(projectId ? { eas: { projectId } } : {}),
    },
  }
}
