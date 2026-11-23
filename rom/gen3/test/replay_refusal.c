#include "global.h"
#include "replay_refusal.h"
#include "string_util.h"
#include "text.h"
#include "test/test.h"
#include "constants/characters.h"

// The refusal screen names its reason in text (#30). Every refused code gets a text of its own,
// and each text fits the screen's window.

static u32 CountLines(const u8 *text)
{
    u32 lines = 1;

    for (; *text != EOS; text++)
    {
        if (*text == CHAR_NEWLINE)
            lines++;
    }
    return lines;
}

// The length of the text before its last line, the line that gives the code's number.
static u32 GetLengthBeforeNumber(const u8 *text)
{
    u32 i, length = 0;

    for (i = 0; text[i] != EOS; i++)
    {
        if (text[i] == CHAR_NEWLINE)
            length = i;
    }
    return length;
}

// Two texts that differ in their number alone would give two codes the same reason.
static bool32 HaveSameReason(const u8 *text, const u8 *other)
{
    u32 length = GetLengthBeforeNumber(text);

    return length == GetLengthBeforeNumber(other) && StringCompareN(text, other, length) == 0;
}

TEST("Replay: refusal: each refused code has its own text, and every text fits the screen")
{
    u8 text[REPLAY_REFUSAL_TEXT_SIZE];
    u8 other[REPLAY_REFUSAL_TEXT_SIZE];
    u32 error, otherError;

    for (error = REPLAY_ERROR_EMPTY; error <= REPLAY_ERROR_ORDER; error++)
    {
        Replay_FormatRefusal(error, text);
        EXPECT_LT(StringLength(text), REPLAY_REFUSAL_TEXT_SIZE);
        EXPECT_LE(GetStringWidth(FONT_NORMAL, text, 0), REPLAY_REFUSAL_WINDOW_WIDTH * TILE_WIDTH);
        EXPECT_LE(CountLines(text) * GetFontAttribute(FONT_NORMAL, FONTATTR_MAX_LETTER_HEIGHT), REPLAY_REFUSAL_WINDOW_HEIGHT * TILE_HEIGHT);
        for (otherError = REPLAY_ERROR_EMPTY; otherError < error; otherError++)
        {
            Replay_FormatRefusal(otherError, other);
            EXPECT(!HaveSameReason(text, other));
        }
    }
}
