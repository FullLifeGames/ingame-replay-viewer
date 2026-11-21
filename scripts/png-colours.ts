// Counts the colours of a screenshot PNG in Node, so the page's e2e reads a game frame in memory
// and never writes it anywhere (the frame is ROM-derived). It reads what Chromium writes: 8-bit
// RGB or RGBA, not interlaced.
import { inflateSync } from 'node:zlib'

const SIGNATURE_BYTES = 8
const BYTES_PER_PIXEL: Readonly<Partial<Record<number, number>>> = { 2: 3, 6: 4 }

interface Image {
  readonly width: number
  readonly height: number
  readonly bpp: number
  readonly data: Buffer
}

function readImage(png: Buffer): Image {
  let at = SIGNATURE_BYTES
  let header: Buffer | undefined
  const parts: Buffer[] = []
  while (at + 8 <= png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('latin1', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') header = body
    if (type === 'IDAT') parts.push(body)
    at += 12 + length
  }
  if (header === undefined) throw new Error('the PNG has no IHDR chunk')
  const bpp = BYTES_PER_PIXEL[header.readUInt8(9)]
  if (header.readUInt8(8) !== 8 || bpp === undefined || header.readUInt8(12) !== 0) {
    throw new Error('the PNG is not 8-bit RGB or RGBA without interlace')
  }
  const [width, height] = [header.readUInt32BE(0), header.readUInt32BE(4)]
  return { width, height, bpp, data: inflateSync(Buffer.concat(parts)) }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft
  const toLeft = Math.abs(estimate - left)
  const toUp = Math.abs(estimate - up)
  const toUpLeft = Math.abs(estimate - upLeft)
  if (toLeft <= toUp && toLeft <= toUpLeft) return left
  return toUp <= toUpLeft ? up : upLeft
}

/** The value a PNG filter predicts for a byte from its left, upper and upper-left neighbours. */
function predict(filter: number, left: number, up: number, upLeft: number): number {
  if (filter === 1) return left
  if (filter === 2) return up
  if (filter === 3) return (left + up) >> 1
  if (filter === 4) return paeth(left, up, upLeft)
  return 0
}

/** The image's pixel bytes, row after row, without the filter bytes. */
function unfilter({ width, height, bpp, data }: Image): Buffer {
  const stride = width * bpp
  const out = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = data.readUInt8(y * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x
      const left = x >= bpp ? out.readUInt8(at - bpp) : 0
      const up = y > 0 ? out.readUInt8(at - stride) : 0
      const upLeft = x >= bpp && y > 0 ? out.readUInt8(at - stride - bpp) : 0
      const raw = data.readUInt8(y * (stride + 1) + 1 + x)
      out[at] = (raw + predict(filter, left, up, upLeft)) & 0xff
    }
  }
  return out
}

/** The distinct colours in `png`, counted up to `max`. */
export function countColours(png: Buffer, max: number): number {
  const image = readImage(png)
  const pixels = unfilter(image)
  const seen = new Set<string>()
  for (let at = 0; at < pixels.length && seen.size < max; at += image.bpp) {
    seen.add(pixels.toString('hex', at, at + image.bpp))
  }
  return seen.size
}
