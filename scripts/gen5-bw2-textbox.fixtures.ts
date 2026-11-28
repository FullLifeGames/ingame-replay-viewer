// The invented C texts, symbol list, link file, font and bank that the text box reader's spec hands
// to it (#118), and the invented numbers its relations' cases start from. They carry pokebw2's
// names, as the reader finds each place by name, with members in an order and widths of their
// own, invented addresses, sizes, literals and advances, and our own plain words as text.
// scripts/gen5-fixtures-real.test.ts compares the numbers, and what the reader computes from the
// texts, with the generated numbers.
import type { TextBoxNumbers } from '../src/gen5/bw2-numbers.ts'
import { MAIN_RAM_START } from '../src/gen5/main-ram.ts'
import { TEXT_BOX_CARRIER } from '../src/gen5/text-box.ts'
import type { TextBoxInput } from './gen5-bw2-textbox.ts'

const lines = (...list: readonly string[]) => `${list.join('\n')}\n`

/** Two `sWork`s, as the battle overlay lists one for the network's work too: only the second sits
 * in btl_string.c's `.bss` range. */
const SYMBOLS = lines(
  'sCounter kind:bss addr:0x02200010',
  'sWork kind:bss addr:0x02200040',
  'BtlString_Spin kind:function(thumb,size=0x20) addr:0x02210000',
  'sWork kind:bss addr:0x02208880',
)

const LINK = lines(
  '    .text       start:0x02210000 end:0x02218000 kind:code align:32',
  '    .bss        start:0x02200000 end:0x02209000 kind:bss align:32',
  '',
  'src/battle/btl_net.c:',
  '    complete',
  '    .bss        start:0x02200000 end:0x02200080',
  '',
  'src/battle/btl_string.c:',
  '    complete',
  '    .text       start:0x02210000 end:0x02210400',
  '    .bss        start:0x02208800 end:0x02208900',
)

const STRING_C = `typedef struct BtlStringWork {
    u16 heapId;
    WordSet *wordSet;
    u8 clientId;
    BtlMainModule *mainModule;
    StrBuf *strbuf;
} BtlStringWork;

static const u16 sSideMessages[] = {
    0x31, 0x33, 0x35,
};

static BtlStringWork sWork;
`

const VIEW_H = 'typedef BOOL (*BtlvMainProc)(BtlvCore *core, s32 *seq, void *work);\n'

const VIEW_CORE_C = `struct BtlvCore {
    BtlvMainProc mainProc;
    u8 work[0x14];
    u16 clientId;
    StrBuf *strbuf;
    Font *font;
};

BtlvCore *BtlvCore_Create(BtlMainModule *mainModule, HeapID heapId) {
    BtlvCore *core;

    core = GFL_HeapAllocate(heapId, sizeof(BtlvCore), FALSE, "btlv_core.c", 12);
    core->strbuf = GFL_StrBufCreate(0x9c, heapId);
    core->font = GFL_FontCreate(3, 0, 0, 0, heapId);
    return core;
}
`

/** The window's call and a prototype with the parameters in an order of their own: the reader
 * places each argument by its parameter's name. */
const SCU_C = `static void BtlvScu_SetupWindows(BtlvScu *scu) {
    scu->stateWin = BmpWin_CreateDynamic(2, 3, 2, 9, 1, 0, 0);
    scu->msgWin = BmpWin_CreateDynamic(2, 6, 1, 17, 50, 3, 0);
}
`
const BMP_WIN_H =
  'BmpWin *BmpWin_CreateDynamic(u8 bg, u8 height, u8 x, u8 y, u8 width, u8 palette, u8 fromEnd);\n'

/** The task's line step beside a page clear's return to the window's top. */
const PRINTSYS_C = `#define CHAR_NEWLINE 0xfff1
#define CHAR_EOM 0xfff3

static void PrintStream_Task(TCBEx *task, void *data) {
    PrintStream *stream = data;
    if (stream->lines > 0) {
        stream->renderer.y = 12;
    }
}

static void PrintStream_ExecStreamCmd(PrintStream *stream) {
    stream->renderer.y = 0;
}
`

const STRBUF_C = `#define STRBUF_MAGIC 0x5eedbeef

struct StrBuf {
    u32 magic;
    u16 size;
    u8 tag;
    u8 pad[3];
    u16 length;
    u16 chars[1];
};
`

const FONT_0 = JSON.stringify({
  glyphs: [
    { char: 'Z', advance: 13 },
    { char: 'a', advance: 17 },
    { code: 'U+0037', advance: 19 },
    { char: '♂', advance: 14 },
  ],
})

const STANDARD = lines(
  'Bank0019_Text_FillerAlpha = An invented line.',
  'Bank0019_Text_ButNothingHappened = An invented neutral line.',
  '\\pad{5}',
)

/** Every text the reader reads, the labels of the invented standard bank and the characters both
 * invented fonts draw. */
export const TEXT_BOX_INPUT: TextBoxInput = {
  symbols: SYMBOLS,
  battleLink: LINK,
  stringC: STRING_C,
  mainH: 'struct BtlMainModule { u32 seed; u8 flags[6]; BtlvCore *viewCore; };\n',
  viewH: VIEW_H,
  viewCoreC: VIEW_CORE_C,
  scuC: SCU_C,
  bmpWinH: BMP_WIN_H,
  printsysC: PRINTSYS_C,
  strbufC: STRBUF_C,
  font0: FONT_0,
  standardBank: STANDARD,
  standard: { Bank0019_Text_FillerAlpha: 0, Bank0019_Text_ButNothingHappened: 1 },
  chars: '7Za',
}

/** Invented text box numbers that hold every relation of textBoxRelations; each case of its spec
 * breaks one. StrBuf's two members sit in an order, at offsets and in widths of their own. */
export const TEXT_BOX_NUMBERS: TextBoxNumbers = {
  stringWork: { name: 'sWork', kind: 'bss', address: MAIN_RAM_START + 0x40, module: 'ov167' },
  mainModule: 12,
  viewCore: 12,
  strbuf: 28,
  strBuf: {
    size: 20,
    align: 4,
    fields: { chars: { offset: 4, size: 4 }, magic: { offset: 10, size: 2 } },
  },
  constants: { STRBUF_MAGIC: 0x5eedbeef, CHAR_EOM: 0xfff3, CHAR_NEWLINE: 0xfff1 },
  room: 0x9c,
  windowWidth: 400,
  pageLines: 3,
  advances: { '7': 9, Z: 11, a: 8 },
  carrier: TEXT_BOX_CARRIER,
}
