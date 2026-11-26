// Fixtures of the LZMA and LZMA2 specs: streams that Python's lzma module made from bytes of our
// own (repeating text, zeros, bytes from a fixed seed), and one literal-only LZMA stream with no
// end marker from a small encoder of our own. The specs rebuild the expected bytes with the same
// rules. Nothing here comes from the emulator or a game.

const PHRASE = 'A replay plays back inside the game, line by line. '

/** The second phrase, for a stream whose properties differ from the first one's. */
export const OTHER_PHRASE = 'Each turn gives its moves, its damage and its faints. '

/** `length` bytes of `phrase` repeated. */
export function textBytes(length: number, phrase = PHRASE): Uint8Array {
  const unit = new TextEncoder().encode(phrase)
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i++) bytes[i] = unit[i % unit.length] as number
  return bytes
}

/** `length` bytes of xorshift32 from `seed`, the low byte of each step: they do not compress. */
export function seededBytes(length: number, seed = 0x2545f491): Uint8Array {
  const bytes = new Uint8Array(length)
  let x = seed
  for (let i = 0; i < length; i++) {
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    bytes[i] = x & 0xff
  }
  return bytes
}

const WORDS = [
  'the ',
  'turn ',
  'replay ',
  'switches ',
  'damage ',
  'line by line ',
  'faints. ',
  'its moves ',
  'a critical hit ',
  'and ',
  'of ',
  'the game ',
  'protect ',
  'weather ',
  'stat raised ',
  'sharply ',
]

/** `length` bytes of words picked by the low four bits of seeded bytes: matches of many lengths
 * at many distances, and repeats of older distances. */
export function wordBytes(length: number): Uint8Array {
  const picks = seededBytes(length, 0x9e3779b9)
  let text = ''
  for (let i = 0; text.length < length; i++) text += WORDS[(picks[i] as number) & 15] as string
  return new TextEncoder().encode(text.slice(0, length))
}

/** The bytes after one another. */
export function joined(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** The bytes of a base64 text. */
export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let count = 0
  let at = 0
  for (const char of clean) {
    bits = (bits << 6) | BASE64.indexOf(char)
    count += 6
    if (count >= 8) {
      count -= 8
      bytes[at++] = (bits >> count) & 0xff
    }
  }
  return bytes
}

/** Each stream with the bytes it holds:
 * - text: LZMA2 of textBytes(3000), dictionary 64 KiB: one LZMA chunk that resets everything.
 * - seeded: LZMA2 of seededBytes(600): one uncompressed chunk with a dictionary reset.
 * - words: LZMA2 of wordBytes(3000).
 * - far: LZMA2 of textBytes(1000), textBytes(5000, OTHER_PHRASE), textBytes(1000): the last
 *   part matches the first at a distance over 4 KiB.
 * - long: LZMA2 of textBytes(2,797,152) and seededBytes(200): two LZMA chunks, the second resets
 *   nothing.
 * - kinds: chunks joined by hand: an LZMA chunk that resets everything (textBytes(1000) and 24
 *   zeros), an uncompressed chunk without a reset (seededBytes(299) and one zero), an LZMA chunk
 *   that resets the state alone (textBytes(800)), an LZMA chunk with new properties lc 0, lp 0,
 *   pb 0 (textBytes(600, OTHER_PHRASE)), an uncompressed chunk with a dictionary reset
 *   (seededBytes(200, 7)), and an LZMA chunk that resets everything (textBytes(500)).
 * - lzmaMarker: raw LZMA of textBytes(3000), properties 0x5d, dictionary 64 KiB, with the end
 *   marker.
 * - lzmaPlain: raw LZMA of textBytes(300), literals alone, no end marker. */
