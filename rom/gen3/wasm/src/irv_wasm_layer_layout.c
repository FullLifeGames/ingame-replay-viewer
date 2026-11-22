#include "global.h"
#include "irv_bios_types.h"
#include <stddef.h>

// The WebAssembly build (#43): our platform layer takes the BIOS's data fields in its own structs
// (layer/irv_bios_types.h), in GBATEK's layout, while the game passes its own (gba/types.h). These
// asserts hold each field of each pair at one offset and one size.

#define FIELD_SIZE(type, field) sizeof(((struct type *)0)->field)

#define SAME_FIELD(ours, ourField, game, gameField)                                       \
    STATIC_ASSERT(offsetof(struct ours, ourField) == offsetof(struct game, gameField)     \
                  && FIELD_SIZE(ours, ourField) == FIELD_SIZE(game, gameField),           \
                  IrvWasmLayer_##game##_##gameField)

STATIC_ASSERT(sizeof(struct IrvBgAffineSource) == sizeof(struct BgAffineSrcData), IrvWasmLayerBgSrcSize);
SAME_FIELD(IrvBgAffineSource, textureX, BgAffineSrcData, texX);
SAME_FIELD(IrvBgAffineSource, textureY, BgAffineSrcData, texY);
SAME_FIELD(IrvBgAffineSource, screenX, BgAffineSrcData, scrX);
SAME_FIELD(IrvBgAffineSource, screenY, BgAffineSrcData, scrY);
SAME_FIELD(IrvBgAffineSource, scaleX, BgAffineSrcData, sx);
SAME_FIELD(IrvBgAffineSource, scaleY, BgAffineSrcData, sy);
SAME_FIELD(IrvBgAffineSource, angle, BgAffineSrcData, alpha);

STATIC_ASSERT(sizeof(struct IrvBgAffineDest) == sizeof(struct BgAffineDstData), IrvWasmLayerBgDstSize);
SAME_FIELD(IrvBgAffineDest, pa, BgAffineDstData, pa);
SAME_FIELD(IrvBgAffineDest, pb, BgAffineDstData, pb);
SAME_FIELD(IrvBgAffineDest, pc, BgAffineDstData, pc);
SAME_FIELD(IrvBgAffineDest, pd, BgAffineDstData, pd);
SAME_FIELD(IrvBgAffineDest, startX, BgAffineDstData, dx);
SAME_FIELD(IrvBgAffineDest, startY, BgAffineDstData, dy);

STATIC_ASSERT(sizeof(struct IrvObjAffineSource) == sizeof(struct ObjAffineSrcData), IrvWasmLayerObjSrcSize);
SAME_FIELD(IrvObjAffineSource, scaleX, ObjAffineSrcData, xScale);
SAME_FIELD(IrvObjAffineSource, scaleY, ObjAffineSrcData, yScale);
SAME_FIELD(IrvObjAffineSource, angle, ObjAffineSrcData, rotation);
