// CRC-32 (IEEE 802.3, the zlib and PNG polynomial), as BPS stores it. Plain TypeScript, because
// the page applies patches too and `zlib.crc32` exists only in Node.
const POLYNOMIAL = 0xedb88320

let table: Uint32Array | undefined

function crcTable(): Uint32Array {
  if (table !== undefined) return table
  table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? POLYNOMIAL ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
}

export function crc32(bytes: Uint8Array): number {
  const lookup = crcTable()
  let crc = 0xffffffff
  for (const byte of bytes) crc = (lookup[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
