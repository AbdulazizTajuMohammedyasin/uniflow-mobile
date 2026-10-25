/**
 * A small, strict URL reader for the navigation rules. It is deliberately stricter than a
 * browser: anything unusual (user info, backslashes, spaces, control characters, IPv6,
 * odd ports) is rejected, so a lookalike address can never pass as UniFlow's.
 */

export type HttpUrl = {
  scheme: 'http' | 'https'
  host: string
  /** Empty for the scheme's default port. */
  port: string
  /** scheme://host[:port], as browsers compare origins. */
  origin: string
  /** Path, query and fragment: '' or starting with '/', '?' or '#'. */
  rest: string
}

const DEFAULT_PORTS = { http: '80', https: '443' } as const
const MAX_URL_LENGTH = 8192

/** The lower-case scheme ("https", "mailto", …), or null when there is none. */
export function schemeOf(raw: string): string | null {
  return /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(raw)?.[1]?.toLowerCase() ?? null
}

export function parseHttpUrl(raw: unknown): HttpUrl | null {
  if (typeof raw !== 'string' || raw.length > MAX_URL_LENGTH) return null
  // Spaces, control characters and backslashes: browsers "repair" these in surprising ways.
  if (/[\u0000-\u0020\u007f\\]/.test(raw)) return null

  const match = /^(https?):\/\/([^/?#]*)(.*)$/i.exec(raw)
  if (!match) return null
  const [, rawScheme = '', authority = '', rest = ''] = match
  const scheme = rawScheme.toLowerCase() as HttpUrl['scheme']

  // "https://uni-flow-inky.vercel.app@evil.example" is evil.example.
  if (authority.includes('@')) return null
  const hostPort = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i.exec(authority)
  if (!hostPort) return null

  const [, rawHost = '', rawPort = ''] = hostPort
  const host = rawHost.toLowerCase()
  let port = rawPort
  if (port) {
    const number = Number(port)
    if (number < 1 || number > 65535) return null
    port = String(number)
    if (port === DEFAULT_PORTS[scheme]) port = ''
  }
  return { scheme, host, port, origin: `${scheme}://${host}${port ? `:${port}` : ''}`, rest }
}

/**
 * The website's origin from configuration, or null if it isn't usable. HTTPS only, except
 * plain HTTP in development builds (a local website on a laptop). No path is allowed.
 */
export function parseWebOrigin(
  value: unknown,
  { allowInsecure }: { allowInsecure: boolean },
): string | null {
  const url = parseHttpUrl(value)
  if (!url || (url.rest !== '' && url.rest !== '/')) return null
  if (url.scheme !== 'https' && !allowInsecure) return null
  return url.origin
}

/** The path, query and fragment of a URL on `origin` (always starting with '/'), or null. */
export function pathOnOrigin(raw: string, origin: string): string | null {
  const url = parseHttpUrl(raw)
  if (!url || url.origin !== origin) return null
  return url.rest.startsWith('/') ? url.rest : `/${url.rest}`
}
