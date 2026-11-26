import { describe, expect, it } from 'vitest'

import {
  checkApart,
  checkBootOverlays,
  gameInitOverlays,
  linkSpan,
  overlayName,
} from './gen5-bw2-span'

// Every input here is written for the spec; none is copied from pokebw2, and every address is
// invented.
const LINK = [
  '    .text       start:0x02190000 end:0x02190400 kind:code align:32',
  '    .rodata     start:0x02190400 end:0x02190480 kind:rodata align:4',
  '    .bss        start:0x021904a0 end:0x02190600 kind:bss align:32',
  '',
  'src/invented/spin.c:',
  '    complete',
  '    .text       start:0x02190000 end:0x02190100',
  '',
].join('\n')

// Scene: the routine lives in the battle overlay's span, from its first section to its last.
describe('linkSpan', () => {
  it("spans the header's sections, from the first start to the last end", () => {
    expect(linkSpan(LINK, 'ov101')).toEqual({ start: 0x02190000, end: 0x02190600 })
  })

  it('throws on a header line it cannot read, on a section that ends before it starts, and on no header', () => {
    const odd = LINK.replace('kind:rodata align:4', 'kind:rodata')
    expect(() => linkSpan(odd, 'ov101')).toThrow(/ov101.*\.rodata/)
    const back = LINK.replace('end:0x02190480', 'end:0x021903f0')
    expect(() => linkSpan(back, 'ov101')).toThrow(/ov101.*\.rodata/)
    expect(() => linkSpan('\nsrc/invented/spin.c:\n', 'ov101')).toThrow(/ov101/)
  })
})

// Scene: an overlay that stays loaded from boot on must not share a byte with the routine.
describe('checkApart', () => {
  const battle = { start: 0x02190000, end: 0x02190600 }

  it('passes spans that touch or lie apart', () => {
    const others = {
      ov102: { start: 0x02180000, end: 0x02190000 },
      ov103: { start: 0x02190600, end: 0x021a0000 },
    }
    expect(() => {
      checkApart('ov101', battle, others)
    }).not.toThrow()
  })

  it('throws with both names when a span meets one', () => {
    const others = {
      ov102: { start: 0x02180000, end: 0x02190000 },
      ov103: { start: 0x021905fc, end: 0x021a0000 },
    }
    expect(() => {
      checkApart('ov101', battle, others)
    }).toThrow(/ov101.*ov103/)
  })
})

// Scene: the generator reads the link files of the overlays GameInit loads, and of no other.
describe('gameInitOverlays and checkBootOverlays', () => {
  const main = `
static void GameInit(void);

static void GameInit(void) {
    GFL_OvlLoad(OVERLAY_ID(4));
    // GFL_OvlLoad(OVERLAY_ID(9)); a comment loads nothing
    GFL_OvlLoad(OVERLAY_ID(31));
    GCTX_ProcMgrQueueProc(OVERLAY_NONE, &EVENT_TITLE_FUNCS, NULL);
}
`

  it('names each overlay that GameInit loads, as the config names it', () => {
    expect(overlayName(7)).toBe('ov007')
    expect(gameInitOverlays(main)).toEqual(['ov004', 'ov031'])
  })

  it('throws on a load in any other form', () => {
    const odd = main.replace('GFL_OvlLoad(OVERLAY_ID(31))', 'GFL_OvlLoad(sNextOverlay)')
    expect(() => gameInitOverlays(odd)).toThrow(/GFL_OvlLoad/)
  })

  it('throws unless the loads equal the listed link files, naming the odd one', () => {
    expect(() => {
      checkBootOverlays(['ov004', 'ov031'], ['ov031', 'ov004'])
    }).not.toThrow()
    expect(() => {
      checkBootOverlays(['ov004', 'ov031'], ['ov004'])
    }).toThrow(/ov031/)
    expect(() => {
      checkBootOverlays(['ov004'], ['ov004', 'ov031'])
    }).toThrow(/ov031/)
  })
})
