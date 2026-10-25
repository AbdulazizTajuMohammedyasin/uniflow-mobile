import { decideNavigation } from '../src/web/navigationPolicy'
import { parseHttpUrl, parseWebOrigin, pathOnOrigin } from '../src/web/url'

const webOrigin = 'https://uni-flow-inky.vercel.app'
const decide = (url: string, isTopFrame = true) => decideNavigation(url, { webOrigin, isTopFrame }).action

describe('parseWebOrigin', () => {
  it('accepts the HTTPS website, with or without a final slash', () => {
    expect(parseWebOrigin('https://uni-flow-inky.vercel.app', { allowInsecure: false })).toBe(webOrigin)
    expect(parseWebOrigin('https://UNI-FLOW-INKY.vercel.app/', { allowInsecure: false })).toBe(webOrigin)
  })

  it('refuses plain HTTP outside development, paths, and nonsense', () => {
    expect(parseWebOrigin('http://uni-flow-inky.vercel.app', { allowInsecure: false })).toBeNull()
    expect(parseWebOrigin('http://10.0.2.2:5173', { allowInsecure: true })).toBe('http://10.0.2.2:5173')
    expect(parseWebOrigin('https://uni-flow-inky.vercel.app/login', { allowInsecure: false })).toBeNull()
    expect(parseWebOrigin('', { allowInsecure: true })).toBeNull()
    expect(parseWebOrigin(undefined, { allowInsecure: true })).toBeNull()
    expect(parseWebOrigin('uni-flow-inky.vercel.app', { allowInsecure: true })).toBeNull()
  })
})

describe('parseHttpUrl', () => {
  it('normalises the scheme, host and default port', () => {
    expect(parseHttpUrl('HTTPS://Uni-Flow-Inky.vercel.app:443/x?y#z')).toMatchObject({
      origin: webOrigin,
      rest: '/x?y#z',
    })
    expect(parseHttpUrl('https://a.example:8443')?.origin).toBe('https://a.example:8443')
  })

  it.each([
    'https://uni-flow-inky.vercel.app@evil.example/',
    'https://user:pass@uni-flow-inky.vercel.app/',
    'https://evil.example\\@uni-flow-inky.vercel.app',
    'https://uni-flow-inky.vercel.app\\.evil.example',
    'https://uni flow.vercel.app',
    'https://uni-flow-inky.vercel.app/\n',
    'https://[::1]/',
    'https://uni-flow-inky.vercel.app:0/',
    'https://uni-flow-inky.vercel.app:99999/',
    'https://',
    'https:uni-flow-inky.vercel.app',
    'https://xn--un-flow-inky-ksb.vercel.app\u0000',
  ])('rejects %j', (url) => {
    expect(parseHttpUrl(url)).toBeNull()
  })
})

describe('pathOnOrigin', () => {
  it('returns the path only on the website itself', () => {
    expect(pathOnOrigin(`${webOrigin}/insights/4?a=1`, webOrigin)).toBe('/insights/4?a=1')
    expect(pathOnOrigin(webOrigin, webOrigin)).toBe('/')
    expect(pathOnOrigin('https://other.example/insights/4', webOrigin)).toBeNull()
  })
})

describe('decideNavigation', () => {
  it('loads UniFlow pages inside the app', () => {
    expect(decide(`${webOrigin}/`)).toBe('load')
    expect(decide(`${webOrigin}/login?next=%2Finsights%2F4`)).toBe('load')
    expect(decide('https://UNI-FLOW-INKY.vercel.app:443/timetable')).toBe('load')
    expect(decide(`${webOrigin}/api/v1/health/`, false)).toBe('load')
  })

  it('opens other HTTPS sites, email and phone links outside the app', () => {
    expect(decideNavigation('https://chat.whatsapp.com/abc', { webOrigin })).toEqual({
      action: 'open-externally',
      url: 'https://chat.whatsapp.com/abc',
    })
    expect(decide('https://t.me/uniflow')).toBe('open-externally')
    expect(decide('mailto:someone@student.aiu.edu.my')).toBe('open-externally')
    expect(decide('tel:+60123456789')).toBe('open-externally')
  })

  it('never lets a lookalike pass as UniFlow', () => {
    for (const url of [
      'https://uni-flow-inky.vercel.app.evil.example/',
      'https://evil-uni-flow-inky.vercel.app/',
      'https://uni-flow-inky.vercel.app:8443/',
      'https://vercel.app/',
    ]) {
      expect(decide(url)).toBe('open-externally') // other sites leave the app, never load in it
    }
    expect(decide('http://uni-flow-inky.vercel.app/')).toBe('block')
    expect(decide('https://uni-flow-inky.vercel.app@evil.example/')).toBe('block')
  })

  it('blocks dangerous and unknown schemes', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///data/data/app/secret',
      'intent://scan/#Intent;scheme=zxing;end',
      'blob:https://uni-flow-inky.vercel.app/1234',
      'http://example.com/',
      'ftp://example.com/',
      'whatsapp://send?text=hi',
      'not a url',
      '',
    ]) {
      expect(decide(url)).toBe('block')
    }
  })

  it('keeps other sites out of frames, without opening a browser', () => {
    expect(decide('https://ads.example/frame', false)).toBe('block')
    expect(decide('mailto:x@example.com', false)).toBe('block')
    expect(decide('about:blank', false)).toBe('load')
    expect(decide('about:srcdoc', false)).toBe('load')
  })
})
