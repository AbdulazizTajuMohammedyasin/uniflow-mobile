# Development, builds and release

## Requirements

- Node.js 24 (EAS builds pin `24.13.0` in `eas.json`)
- An Expo account with access to the `@abdulaziztaju/uniflow` project, and
  `npx eas-cli@latest login`
- An Android device or emulator. iOS needs an Apple Developer Program membership.

Expo Go is not supported: it can't receive remote notifications and lacks the app's native
configuration. Development runs in a development build.

## Scripts

| Command | |
| --- | --- |
| `npm ci` | install dependencies |
| `npm start` | Metro for the development build |
| `npm run check` | typecheck, lint and tests |
| `npm run doctor` | Expo dependency and config checks |
| `npx expo install <pkg>` | add a dependency at the version matching the SDK |
| `node scripts/generate-icons.mjs` | regenerate the icon, adaptive icon, splash and notification icon |

## Build profiles

Builds run on EAS. `android/` and `ios/` are generated (Continuous Native Generation) and
git-ignored.

| Profile | Output | Use |
| --- | --- | --- |
| `development` | APK with `expo-dev-client` | day-to-day work against Metro |
| `development-simulator` | iOS simulator build | iOS development without a device |
| `preview` | standalone APK, internal distribution | QA and sideloaded installs |
| `production` | AAB / IPA, auto-incremented build number | store submission |

```bash
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile preview --platform android
npx eas-cli@latest build --profile production --platform android
```

A new development build is needed only when native configuration changes (`app.config.ts`,
assets, plugins, packages with native code, SDK upgrades). JavaScript changes reload from
Metro.

## Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `UNIFLOW_WEB_ORIGIN` | `eas.json` (`base` profile) | the website the app wraps; must be `https://` outside development builds |
| `APP_VARIANT=development` | `eas.json` (`development` profile) | allows a plain-HTTP origin for a local website |
| `GOOGLE_SERVICES_JSON` | EAS file variable (sensitive), all environments | Firebase config for Android push; a local, git-ignored `google-services.json` is used otherwise |

## Credentials

Nothing secret is in the repository. `app.config.ts` holds only public identifiers
(bundle ID, EAS project ID).

| Credential | Stored in |
| --- | --- |
| Android upload keystore | EAS (generated on the first build). Losing it breaks updates for installed apps. |
| FCM V1 service account key | EAS → Credentials → Android |
| Google Play service account key | EAS → Credentials → Android (for `eas submit`) |
| iOS certificates, provisioning profiles, APNs key | EAS → Credentials → iOS (generated on the first iOS build) |
| Expo access token for sending pushes | backend environment (`EXPO_ACCESS_TOKEN`); required, since enhanced push security is on |

## Release

### Android

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android
```

`eas submit` uploads to the Play Console internal testing track; promotion to production
happens in the Play Console. Prerequisites: a Play Console app for
`io.github.abcd001100.uniflow` and a service account key in EAS
([Expo guide](https://docs.expo.dev/submit/android/)).

The `preview` APK can also be distributed directly.

### iOS

The iOS configuration is in place (bundle ID, permission strings, export compliance, push)
but has not been built yet.

```bash
npx eas-cli@latest build --profile production --platform ios   # creates certificates and the APNs key
npx eas-cli@latest submit --profile production --platform ios  # TestFlight
```

`eas submit` needs the App Store Connect app ID as `submit.production.ios.ascAppId` in
`eas.json`.

### Versioning

`version` in `app.config.ts` is the user-facing version. Build numbers are managed remotely
by EAS (`appVersionSource: remote`) and incremented on each production build.

There are no over-the-air updates (`expo-updates` is not installed). Changes to the website
ship with the website; an app release is needed only for native or app-shell changes.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `expo run:android` fails on Windows with ninja path errors | the 260-character path limit; build on EAS |
| EAS `npm ci` fails on missing `@emnapi/*` | npm 10 vs. the npm 11 lockfile; keep `node: 24.13.0` in `eas.json` |
| no push token on Android | `GOOGLE_SERVICES_JSON` missing in that EAS environment, or notifications not allowed |
| pushes rejected with an authorization error | enhanced push security is on; send with `EXPO_ACCESS_TOKEN` |
| an update won't install over an existing app | different signing key; always build with the project's EAS credentials |
