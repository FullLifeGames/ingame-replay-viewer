// Byte codecs of the Gen 5 spike page (#72): base64 for bytes that cross to the run's script
// through Playwright, and SHA-256 for the main RAM hashes of the marks.

export function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(text)
}

export function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (char) => char.charCodeAt(0))
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