export const LZMA_STREAMS = {
  text: [
    '4Au3AENdACCICkZTtrvD0XrFyG0ng701gObqKUxuMvlsGUpGn0zW6O/Fbu9Sjjlz+RN8lsGRv8deveRGjKq8W73C',
    'LAh8EHSFpgAA',
  ].join(''),
  seeded: [
    'AQJXOqusJq8jGnFskV0xGD680u9RIp1yT9vZbzlurivIIi8M4+2MaHuiiZnWOaef8lX+kRW4IKp6lIqgTcCd/klM',
    '3I7guQayMClKYBzfPLdiz0IFGQxLs9/hfEX7UFFncHjJBPhDDLRIc8vGBdifWPBt1+U4rO7v7fzvl/4WN7wD56qw',
    'ZThDSddZO+B/f+KjydauKmdm7au1TXP/loojMguX7xx9ukGWePnSaTyzb8vbQnThgV8i1xslp872y4ChHqqt3x2w',
    '6CLRXgQqIHBjH4i6rYNqklvb28fvh/sV7KW4lp8VSWOAnMmGM80FLD1Ca7P8SSrFAiHsQpbQchM/WShIxvmr6+GG',
    'Ae1or28FUbN6637R8JvEVLymjETuxvUp6W/TqXgy0Jpt3WmD3jMII5sTqUgIaIkdtqQ5unXosCxdLAlSLUbBN1hS',
    'E1mZ2YaiNrcbeTjyzPaEYgGoDAWrtvX4AEGrBYmlkZIGVMzYu52SZfn8VzIsFy8d0M9Sfd7kzRiQ8kuYh45ZIIBz',
    'iuqH3zC95Lhwak24U6rdNJbAdenJ8mC9G3Vg9YM6D8qKehauCiv+bumu1VJOdpKqpTp0K9euplbvA1Fb6KU5+/5O',
    'kGZEWtO79bdjnEmq43VkA2CdpaetcFvZYpSGVMoi8NXcf4gg6Y01Z7ZL4ZlAGSYhOTImjoNTwlrVH0APosSl8e9b',
    'aqK4LVvxDE+hql5yFAK2MNUxC6u9EelK3o4MjKDfmUZ3syt4RdweEPRjXKtKXO9rFJJyfnj85gp4Ca3D/ig7L5Tu',
    '5KEorq6j1ItGAA==',
  ].join(''),
  words: [
    '4Au3Aj5dADCbiKtm6eObML5klmieqDl+tam71weqZIHNBUcgz23bl0pDV6jHdbokERbgROcn56SrdvvX+1keOoAy',
    'WgSnAv9axOh/QhemWWw7BPFLsPNQDnMw//PGn/rwe836FB9cSUe8JKp/wPEZAnLjIEOnwGgY3+IFMj3LkRg6Umoj',
    'OsRL7FWrvyh/eeJvJ1zxwpu9vk6pO+kfDqVO6nmEGC9B6tHhYwW31NFvTzSauUFzyPMGjkcQ0feaII451Dexm60T',
    'klEhF73lvic6qusTKLAKaWBHG/gGPhwsL/Itk/oRkuOJc0y/P5tIa/MwyCmiKWVGV8l00NkY5En6reKdlImpRG0T',
    'D8cg5+Z6lgd7D9fLkLfe8Er9QRj9NdKtxSUUVWmNMnOSaYABgBiWEteqVM6Alfj0hNOLVdfBL1qpKyH+Tzu34Wwn',
    'KF4aDXtqiHcRjdQsDtxG0XUanj6SGEBPWxx7uV+sAR4wOFcL3RNXnLpV0YcTMQ+eAeNTpWtq2b5gfsEyFrGAGVm1',
    'zA0m7Z0zxAk145SucdxiHtUOes3I3Bs703IlVUC8tzIpHmxX+/2+07MkXvaANGWaeFuj8Y/qcLtRyw9wramoQFTT',
    'oChZ+5chFj15ZT2z9oM/ofo0Xyg1nUojYUWAxINTo7CIrTu5z1N/VmYIkyusW3f64dole6IF/OTG54fAY7ct6HHJ',
    'MZ6FCwOK/2HNjudfxJ73e2KUwK8VomdKPSmDGxIDGo3kM6pMHs/i6QqmH50aJlKsJuZXFhgA',
  ].join(''),
  far: [
    '4BtXAIRdACCICkZTtrvD0XrFyG0ng701gObqKUxuMvlsGUpGn0zW6O/Fbu9Sjjlz+RN8lsGRv8deveQ2Mu2DdiBE',
    'ZNxGGEqJrlXD/NQkQnpxCS+4MtJmqEQq+PYvFbq90fAEdBCQzRFWh7UKqeG6Uo5A9ASVSlyCiLivf1ikY/Z4uRDy',
    'KgdItIMLAAA=',
  ].join(''),
  long: [
    '//9DAZpdACCICkZTtrvD0XrFyG0ng701gObqKUxuMvlsGUpGn0zW6O/Fbu9Sjjlz+RN8lsGRv8deveRGjKq8W73C',
    'LAh8FgOqatQgoBgIvDvIR7YeobGZznF3SZks3BqIgTSC06fZXjv/GllgAqjLVoAVTVPRz1MwvpSMewSa0d2YQGqr',
    'rbx1BST/pp8R/IX1GUID7ZOh1W2S1I7aZuFO6j2ZSRYrlflH+k7nUuKSBlYZnkSe4tLkRvZU8Ih1LDDbwlBUkSKX',
    'BgNfyXA7FMAyN5ilFQGl6KMJKuyq/1omrHIMFpKnvjmPJOFwnqcjX+woy4XRlZiKfiqR8id19xnABphNmP3Yr9WQ',
    'D8QlU/j1kTYxBaWw7m/BcE1HDNGREaqtYB26zrEnGFxZhulmUli+6XasWeTlWwUI+cfarfz7Uit0zR5bIEL53VM9',
    '+ClkCTuAyyps37U78MS9Ll+qDz5LZkKQEw7/EJP4cXhZ+AvN/5UoRg+p/Hze+5owLlbAj4Xzg4HAZcQlU/j1kTYx',
    'BaWw7m/BcE1HDNGREaqtYB2x3YCRiq/jATsA7HNTp/2+rnwxGp+3jTFucJ6nI1/sKMuF0ZWYin4qkfIndfcZwAaY',
    'TZj92K/VkA/EJVP49ZE2MQWlsO5vwXBNRwzRkRGqrWAdus6xJxhcWYbpZlJYvul2rFnk5VsFCPnH2q35fDtFmFmB',
    'ZOLuB6z5uhiR7k/3lSL/CN+ANZ+/zvgYfOsnnbJ8PFivfMJkZ08AtoUfN52z2yrACknu4150UBAaEh3kVxjsHOkK',
    'YF5jXV/NaF+MlF4BdwPE9weNEB+wfIG7DqSo3Kkefu2hrBkPI7iQ/9E37imFYmPBGsXjQBj85MSIYygUYC/wdF8K',
    'evZXTdVXsV6kPIoGU5cYjetN1xIpuJ/ykKCDY1GxpqeAEGryIS2UArKLwBQRSxcZkzPZzK5XNAYd1ZkUqn8bs/t6',
    '5wNdwRG1fG94+11gAA==',
  ].join(''),
  kinds: [
    '4AP/ADxdACCICkZTtrvD0XrFyG0ng701gObqKUxuMvlsGUpGn0zW6O/Fbu9Sjjlz+RN8lsGRv8deveQ2L2a/22gA',
    'AAIBKzqrrCavIxpxbJFdMRg+vNLvUSKdck/b2W85bq4ryCIvDOPtjGh7oomZ1jmnn/JV/pEVuCCqepSKoE3Anf5J',
    'TNyO4LkGsjApSmAc3zy3Ys9CBRkMS7Pf4XxF+1BRZ3B4yQT4Qwy0SHPLxgXYn1jwbdflOKzu7+3875f+Fje8A+eq',
    'sGU4Q0nXWTvgf3/io8nWripnZu2rtU1z/5aKIzILl+8cfbpBlnj50mk8s2/L20J04YFfItcbJafO9suAoR6qrd8d',
    'sOgi0V4EKiBwYx+Iuq2DapJb29vH74f7FeyluJafFUljgJzJhjPNBSw9Qmuz/EkqxQIh7EKW0HITP1koSMb5q+vh',
    'hgHtaK9vBVGzeut+0fCbxFS8poxE7sb1Kelv06l4MtCabd1pg94zAKADHwA3ACCICkZTtrvD0XrFyG0ng701gObq',
    'KUxuMvlsGUpGn0zW6O/Fbu9Sjjlz+RN8lsGRv8devJC0yADAAlcANQAAIpnWwPEjN+LjrSbdBlH2i3+roIjaYJzU',
    'jH1mmcajwKmCRt7GGRjQiH2nmjANMTLe0c10AAABAMfnB0NF/5S6V68K/eSo/kU17do8KzBwU9icRZRX+qE1l6px',
    '31bJ6KWHZupMjP+NM9aApnlfym/ULaJt/15Dm99tJbsQYncLahwebGg9/yeNxD5Yc87Tl70qURJmOQUNc9rLcUhY',
    'xhQjNhmEQ6haMwwQi+Q+PjSI8PdAIbW38smVsyjTE6dYaUFn7rE92fp2CJMq+YLU7BFcf/loq41SxjAjEcf9sOaZ',
    'HZPmpFiZTBm38PgwYcOZbkLjsODDumFQigGKE9/vmt+cFuAB8wA1XQAgiApGU7a7w9F6xchtJ4O9NYDm6ilMbjL5',
    'bBlKRp9M1ujvxW7vUo45c/kTfJbBkb/G9m1QAAA=',
  ].join(''),
  lzmaMarker: [
    'ACCICkZTtrvD0XrFyG0ng701gObqKUxuMvlsGUpGn0zW6O/Fbu9Sjjlz+RN8lsGRv8deveRGjKq8W73CLAh8EH2m',
    'W0///Cb5gA==',
  ].join(''),
  lzmaPlain: [
    'ACCICkZTtrvD0Xpix1zdqtjGOkCk3bF0KQu7x0BfwArpEYG9pFO+Xz6810ccRhtU9vKHkLMOqSU9wzpmCppGgW96',
    'ofvw+1Lt0Fgo/MhkOfZFjrQf6MJu3Wt6BOa6zuCdjyNDOkvLQsOGBalVE5o827PesFCnSHl5wOjzDbqygsmIC5JG',
    '32cR02k/lN+K3C0LVRVc47hopL3iZcJJrhkbMxSRDDGQBqVwzP4z3sSiNhbiTocaVus2H0TEFX/Ypzy+EJ8wXLl5',
    '80ESlD49QMVpA9ZdPtULT+qa/F/kahFTo4UA',
  ].join(''),
}
