import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useColorScheme } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { LoadingOverlay } from './components/LoadingOverlay'
import { PushOffer } from './components/PushOffer'
import { usePush } from './push/usePush'
import { paletteFor } from './theme'
import { useIncomingLinks } from './useIncomingLinks'
import type { PageMessage } from './web/bridge'
import { looksSignedIn } from './web/routes'
import { safeAreaEdges, type PageLayout } from './web/screenState'
import { UniFlowWebView, type UniFlowWebViewHandle } from './web/UniFlowWebView'

/** The whole app: the UniFlow website, framed by the phone's safe areas, plus the native
 * notification offer. */
export function AppScreen({ webOrigin }: { webOrigin: string }) {
  const webView = useRef<UniFlowWebViewHandle>(null)
  // A tap that arrives before the WebView exists opens as its first page.
  const [queuedPath, setQueuedPath] = useState<string | null>(null)

  const systemDark = useColorScheme() === 'dark'
  const [pageDark, setPageDark] = useState<boolean | null>(null) // the website's own choice
  const palette = paletteFor(pageDark ?? systemDark)
  const [layout, setLayout] = useState<PageLayout | null>(null)

  const [path, setPath] = useState<string | null>(null)
  const [pageReady, setPageReady] = useState(false)
  // Once the website reports its session itself, that wins over guessing from the page.
  const [pageSignedIn, setPageSignedIn] = useState<boolean | null>(null)
  const signedIn = pageReady && (pageSignedIn ?? looksSignedIn(path))

  const push = usePush({ signedIn })

  const open = useCallback((target: string) => {
    if (webView.current) webView.current.navigate(target)
    else setQueuedPath(target)
  }, [])
  const launchPath = useIncomingLinks(webOrigin, open)

  // The website gets the phone's push address on every page load and whenever it changes.
  const sentToken = useRef<string | null | undefined>(undefined) // undefined: not sent to this page
  const sendToken = useCallback((token: string | null) => {
    if (sentToken.current === token) return
    sentToken.current = token
    webView.current?.sendPushToken(token)
  }, [])

  useEffect(() => {
    if (pageReady) sendToken(push.token)
  }, [pageReady, push.token, sendToken])

  const onPageLoad = useCallback(() => {    sentToken.current = undefined // a new page knows nothing yet
    // Every UniFlow page reports its layout itself as soon as it is ready (pages without a
    // bottom bar report that too), so the newest report always describes the page showing.
    // No reset here: on Back, Android can signal "loaded" after the page already reported,
    // and a reset would wipe that out. Asking once more covers a report that got lost.
    webView.current?.refreshFrame()
    setPageReady(true)
    sendToken(push.token)
  }, [push.token, sendToken])

  const onMessage = useCallback((message: PageMessage) => {    if (message.type === 'theme') setPageDark(message.dark)
    else if (message.type === 'layout') setLayout(message)
    else if (message.type === 'session') setPageSignedIn(message.signedIn)
    // 'push-registration' needs nothing from the app: the website keeps the server in step.
  }, [])

  // Only read when the WebView is created; later pages arrive through navigate().
  const initialPath = launchPath === null ? null : (queuedPath ?? launchPath)

  return (
    <SafeAreaView edges={safeAreaEdges(layout)} style={{ flex: 1, backgroundColor: palette.background }}>
      <StatusBar style={pageDark ?? systemDark ? 'light' : 'dark'} />
      {initialPath === null ? (
        <LoadingOverlay palette={palette} />
      ) : (
        <UniFlowWebView
          ref={webView}
          webOrigin={webOrigin}
          initialPath={initialPath}
          palette={palette}
          onPathChange={setPath}
          onPageLoad={onPageLoad}
          onMessage={onMessage}
        />
      )}
      <PushOffer
        visible={push.offerVisible}
        palette={palette}
        onAccept={() => void push.accept()}
        onDecline={push.decline}
      />
    </SafeAreaView>
  )
}
