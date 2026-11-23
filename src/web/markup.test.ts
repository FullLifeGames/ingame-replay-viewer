import { describe, expect, it } from 'vitest'

import { plainText } from './markup'

describe('plainText drops the tags', () => {
  it('turns each tag into a space and a run of spaces into one', () => {
    expect(plainText('<div class="infobox">Leftovers  <br />Ability</div>')).toBe(
      'Leftovers Ability',
    )
  })

  it('drops closing tags', () => {
    expect(plainText('1111 <strong>1092</strong>')).toBe('1111 1092')
  })

  // A tag needs a letter after "<", so chat hearts and comparisons keep their "<".
  it('keeps a "<" that no letter follows', () => {
    expect(plainText('<3')).toBe('<3')
    expect(plainText('a < b')).toBe('a < b')
  })

  it('keeps an unclosed "<" as written', () => {
    expect(plainText('a <div class="x"')).toBe('a <div class="x"')
  })

  it('keeps a line with no markup as written', () => {
    expect(plainText('|move|p1a: X|Y|p2a: Z')).toBe('|move|p1a: X|Y|p2a: Z')
  })

  it('gives an empty line back empty', () => {
    expect(plainText('')).toBe('')
  })
})

describe('plainText decodes the references', () => {
  it('decodes the named references Showdown writes', () => {
    expect(plainText('&amp; &lt; &gt; &quot; &#39; &apos; &rarr;')).toBe("& < > \" ' ' →")
    expect(plainText('a&nbsp;b')).toBe('a\u00a0b')
  })

  it('decodes decimal and hex references', () => {
    expect(plainText('48 HP &#47; 180 SpA &#x2f; 44 SpD &#X2F; 236 Spe')).toBe(
      '48 HP / 180 SpA / 44 SpD / 236 Spe',
    )
    expect(plainText('&#x1F525;')).toBe('🔥')
  })

  it('keeps an unknown named reference as written', () => {
    expect(plainText('&bogus; &amp')).toBe('&bogus; &amp')
  })

  it('keeps a reference to no character as written', () => {
    expect(plainText('&#0; &#x110000; &#xD800; &#99999999999;')).toBe(
      '&#0; &#x110000; &#xD800; &#99999999999;',
    )
  })

  it('decodes each reference once', () => {
    expect(plainText('&amp;lt; &amp;#47;')).toBe('&lt; &#47;')
  })

  // The decoded text is text: the list writes it as `textContent`, so a decoded tag never runs.
  it('leaves a decoded tag as text and never drops it as markup', () => {
    expect(plainText('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<script>alert(1)</script>')
  })
})

describe('plainText on long lines', () => {
  const LONG = 200_000

  it('reads a long line of unclosed tags in one pass', () => {
    const line = '<a'.repeat(LONG)
    expect(plainText(line)).toBe(line)
  })

  it('reads a long line of unclosed references in one pass', () => {
    const line = '&#x'.repeat(LONG) + '&a'.repeat(LONG)
    expect(plainText(line)).toBe(line)
  })

  it('reads a long line of tags', () => {
    expect(plainText('<br>x'.repeat(LONG))).toBe(' x'.repeat(LONG).trim())
  })
})
