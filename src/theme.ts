/** The website's colours (frontend/src/index.css in the web repository), so the app's own
 * screens and edges look like the page next to them. */
export const COLORS = {
  light: {
    background: '#f5f5eb',
    card: '#ffffff',
    foreground: '#14140f',
    mutedForeground: '#5c5c52',
    border: '#d2d2c8',
    primary: '#8fcc2e',
    primaryForeground: '#14140f',
  },
  dark: {
    background: '#121210',
    card: '#1c1c19',
    foreground: '#f2f2ea',
    mutedForeground: '#a3a398',
    border: '#2e2e2a',
    primary: '#8fcc2e',
    primaryForeground: '#14140f',
  },
} as const

export type Palette = (typeof COLORS)['light'] | (typeof COLORS)['dark']

export const paletteFor = (dark: boolean): Palette => (dark ? COLORS.dark : COLORS.light)
