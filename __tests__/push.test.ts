import { pathForTarget, pathFromPushData } from '../src/push/payload'
import {
  fetchPushToken,
  MAX_OFFERS,
  OFFER_INTERVAL_MS,
  parseOfferRecord,
  readPushStatus,
  requestPushPermission,
  shouldOffer,
  statusFrom,
  tokenChangeFilter,
  type PermissionResponse,
  type PushDeps,
} from '../src/push/registration'

const ALLOWED: PermissionResponse = { granted: true, canAskAgain: true }
const UNDECIDED: PermissionResponse = { granted: false, canAskAgain: true }
const REFUSED: PermissionResponse = { granted: false, canAskAgain: false }

function deps(overrides: Partial<PushDeps> = {}): PushDeps & { requestPermissions: jest.Mock } {
  return {
    isDevice: true,
    isExpoGo: false,
    projectId: 'project-id',
    getPermissions: jest.fn(async () => UNDECIDED),
    requestPermissions: jest.fn(async () => ALLOWED),
    getExpoPushToken: jest.fn(async () => 'ExponentPushToken[abc]'),
    ensureChannels: jest.fn(async () => undefined),
    ...overrides,
  } as PushDeps & { requestPermissions: jest.Mock }
}

describe('notification taps', () => {
  it('open the alert’s item or digest, like the website', () => {
    expect(pathFromPushData({ v: 1, notification_id: 3, target_type: 'insight', target_id: 42 })).toBe('/insights/42')
    expect(pathFromPushData({ v: '1', target_type: 'insight', target_id: '42' })).toBe('/insights/42')
    expect(pathFromPushData({ v: 1, target_type: 'digest', target_id: 20261009 })).toBe('/digest?date=2026-10-09')
  })

  it('open the notifications page when a UniFlow alert has no usable target', () => {
    expect(pathFromPushData({ v: 1, target_type: 'insight', target_id: -1 })).toBe('/notifications')
    expect(pathFromPushData({ v: 1, target_type: 'digest', target_id: 20261399 })).toBe('/notifications')
    expect(pathFromPushData({ v: 1, target_type: 'system', target_id: null })).toBe('/notifications')
    expect(pathFromPushData({ v: 1, target_type: 'insight', target_id: 1.5 })).toBe('/notifications')
  })

  it('ignore anything else, and never follow a URL or path from the payload', () => {
    expect(pathFromPushData({ url: 'https://evil.example' })).toBeNull()
    expect(pathFromPushData({ v: 2, target_type: 'insight', target_id: 1 })).toBeNull()
    expect(pathFromPushData(null)).toBeNull()
    expect(pathFromPushData('{"v":1}')).toBeNull()
    expect(pathFromPushData({ v: 1, path: '//evil.example', url: 'javascript:alert(1)' })).toBe('/notifications')
  })

  it('reject targets that are too large or not whole numbers', () => {
    expect(pathForTarget('insight', Number.MAX_SAFE_INTEGER + 1)).toBeNull()
    expect(pathForTarget('insight', '1e5')).toBeNull()
    expect(pathForTarget('digest', 2026109)).toBeNull()
  })
})

describe('permission status', () => {
  it('reads the system answer', () => {
    expect(statusFrom(ALLOWED)).toBe('granted')
    expect(statusFrom(UNDECIDED)).toBe('undetermined')
    expect(statusFrom(REFUSED)).toBe('blocked')
    expect(statusFrom({ granted: false, canAskAgain: true, ios: { status: 3 } })).toBe('granted')
  })

  it('is unsupported on simulators, in Expo Go and without an EAS project', async () => {
    expect(await readPushStatus(deps({ isDevice: false }))).toBe('unsupported')
    expect(await readPushStatus(deps({ isExpoGo: true }))).toBe('unsupported')
    expect(await readPushStatus(deps({ projectId: undefined }))).toBe('unsupported')
  })
})

