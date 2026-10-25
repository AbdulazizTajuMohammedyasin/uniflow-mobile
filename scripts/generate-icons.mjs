// Draws the app's icons from UniFlow's mark (the website's Wordmark: a rounded lime square
// with two ink lines, frontend/src/components/Wordmark.tsx) into assets/. No dependencies.
//
//   node scripts/generate-icons.mjs

import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const LIME = [0x8f, 0xcc, 0x2e]
const INK = [0x14, 0x14, 0x0f]
const WHITE = [0xff, 0xff, 0xff]

// The mark in the Wordmark's own units (em): a 1.1 square, radius 0.3, side padding 0.24,
// two 0.11-high lines 0.14 apart, centred. Here scaled so the square is 1.
const M = 1.1
const MARK = {
  radius: 0.3 / M,
  padding: 0.24 / M,
  lineHeight: 0.11 / M,
  gap: 0.14 / M,
}

/** Signed distance from (x, y) to a rounded rectangle (negative inside). */
function roundedRect(x, y, { cx, cy, w, h, r }) {
  const qx = Math.abs(x - cx) - w / 2 + r
  const qy = Math.abs(y - cy) - h / 2 + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** The square and its two lines, for a mark of `side` pixels centred at (cx, cy). */
function markShapes(cx, cy, side) {
  const lineH = MARK.lineHeight * side
  const lineW = side - 2 * MARK.padding * side
  const offset = (MARK.gap * side + lineH) / 2
  return {
    square: { cx, cy, w: side, h: side, r: MARK.radius * side },
    lines: [-offset, offset].map((dy) => ({ cx, cy: cy + dy, w: lineW, h: lineH, r: lineH / 2 })),
  }
}

/** Anti-aliased coverage (0-1) of a shape at a pixel centre. */
const coverage = (distance) => Math.min(1, Math.max(0, 0.5 - distance))

/** Renders a size×size RGBA image; `paint(x, y)` returns [r, g, b, alpha 0-1]. */
function render(size, paint) {
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4) // filter byte 0, then RGBA
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x + 0.5, y + 0.5)
      row.set([r, g, b, Math.round(a * 255)], 1 + x * 4)
    }
    rows.push(row)
  }
  return png(size, size, Buffer.concat(rows))
}

// --- PNG encoding ----------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function png(width, height, raw) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- The icons -------------------------------------------------------------------------------

const linesAt = (lines, x, y) => Math.max(...lines.map((line) => coverage(roundedRect(x, y, line))))

const outputs = {
  // iOS and the stores: the lime square is the whole icon (iOS rounds the corners itself).
  'icon.png': () => {
    const size = 1024
    const { lines } = markShapes(size / 2, size / 2, size)
    return render(size, (x, y) => {
      const ink = linesAt(lines, x, y)
      return [...LIME.map((c, i) => Math.round(c + (INK[i] - c) * ink)), 1]
    })
  },
  // Android adaptive icon: lime background (app.config.ts) + ink lines, sized to the
  // 72dp-of-108dp area that every launcher shape shows.
  'android-icon-foreground.png': () => {
    const size = 1024
    const { lines } = markShapes(size / 2, size / 2, size * (72 / 108))
    return render(size, (x, y) => [...INK, linesAt(lines, x, y)])
  },
  // Android 13+ themed icons: only the shape counts.
  'android-icon-monochrome.png': () => {
    const size = 1024
    const { lines } = markShapes(size / 2, size / 2, size * (72 / 108))
    return render(size, (x, y) => [...WHITE, linesAt(lines, x, y)])
  },
  // Splash screen: the mark itself, on the paper/night background from app.config.ts.
  'splash-icon.png': () => {
    const size = 1024
    const { square, lines } = markShapes(size / 2, size / 2, size)
    return render(size, (x, y) => {
      const ink = linesAt(lines, x, y)
      return [...LIME.map((c, i) => Math.round(c + (INK[i] - c) * ink)), coverage(roundedRect(x, y, square))]
    })
  },
  // Android status bar: a white silhouette, the lines cut out of the square.
  'notification-icon.png': () => {
    const size = 96
    const { square, lines } = markShapes(size / 2, size / 2, size * (80 / 96))
    return render(size, (x, y) => [...WHITE, coverage(roundedRect(x, y, square)) * (1 - linesAt(lines, x, y))])
  },
}

for (const [name, draw] of Object.entries(outputs)) {
  writeFileSync(new URL(`../assets/${name}`, import.meta.url), draw())
  console.log(`assets/${name}`)
}
