import Constants, { ExecutionEnvironment } from 'expo-constants'
import { Platform } from 'react-native'

import { parseWebOrigin } from './web/url'

type Extra = { webOrigin?: unknown; eas?: { projectId?: unknown } }
const extra = (Constants.expoConfig?.extra ?? {}) as Extra

/** The UniFlow website the app shows (app.config.ts). Null if misconfigured: the app then
 * shows an error instead of loading anything. */
export const WEB_ORIGIN = parseWebOrigin(extra.webOrigin, { allowInsecure: __DEV__ })

const projectId = extra.eas?.projectId ?? Constants.easConfig?.projectId
export const EAS_PROJECT_ID = typeof projectId === 'string' && projectId ? projectId : undefined

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0'
export const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient

/** Added to the WebView's user agent, so the website and its logs can tell the app apart. */
export const USER_AGENT_SUFFIX = `UniFlowApp/${APP_VERSION} (${Platform.OS})`