describe('requestPushPermission', () => {
  it('creates the channels, then asks', async () => {
    const d = deps()
    expect(await requestPushPermission(d)).toBe('granted')
    expect(d.ensureChannels).toHaveBeenCalled()
    expect(d.requestPermissions).toHaveBeenCalledTimes(1)
  })

  it('never shows the system question after a final no, or when already allowed', async () => {
    const refused = deps({ getPermissions: jest.fn(async () => REFUSED) })
    expect(await requestPushPermission(refused)).toBe('blocked')
    expect(refused.requestPermissions).not.toHaveBeenCalled()

    const allowed = deps({ getPermissions: jest.fn(async () => ALLOWED) })
    expect(await requestPushPermission(allowed)).toBe('granted')
    expect(allowed.requestPermissions).not.toHaveBeenCalled()
  })

  it('does nothing where push is unsupported', async () => {
    const d = deps({ isDevice: false })
    expect(await requestPushPermission(d)).toBe('unsupported')
    expect(d.requestPermissions).not.toHaveBeenCalled()
  })
})

describe('fetchPushToken', () => {
  it('gets the address only when allowed, and never asks', async () => {
    const d = deps({ getPermissions: jest.fn(async () => ALLOWED) })
    expect(await fetchPushToken(d)).toEqual({ ok: true, token: 'ExponentPushToken[abc]' })
    expect(d.getExpoPushToken).toHaveBeenCalledWith('project-id')

    const undecided = deps()
    expect(await fetchPushToken(undecided)).toEqual({ ok: false, reason: 'not-allowed' })
    expect(undecided.requestPermissions).not.toHaveBeenCalled()
    expect(undecided.getExpoPushToken).not.toHaveBeenCalled()
  })

  it('reports a failure without throwing', async () => {
    const d = deps({
      getPermissions: jest.fn(async () => ALLOWED),
      getExpoPushToken: jest.fn(async () => {
        throw new Error('SERVICE_NOT_AVAILABLE')
      }),
    })
    expect(await fetchPushToken(d)).toEqual({ ok: false, reason: 'failed' })
  })
})

describe('tokenChangeFilter', () => {
  it('ignores the first token and repeats, and reports a real rotation once', () => {
    const changed = tokenChangeFilter()
    expect(changed('device-a')).toBe(false) // the one being fetched right now
    expect(changed('device-a')).toBe(false) // Android reporting it again
    expect(changed('device-a')).toBe(false)
    expect(changed('device-b')).toBe(true) // rotated
    expect(changed('device-b')).toBe(false)
  })
})

describe('shouldOffer', () => {
  const now = 1_800_000_000_000
  const never = { offers: 0, lastOfferAt: 0 }

  it('offers once to a logged-in student who has not decided', () => {
    expect(shouldOffer('undetermined', never, { signedIn: true, now })).toBe(true)
    expect(shouldOffer('undetermined', never, { signedIn: false, now })).toBe(false)
    expect(shouldOffer('granted', never, { signedIn: true, now })).toBe(false)
    expect(shouldOffer('blocked', never, { signedIn: true, now })).toBe(false)
    expect(shouldOffer('unsupported', never, { signedIn: true, now })).toBe(false)
  })

  it('offers a second time only a week later, and never a third', () => {
    const once = { offers: 1, lastOfferAt: now }
    expect(shouldOffer('undetermined', once, { signedIn: true, now: now + OFFER_INTERVAL_MS - 1 })).toBe(false)
    expect(shouldOffer('undetermined', once, { signedIn: true, now: now + OFFER_INTERVAL_MS })).toBe(true)
    const done = { offers: MAX_OFFERS, lastOfferAt: 0 }
    expect(shouldOffer('undetermined', done, { signedIn: true, now })).toBe(false)
  })

  it('reads a stored record, treating damage as never offered', () => {
    expect(parseOfferRecord('{"offers":1,"lastOfferAt":5}')).toEqual({ offers: 1, lastOfferAt: 5 })
    expect(parseOfferRecord(null)).toEqual({ offers: 0, lastOfferAt: 0 })
    expect(parseOfferRecord('{oops')).toEqual({ offers: 0, lastOfferAt: 0 })
    expect(parseOfferRecord('{"offers":"1"}')).toEqual({ offers: 0, lastOfferAt: 0 })
  })
})
