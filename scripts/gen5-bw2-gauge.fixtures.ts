// The invented C texts and symbol list that the gauge reader's spec hands to it (#137). They carry
// pokebw2's names, as the reader finds each place by name, with members in an order and widths of
// their own, invented addresses, offsets, sizes and enum values, and comments that give the
// invented offsets and sizes, so the relations hold on them. scripts/gen5-fixtures-real.test.ts
// compares what the reader computes from them, and the odd places below, with the generated
// numbers.
import type { GaugeNumbers } from '../src/gen5/bw2-gauge-numbers.ts'
import type { FieldLayout } from '../src/gen5/bw2-numbers.ts'
import type { GaugeInput } from './gen5-bw2-gauge.ts'

const lines = (...list: readonly string[]) => `${list.join('\n')}\n`

const EFFECT_SYMBOLS = lines(
  'sBtlvSpare kind:bss addr:0x0221a3c0',
  'sBtlvEffect kind:bss addr:0x0221b7e4',
  'BtlvEffect_Spin kind:function(thumb,size=0x40) addr:0x02219000',
)

const EFFECT_C = `#define BTLV_EFFECT_TASK_MAX 6

typedef void (*BtlvEffectTaskCallback)(TCB *task, void *work);

// The battle effect work, 0x34 bytes
struct BtlvEffect {
    u16 heapId;                              // 0x00
    TCB *tasks[BTLV_EFFECT_TASK_MAX];        // 0x04
    BtlvEffectTaskCallback taskCallbacks[3]; // 0x1c
    u8 taskCount;                            // 0x28
    BtlvGauge *gauge;                        // 0x2c
    u32 after;                               // 0x30
};

BtlvGauge *BtlvEffect_GetGauge(void) {
    return sBtlvEffect->gauge;
}
`

const GAUGE_C = `// What a gauge shows of its mon, 0x0c bytes
typedef struct {
    s32 hp;      // 0x00
    s32 maxHp;   // 0x04
    u8 level;    // 0x08
} BtlvGaugeMon;

// A battler's gauge, 0x20 bytes
typedef struct {
    u16 hpNumChars;       // 0x00
    ClActor *statusActor; // 0x04
    ClActor *hpNumActor;  // 0x08
    ClActor *expActor;    // 0x0c
    ClActor *nameActor;   // 0x10
    BtlvGaugeMon mon;     // 0x14
} BtlvGaugeEntry;

// The gauges' work, 0x70 bytes
struct BtlvGauge {
    u8 statusPalette;          // 0x00
    ClActUnit *unit;           // 0x04
    BtlvGaugeEntry entries[3]; // 0x08  by view position
    // 0x68
    u32 pinch : 3;             // bits 0-2
    u32 loaded : 1;            // bit 3
    u32 spare : 28;            // bits 4-31
    HeapID heapId;             // 0x6c
};
`

const MCSS_H = `typedef enum {
    BTLV_MCSS_POS_SINGLE_ENEMY = 0,
    BTLV_MCSS_POS_SINGLE_PLAYER = 2,
    BTLV_MCSS_POS_COUNT,
} BtlvMcssPos;
`

const FX_H = `typedef s32 fx32;

#define FX32_SHIFT 10
#define FX32_ONE ((fx32)(1 << FX32_SHIFT))
`

const GX_H = `typedef enum {
    GX_OAM_MODE_XLU = 0,
    GX_OAM_MODE_NORMAL = 1,
    GX_OAM_MODE_BITMAPOBJ = 2,
    GX_OAM_MODE_OBJWND = 3,
} GXOamMode;

typedef enum {
    GX_TEXFMT_NONE,
    GX_TEXFMT_PLTT4,
} GXTexFmt;
`

const G2D_H = `typedef enum {
    NNS_G2D_VRAM_TYPE_2DMAIN,
    NNS_G2D_VRAM_TYPE_2DSUB,
    NNS_G2D_VRAM_TYPE_MAX,
} NNS_G2D_VRAM_TYPE;

typedef struct {
    u32 baseAddrOfVram[NNS_G2D_VRAM_TYPE_MAX];
} NNSG2dVRamLocation;

typedef struct {
    GXTexFmt fmt;
    NNSG2dVRamLocation vramLocation;
} NNSG2dImageProxy;

typedef enum NNSG2dRendererOverwriteParam {
    NNS_G2D_RND_OVERWRITE_NONE = 0,
    NNS_G2D_RND_OVERWRITE_OBJMODE = 1 << 1,
    NNS_G2D_RND_OVERWRITE_MOSAIC = 1 << 3,
    NNS_G2D_RND_OVERWRITE_PRIORITY = 1 << 2,
} NNSG2dRendererOverwriteParam;
`

const CLACT_H = `typedef struct {
    s16 x;
    s16 y;
} ClActorPos;

struct ClActor {
    fx32 autoAnimSpeed;
    ClActorPos pos;
    NNSG2dImageProxy imgProxy;
    ClActUnit *unit;
    u16 rotation;
    u32 overwrite : 3;
    u32 objMode : 3;
    u32 priority : 6;
    u32 cellOnly : 1;
    u32 visible : 1;
    ClActAnim anim;
};
`

/** Every source the gauge reader reads, by role. */
export const GAUGE_INPUT: GaugeInput = {
  effectSymbols: EFFECT_SYMBOLS,
  effectC: EFFECT_C,
  gaugeC: GAUGE_C,
  mcssH: MCSS_H,
  clactH: CLACT_H,
  g2dH: G2D_H,
  gxH: GX_H,
  fxH: FX_H,
}

/** The places that the gauge reader's and the report's specs put into the read gauge: an objMode
 * across a byte, and an OBJMODE flag past overwrite's bits. Shaped as the gauge's parts, so the
 * guard compares each by name. */
export const ODD_READ_GAUGE = {
  layouts: { ClActor: { fields: { objMode: { offset: 4, size: 4, bit: 7, bits: 2 } } } },
  constants: { NNS_G2D_RND_OVERWRITE_OBJMODE: 1 << 4 },
} satisfies {
  layouts: { ClActor: { fields: Record<string, FieldLayout> } }
  constants: Partial<GaugeNumbers['constants']>
}
