import NetInfo from '@react-native-community/netinfo'
import { useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState, type Ref } from 'react'
import { BackHandler, Linking, Platform, StyleSheet, View } from 'react-native'
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview'
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes'

import { ErrorScreen } from '../components/ErrorScreen'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { APP_VERSION, USER_AGENT_SUFFIX } from '../config'
import type { Palette } from '../theme'
import { bootstrapScript, navigateScript, parsePageMessage, pushTokenScript, type PageMessage } from './bridge'
import { decideNavigation } from './navigationPolicy'
import { classifyHttpError, classifyLoadError, handleBack, initialScreenState, screenReducer } from './screenState'
import { pathOnOrigin } from './url'

export type UniFlowWebViewHandle = {
  /** Open a page that was already checked with safeInAppPath. */
  navigate(path: string): void
  /** Hand the page the phone's push address (or null). */
  sendPushToken(token: string | null): void
}

type Props = {
  ref?: Ref<UniFlowWebViewHandle>
  webOrigin: string
  initialPath: string
  palette: Palette
  /** Every page change, including the website's own (history) navigation. */
  onPathChange(path: string | null): void
  /** A full page load finished: the page's scripts can receive things now. */
  onPageLoad(): void
  onMessage(message: PageMessage): void
}

async function openOutside(url: string) {
  try {
    await Linking.openURL(url)
  } catch {
    // No app on the phone handles it (e.g. no email app). Nothing useful to show.
  }
}

export function UniFlowWebView({ ref, webOrigin, initialPath, palette, onPathChange, onPageLoad, onMessage }: Props) {
  // WebView<object>: the library's default (WebView<undefined>) makes every prop type `never`.
  const webView = useRef<WebView<object>>(null)
  const [screen, dispatch] = useReducer(screenReducer, initialScreenState)
  const [canGoBack, setCanGoBack] = useState(false)
  // Changing `source` is how a retry or a navigation reaches a WebView showing an error.
  const [source, setSource] = useState(() => ({ uri: webOrigin + initialPath }))

  const bootstrap = useMemo(
    () => bootstrapScript(webOrigin, { platform: Platform.OS, appVersion: APP_VERSION }),
    [webOrigin],
  )

  useImperativeHandle(
    ref,
    () => ({
      navigate(path) {
        if (screen.phase === 'ready') {
          webView.current?.injectJavaScript(navigateScript(webOrigin, path))
        } else {
          dispatch({ type: 'retry' })
          setSource({ uri: webOrigin + path })
        }
      },
      sendPushToken(token) {
        webView.current?.injectJavaScript(pushTokenScript(webOrigin, token, Platform.OS))
      },
    }),
    [screen.phase, webOrigin],
  )

  const retry = useCallback(() => {
    dispatch({ type: 'retry' })
    webView.current?.reload()
  }, [])

  // Back: the website's history first, then the system (which leaves the app).
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleBack(canGoBack && screen.phase !== 'loading', () => {
        if (screen.phase === 'error') dispatch({ type: 'retry' })
        webView.current?.goBack()
      }),
    )
    return () => subscription.remove()
  }, [canGoBack, screen.phase])

  // Offline: try again by itself as soon as the phone is back online.
  useEffect(() => {
    if (screen.phase !== 'error' || screen.error !== 'offline') return
    return NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) retry()
    })
  }, [screen, retry])

  const shouldStart = useCallback(
    (request: ShouldStartLoadRequest) => {
      const decision = decideNavigation(request.url, { webOrigin, isTopFrame: request.isTopFrame ?? true })
      if (decision.action === 'open-externally') void openOutside(decision.url)
      return decision.action === 'load'
    },
    [webOrigin],
  )

  const onNavigationStateChange = useCallback(
    (navigation: WebViewNavigation) => {
      setCanGoBack(navigation.canGoBack)
      onPathChange(pathOnOrigin(navigation.url, webOrigin))
    },
    [onPathChange, webOrigin],
  )

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parsePageMessage(event.nativeEvent.data, event.nativeEvent.url, webOrigin)
      if (message) onMessage(message)
    },
    [onMessage, webOrigin],
  )

  const showFailure = useCallback(async (code: number, domain?: string) => {
    const network = await NetInfo.fetch()
    const error = classifyLoadError({ code, domain }, network.isConnected)
    if (error) dispatch({ type: 'failed', error })
  }, [])

  return (
    <View style={styles.container}>
      <WebView<object>
        ref={webView}
        source={source}
        style={{ backgroundColor: palette.background }}
        containerStyle={{ backgroundColor: palette.background }}
        // Every address goes through shouldStart (the WebView's own list would open some
        // addresses in other apps by itself, without our rules).
        originWhitelist={['*']}
        onShouldStartLoadWithRequest={shouldStart}
        // target="_blank" links (source messages) and window.open: the same rules.
        setSupportMultipleWindows={false}
        onOpenWindow={(event) => {
          const path = pathOnOrigin(event.nativeEvent.targetUrl, webOrigin)
          if (path !== null) webView.current?.injectJavaScript(navigateScript(webOrigin, path))
          else shouldStart({ url: event.nativeEvent.targetUrl, isTopFrame: true } as ShouldStartLoadRequest)
        }}
        // What the website needs: scripts, its own storage (theme choice), cookies for the
        // login refresh. Its cookie is first-party, so no shared or third-party cookies.
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        incognito={false}
        // No local files, no mixed content, no camera or microphone from the page.
        allowFileAccess={false}
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        mediaCapturePermissionGrantType="deny"
        geolocationEnabled={false}
        applicationNameForUserAgent={USER_AGENT_SUFFIX}
        injectedJavaScriptBeforeContentLoaded={bootstrap}
        onMessage={handleMessage}
        onNavigationStateChange={onNavigationStateChange}
        onLoad={() => {
          dispatch({ type: 'loaded' })
          onPageLoad()
        }}
        onError={(event) => void showFailure(event.nativeEvent.code, event.nativeEvent.domain)}
        onHttpError={(event) => {
          const error = classifyHttpError(event.nativeEvent.statusCode)
          if (error) dispatch({ type: 'failed', error })
        }}
        // The system ended the page's process (memory pressure, or a crash): load it again
        // instead of showing a blank screen (or, on Android, crashing the app).
        onContentProcessDidTerminate={retry}
        onRenderProcessGone={retry}
        // The website handles its own safe areas and zoom; the app's frame handles insets.
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        setBuiltInZoomControls={false}
        allowsInlineMediaPlayback
        webviewDebuggingEnabled={__DEV__}
      />
      {screen.phase === 'loading' && <LoadingOverlay palette={palette} />}
      {screen.phase === 'error' && <ErrorScreen kind={screen.error} palette={palette} onRetry={retry} />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
