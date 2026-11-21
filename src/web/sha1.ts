// The SHA1 the page checks the user's dump and the patched ROM by (D11): the browser's own, which
// needs a secure context, as the emulator does.

/** Web Crypto reads no view on a SharedArrayBuffer, which a cross-origin isolated page may hold. */
const onOwnBuffer = (bytes: Uint8Array): bytes is Uint8Array<ArrayBuffer> =>
  bytes.buffer instanceof ArrayBuffer

/** The SHA1 of `bytes` as 40 lowercase hex digits, the form rom/gen3/build.json holds. */
export async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const data = onOwnBuffer(bytes) ? bytes : new Uint8Array(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
