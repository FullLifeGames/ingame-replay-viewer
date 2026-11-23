#include "global.h"
#include "bg.h"
#include "gpu_regs.h"
#include "menu.h"
#include "palette.h"
#include "replay_progress.h"
#include "replay_refusal.h"
#include "string_util.h"
#include "text.h"
#include "window.h"
#include "constants/characters.h"
#include "constants/rgb.h"

// The refusal screen (#30). Its words live here alone: the page words its own refusals before it
// boots a stream, and the screenshot tool reads the code's number and the names of enum
// ReplayError.

#define WINDOW_LEFT 2
#define WINDOW_TOP  4
#define WIN_TEXT    0 // the window of sWindowTemplates[0]

STATIC_ASSERT(WINDOW_LEFT + REPLAY_REFUSAL_WINDOW_WIDTH <= DISPLAY_TILE_WIDTH, ReplayRefusalWindowFitsTheScreenWidth);
STATIC_ASSERT(WINDOW_TOP + REPLAY_REFUSAL_WINDOW_HEIGHT <= DISPLAY_TILE_HEIGHT, ReplayRefusalWindowFitsTheScreenHeight);

// BG0 as CB2_FlashNotDetectedScreen sets it up.
static const struct BgTemplate sBgTemplates[] =
{
    {
        .bg = 0,
        .charBaseIndex = 2,
        .mapBaseIndex = 31,
        .screenSize = 0,
        .paletteMode = 0,
        .priority = 0,
        .baseTile = 0,
    },
};

static const struct WindowTemplate sWindowTemplates[] =
{
    {
        .bg = 0,
        .tilemapLeft = WINDOW_LEFT,
        .tilemapTop = WINDOW_TOP,
        .width = REPLAY_REFUSAL_WINDOW_WIDTH,
        .height = REPLAY_REFUSAL_WINDOW_HEIGHT,
        .paletteNum = 15,
        .baseBlock = 1,
    },
    DUMMY_WIN_TEMPLATE
};

// White text with a dark grey shadow on the refusal backdrop.
static const u8 sTextColors[] = {TEXT_COLOR_TRANSPARENT, TEXT_COLOR_WHITE, TEXT_COLOR_DARK_GRAY};

static const u8 sText_Header[] = _("The game cannot play this replay.\n\n");
static const u8 sText_Error[] = _("Error ");

// The reason of each refused code, in at most two lines of the window.
static const u8 *const sRefusalReasons[] =
{
    [REPLAY_ERROR_NONE]    = NULL,
    [REPLAY_ERROR_EMPTY]   = COMPOUND_STRING("The game holds no replay."),
    [REPLAY_ERROR_VERSION] = COMPOUND_STRING("Another version of the viewer\nwrote this replay."),
    [REPLAY_ERROR_HEADER]  = COMPOUND_STRING("The replay does not fit\nthis game's layout."),
    [REPLAY_ERROR_OP]      = COMPOUND_STRING("The replay holds an instruction\nthis game does not know."),
    [REPLAY_ERROR_SIZE]    = COMPOUND_STRING("An instruction in the replay\nhas the wrong size."),
    [REPLAY_ERROR_OVERRUN] = COMPOUND_STRING("An instruction runs past\nthe end of the replay."),
    [REPLAY_ERROR_NO_END]  = COMPOUND_STRING("The replay does not end\nwith an END instruction."),
    [REPLAY_ERROR_OPERAND] = COMPOUND_STRING("An instruction holds\na value out of range."),
    [REPLAY_ERROR_TEAM]    = COMPOUND_STRING("A team in the replay\ndoes not fit this game."),
    [REPLAY_ERROR_ORDER]   = COMPOUND_STRING("The replay's instructions come in\nan order the battle cannot follow."),
};

STATIC_ASSERT(ARRAY_COUNT(sRefusalReasons) == REPLAY_ERROR_ORDER + 1, ReplayRefusalReasonsCoverEveryError);

// REPLAY_ERROR_NONE has no reason, and the ROM never shows it; its screen gives the header and the
// number alone.
void Replay_FormatRefusal(enum ReplayError error, u8 *dest)
{
    dest = StringCopy(dest, sText_Header);
    if (error < ARRAY_COUNT(sRefusalReasons) && sRefusalReasons[error] != NULL)
    {
        dest = StringCopy(dest, sRefusalReasons[error]);
        *dest++ = CHAR_NEWLINE;
        *dest++ = CHAR_NEWLINE;
    }
    dest = StringCopy(dest, sText_Error);
    ConvertIntToDecimalStringN(dest, error, STR_CONV_MODE_LEFT_ALIGN, 2);
}

// The calls of CB2_FlashNotDetectedScreen with no frame around the window: the text stands on the
// backdrop RGB(REPLAY_REFUSED_RED, 0, 0), the colour the screenshot tool and the page look for. The
// window's copies reach VRAM on the next VBlank (VBlankIntr runs ProcessDma3Requests).
void Replay_ShowRefusal(enum ReplayError error)
{
    u8 text[REPLAY_REFUSAL_TEXT_SIZE];

    SetGpuReg(REG_OFFSET_DISPCNT, 0);
    SetGpuReg(REG_OFFSET_BLDCNT, 0);
    SetGpuReg(REG_OFFSET_BG0CNT, 0);
    SetGpuReg(REG_OFFSET_BG0HOFS, 0);
    SetGpuReg(REG_OFFSET_BG0VOFS, 0);
    DmaFill16(3, 0, VRAM, VRAM_SIZE);
    DmaFill32(3, 0, OAM, OAM_SIZE);
    DmaFill16(3, 0, PLTT, PLTT_SIZE);
    ResetBgsAndClearDma3BusyFlags(0);
    InitBgsFromTemplates(0, sBgTemplates, ARRAY_COUNT(sBgTemplates));
    DeactivateAllTextPrinters();
    ResetPaletteFade();
    LoadPalette(gStandardMenuPalette, BG_PLTT_ID(sWindowTemplates[WIN_TEXT].paletteNum), PLTT_SIZE_4BPP);
    InitWindows(sWindowTemplates);
    FillWindowPixelBuffer(WIN_TEXT, PIXEL_FILL(TEXT_COLOR_TRANSPARENT));
    Replay_FormatRefusal(error, text);
    AddTextPrinterParameterized4(WIN_TEXT, FONT_NORMAL, 0, 0, 0, 0, sTextColors, TEXT_SKIP_DRAW, text);
    PutWindowTilemap(WIN_TEXT);
    CopyWindowToVram(WIN_TEXT, COPYWIN_FULL);
    TransferPlttBuffer();
    *(vu16 *)PLTT = RGB(REPLAY_REFUSED_RED, 0, 0);
    ShowBg(0);
}
