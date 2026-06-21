#!/usr/bin/env node
/**
 * Generates solid-color PNG icons using only Node.js built-ins.
 * Produces icon-192.png and icon-512.png in public/icons/.
 * Color: #4f46e5 (ChurchCore indigo)
 *
 * PNG structure: signature + IHDR + IDAT (zlib-deflated rows) + IEND
 * All CRC32 values computed via the standard polynomial table.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync }              from 'node:zlib'
import { join, dirname }            from 'node:path'
import { fileURLToPath }            from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir    = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

// ── CRC32 table ─────────────────────────────────────────────────────────────
const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ── Chunk builder ────────────────────────────────────────────────────────────
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len       = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)

  const crcInput = Buffer.concat([typeBytes, data])
  const crcBuf   = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput), 0)

  return Buffer.concat([len, typeBytes, data, crcBuf])
}

// ── PNG builder ──────────────────────────────────────────────────────────────
function buildPNG(size, r, g, b) {
  // PNG signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR: width, height, bit depth 8, color type 2 (RGB), compression 0, filter 0, interlace 0
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8]  = 8  // bit depth
  ihdr[9]  = 2  // color type RGB
  ihdr[10] = 0  // compression
  ihdr[11] = 0  // filter
  ihdr[12] = 0  // interlace

  // Image rows: each row starts with filter byte 0x00, then R G B per pixel
  const rowLen = 1 + size * 3   // 1 filter byte + 3 bytes per pixel
  const raw    = Buffer.alloc(size * rowLen)
  for (let y = 0; y < size; y++) {
    const offset = y * rowLen
    raw[offset] = 0x00           // filter: None
    for (let x = 0; x < size; x++) {
      raw[offset + 1 + x * 3]     = r
      raw[offset + 1 + x * 3 + 1] = g
      raw[offset + 1 + x * 3 + 2] = b
    }
  }

  const compressed = deflateSync(raw, { level: 6 })

  const idat = chunk('IDAT', compressed)
  const iend = chunk('IEND', Buffer.alloc(0))

  return Buffer.concat([sig, chunk('IHDR', ihdr), idat, iend])
}

// ── Generate icons ───────────────────────────────────────────────────────────
// ChurchCore indigo: #4f46e5 → R=79 G=70 B=229
const R = 0x4f, G = 0x46, B = 0xe5

const sizes = [192, 512]
for (const size of sizes) {
  const png  = buildPNG(size, R, G, B)
  const path = join(outDir, `icon-${size}.png`)
  writeFileSync(path, png)
  console.log(`Created ${path} (${png.length} bytes)`)
}
