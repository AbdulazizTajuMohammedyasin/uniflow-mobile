import {
  bootstrapScript,
  frameRefreshScript,
  isExpoPushToken,
  navigateScript,
  parsePageMessage,
  pushTokenScript,
} from '../src/web/bridge'

const webOrigin = 'https://uni-flow-inky.vercel.app'
const page = `${webOrigin}/timetable`
const message = (value: unknown) => JSON.stringify(value)

describe('parsePageMessage', () => {
  it('accepts the page layout the app reports from inside the page', () => {
    expect(
      parsePageMessage(message({ v: 1, type: 'layout', bottomBar: true, insetBottom: 24 }), page, webOrigin),
    ).toEqual({ type: 'layout', bottomBar: true, insetBottom: 24 })
    for (const bad of [
      { v: 1, type: 'layout', bottomBar: 'yes', insetBottom: 24 },
      { v: 1, type: 'layout', bottomBar: true, insetBottom: -1 },
      { v: 1, type: 'layout', bottomBar: true, insetBottom: 2.5 },
      { v: 1, type: 'layout', bottomBar: true, insetBottom: 9999 },
      { v: 1, type: 'layout', bottomBar: true },
    ]) {
      expect(parsePageMessage(message(bad), page, webOrigin)).toBeNull()
    }
  })

  it('accepts the unread count, a whole number within reason', () => {
    expect(parsePageMessage(message({ v: 1, type: 'unread', count: 3 }), page, webOrigin)).toEqual({
      type: 'unread',
      count: 3,
    })
    expect(parsePageMessage(message({ v: 1, type: 'unread', count: 0 }), page, webOrigin)).toEqual({
      type: 'unread',
      count: 0,
    })
    for (const count of [-1, 1.5, '3', 100000, null]) {
      expect(parsePageMessage(message({ v: 1, type: 'unread', count }), page, webOrigin)).toBeNull()
    }
  })

  it('accepts the three messages the website may send', () => {
    expect(parsePageMessage(message({ v: 1, type: 'theme', dark: true }), page, webOrigin)).toEqual({
      type: 'theme',
      dark: true,
    })
    expect(parsePageMessage(message({ v: 1, type: 'session', signedIn: false }), page, webOrigin)).toEqual({
      type: 'session',
      signedIn: false,
    })
    expect(
      parsePageMessage(message({ v: 1, type: 'push-registration', status: 'registered' }), page, webOrigin),
    ).toEqual({ type: 'push-registration', status: 'registered' })
  })

  it('ignores messages from any other page', () => {
    const theme = message({ v: 1, type: 'theme', dark: true })
    expect(parsePageMessage(theme, 'https://evil.example/', webOrigin)).toBeNull()
    expect(parsePageMessage(theme, 'https://uni-flow-inky.vercel.app.evil.example/', webOrigin)).toBeNull()
    expect(parsePageMessage(theme, 'http://uni-flow-inky.vercel.app/', webOrigin)).toBeNull()
    expect(parsePageMessage(theme, 'about:blank', webOrigin)).toBeNull()
  })

  it('ignores anything outside the fixed shapes', () => {
    for (const data of [
      'not json',
      message(null),
      message([1, 2]),
      message({ type: 'theme', dark: true }),
      message({ v: 2, type: 'theme', dark: true }),
      message({ v: 1, type: 'theme', dark: 'yes' }),
      message({ v: 1, type: 'theme', dark: true, token: 'x' }),
      message({ v: 1, type: 'session', signedIn: true, access: 'eyJ...' }),
      message({ v: 1, type: 'push-registration', status: 'maybe' }),
      message({ v: 1, type: 'navigate', url: 'https://evil.example' }),
      message({ v: 1, type: 'theme', dark: true, pad: 'x'.repeat(2000) }),
    ]) {
      expect(parsePageMessage(data, page, webOrigin)).toBeNull()
    }
    expect(parsePageMessage(undefined, page, webOrigin)).toBeNull()
  })
})

describe('isExpoPushToken', () => {
  it('accepts Expo push addresses only', () => {
    expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true)
    expect(isExpoPushToken('ExpoPushToken[abc-123_x]')).toBe(true)
    expect(isExpoPushToken('ExponentPushToken[x]"; alert(1); "')).toBe(false)
    expect(isExpoPushToken('')).toBe(false)
    expect(isExpoPushToken(null)).toBe(false)
  })
})

describe('injected scripts', () => {
  it('only run on the website, and embed values safely', () => {
    const tricky = `${webOrigin}"); alert(1); ("`
    expect(bootstrapScript(webOrigin, { platform: 'android', appVersion: '1.0.0' })).toContain(
      `window.location.origin !== "${webOrigin}"`,
    )
    expect(bootstrapScript(tricky, { platform: 'android', appVersion: '1"0' })).toContain('"1\\"0"')
    expect(navigateScript(webOrigin, '/insights/4')).toContain(`"${webOrigin}/insights/4"`)
  })

  it('never hand the page something that is not a push address', () => {
    const script = pushTokenScript(webOrigin, '"); stealCookies(); ("', 'ios')
    expect(script).not.toContain('stealCookies')
    expect(script).toContain('pushToken = null')
    expect(pushTokenScript(webOrigin, 'ExponentPushToken[abc]', 'ios')).toContain('"ExponentPushToken[abc]"')
  })

  it('produce valid JavaScript', () => {
    for (const script of [
      bootstrapScript(webOrigin, { platform: 'ios', appVersion: '1.0.0' }),
      pushTokenScript(webOrigin, 'ExponentPushToken[abc]', 'ios'),
      navigateScript(webOrigin, '/'),
      frameRefreshScript(webOrigin),
    ]) {
      expect(() => new Function(script)).not.toThrow()
    }
  })
})
