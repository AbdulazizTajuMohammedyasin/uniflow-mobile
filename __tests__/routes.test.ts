import { isCalendarDate, looksSignedIn, pathFromAppLink, safeInAppPath } from '../src/web/routes'

const webOrigin = 'https://uni-flow-inky.vercel.app'

describe('safeInAppPath', () => {
  it.each([
    ['/', '/'],
    ['/insights/42', '/insights/42'],
    ['/insights/42/', '/insights/42'],
    ['/timetable', '/timetable'],
    ['/notifications#top', '/notifications'],
    ['/digest', '/digest'],
    ['/digest?date=2026-10-09', '/digest?date=2026-10-09'],
  ])('allows %s', (input, expected) => {
    expect(safeInAppPath(input)).toBe(expected)
  })

  it.each([
    '//evil.example/insights/1',
    'https://evil.example/',
    '/insights/0',
    '/insights/-1',
    '/insights/abc',
    '/insights/1/../../staff',
    '/staff/users',
    '/login?next=https://evil.example',
    '/timetable?x=1',
    '/digest?date=2026-02-30',
    '/digest?date=2026-10-09&x=1',
    '/digest?date=2026-10-09?x',
    'insights/42',
    '',
    `/${'a'.repeat(300)}`,
  ])('refuses %j', (input) => {
    expect(safeInAppPath(input)).toBeNull()
  })

  it('refuses things that are not strings', () => {
    expect(safeInAppPath(undefined)).toBeNull()
    expect(safeInAppPath(42)).toBeNull()
  })
})

describe('isCalendarDate', () => {
  it('knows real days', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true)
    expect(isCalendarDate('2026-02-29')).toBe(false)
    expect(isCalendarDate('2026-13-01')).toBe(false)
    expect(isCalendarDate('26-10-09')).toBe(false)
  })
})

describe('pathFromAppLink', () => {
  it('reads uniflow:// links', () => {
    expect(pathFromAppLink('uniflow://insights/42', webOrigin)).toBe('/insights/42')
    expect(pathFromAppLink('uniflow:///timetable', webOrigin)).toBe('/timetable')
    expect(pathFromAppLink('uniflow://', webOrigin)).toBe('/')
    expect(pathFromAppLink('UNIFLOW://digest?date=2026-10-09', webOrigin)).toBe('/digest?date=2026-10-09')
  })

  it('reads links to the website itself', () => {
    expect(pathFromAppLink(`${webOrigin}/insights/7`, webOrigin)).toBe('/insights/7')
  })

  it('ignores everything else', () => {
    expect(pathFromAppLink('uniflow://staff/users', webOrigin)).toBeNull()
    expect(pathFromAppLink('uniflow://insights/42?next=//evil', webOrigin)).toBeNull()
    expect(pathFromAppLink('https://evil.example/insights/7', webOrigin)).toBeNull()
    expect(pathFromAppLink('exp+uniflow://expo-development-client/?url=http%3A%2F%2F10.0.2.2', webOrigin)).toBeNull()
    expect(pathFromAppLink(null, webOrigin)).toBeNull()
  })
})

describe('looksSignedIn', () => {
  it('treats the student pages as logged in', () => {
    expect(looksSignedIn('/')).toBe(true)
    expect(looksSignedIn('/insights/4')).toBe(true)
    expect(looksSignedIn('/timetable?week=2')).toBe(true)
  })

  it('treats public pages, onboarding and staff pages as not (yet) a student session', () => {
    for (const path of [
      '/login',
      '/login?next=%2F',
      '/register',
      '/privacy',
      '/verify-email/abc/def',
      '/forgot-password',
      '/reset-password/abc/def',
      '/onboarding',
      '/staff',
      '/staff/users',
    ]) {
      expect(looksSignedIn(path)).toBe(false)
    }
    expect(looksSignedIn(null)).toBe(false)
  })
})
