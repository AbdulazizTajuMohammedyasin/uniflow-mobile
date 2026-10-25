import * as Linking from 'expo-linking'
import { useEffect, useState } from 'react'

import { launchTapPath, onNotificationTap } from './push/native'
import { pathFromAppLink } from './web/routes'

// Reading how the app was opened takes a few milliseconds; never wait longer than this.
const LAUNCH_LOOKUP_LIMIT_MS = 1500

async function launchPath(webOrigin: string): Promise<string> {
  const lookup = Promise.all([
    launchTapPath(),
    Linking.getInitialURL().catch(() => null),
  ]).then(([tapPath, url]) => tapPath ?? pathFromAppLink(url, webOrigin) ?? '/')
  const limit = new Promise<string>((resolve) => setTimeout(() => resolve('/'), LAUNCH_LOOKUP_LIMIT_MS))
  return Promise.race([lookup, limit])
}

/**
 * Where the app should open: the page of the notification or uniflow:// link that launched
 * it (else the home page), and later ones while it runs. Every path is checked
 * (safeInAppPath) before it gets here.
 */
export function useIncomingLinks(webOrigin: string, open: (path: string) => void) {
  const [initialPath, setInitialPath] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void launchPath(webOrigin).then((path) => {
      if (active) setInitialPath(path)
    })
    return () => {
      active = false
    }
  }, [webOrigin])

  useEffect(() => {
    const stopTaps = onNotificationTap(open)
    const links = Linking.addEventListener('url', ({ url }) => {
      const path = pathFromAppLink(url, webOrigin)
      if (path) open(path)
    })
    return () => {
      stopTaps()
      links.remove()
    }
  }, [open, webOrigin])

  return initialPath
}
