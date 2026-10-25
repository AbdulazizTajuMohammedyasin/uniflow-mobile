import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { nativePushDeps, onPushTokenChange } from './native'
import {
  fetchPushToken,
  parseOfferRecord,
  readPushStatus,
  requestPushPermission,
  shouldOffer,
  type OfferRecord,
  type PushDeps,
  type PushStatus,
} from './registration'

// Only "when did we last offer notifications": nothing personal or secret.
const OFFER_KEY = 'uniflow.pushOffer.v1'

/**
 * The phone's push state for the app:
 * - `token`: the Expo push address while notifications are allowed (else null); it is
 *   read again when the app comes back to the foreground (the student may have changed
 *   the setting) and when the system rotates it;
 * - `offerVisible`: whether to show the explanation sheet now (see shouldOffer).
 */
export function usePush({ signedIn, deps = nativePushDeps }: { signedIn: boolean; deps?: PushDeps }) {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [record, setRecord] = useState<OfferRecord | null>(null)
  const [answeredNow, setAnsweredNow] = useState(false)
  // "A week since the last offer" is judged from when the app was opened.
  const [openedAt] = useState(Date.now)

  const refresh = useCallback(async () => {
    try {
      const current = await readPushStatus(deps)
      setStatus(current)
      if (current !== 'granted') {
        setToken(null)
        return
      }
      const result = await fetchPushToken(deps)
      // A failed fetch keeps the last address: it is still this phone's until it rotates.
      if (result.ok) setToken(result.token)
    } catch {
      setStatus('unsupported')
    }
  }, [deps])

  useEffect(() => {
    // refresh() only sets state after awaiting the native module, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    AsyncStorage.getItem(OFFER_KEY)
      .then((raw) => setRecord(parseOfferRecord(raw)))
      .catch(() => setRecord(parseOfferRecord(null)))

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    const stopTokenListener = onPushTokenChange(() => void refresh())
    return () => {
      appState.remove()
      stopTokenListener()
    }
  }, [refresh])

  const remember = useCallback(() => {
    const next = { offers: (record?.offers ?? 0) + 1, lastOfferAt: Date.now() }
    setRecord(next)
    setAnsweredNow(true)
    AsyncStorage.setItem(OFFER_KEY, JSON.stringify(next)).catch(() => undefined)
  }, [record])

  const accept = useCallback(async () => {
    remember()
    try {
      setStatus(await requestPushPermission(deps))
    } finally {
      await refresh()
    }
  }, [deps, refresh, remember])

  const offerVisible =
    !answeredNow && status !== null && record !== null && shouldOffer(status, record, { signedIn, now: openedAt })

  return { status, token, offerVisible, accept, decline: remember }
}
