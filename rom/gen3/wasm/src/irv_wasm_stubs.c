#include "global.h"
#include "agb_flash.h"
#include "crt0.h"
#include "libgcnmultiboot.h"
#include "librfu.h"
#include "main.h"
#include "mini_printf.h"
#include "multiboot.h"
#include "siirtc.h"
#include "gba/flash_internal.h"
#include "irv_wasm_stop.h"
#include "irv_wasm_stub_list.h"
#include <stdio.h>

// The WebAssembly build (#35) leaves out the files that drive cartridge and link hardware
// (wasm.json "exclude") and the assembly of crt0.s and the BIOS. These stand in for their symbols.
// Each kind does what the replay needs and no more:
// - Flash is present and empty, as the ROM sees it on mGBA. The replay never loads a save and
//   never writes flash (replay_boot.c), so a write stops the run.
// - The clock is fixed and working, so every run of a stream sees the same time.
// - Link and multiboot calls report success with 0. A replay reaches only the ones InitRFU makes
//   at boot, which irv_wasm_stub_list.h lists (#46); each logs once. Any other stops the run.
// - A call that cannot work here (a soft reset, the crash screen) stops the run.
// - DebugPrintf and the asserts print to the console, as mGBA's log does. An assert that stops
//   the program then stops the run with its file, line and expression (irv_wasm_stop.c); a
//   warning prints and the run carries on.

// A stub off the list ends the run with its name (irv_wasm_stop.c).
static void StopAtStub(const char *name)
{
    IrvWasm_Stop("%s is a stub that no replay should call", name);
}

// Lets a listed stub run and prints its name the first time; stops the run at any other.
static void StubCalled(const char *name, bool8 *logged)
{
    if (*logged)
        return;
    if (!IrvWasm_StubMayRun(name))
        StopAtStub(name);
    *logged = TRUE;
    printf("irv-emerald: %s is a stub in the WebAssembly build\n", name);
}

#define LOGGED_STUB(type, name, params) \
    type name params { static bool8 logged; StubCalled(#name, &logged); return (type)0; }
#define LOGGED_VOID_STUB(name, params) \
    void name params { static bool8 logged; StubCalled(#name, &logged); }
#define UNSUPPORTED_STUB(name, params) \
    void name params { StopAtStub(#name); }

// crt0.s and rom_header.s. INTR_VECTOR takes IntrMain's address, which no one calls here: the
// frame glue calls gIntrTable itself. The header fields hold what gbafix writes from the Makefile.
u32 IntrMain[1];
const u8 RomHeaderGameCode[GAME_CODE_LENGTH] = "BPEE";
const u8 RomHeaderSoftwareVersion = 0;

UNSUPPORTED_STUB(ReInitializeEWRAM, (void))
UNSUPPORTED_STUB(SoftReset, (u32 resetFlags))
UNSUPPORTED_STUB(RegisterRamReset, (u32 resetFlags))
UNSUPPORTED_STUB(BitUnPack, (const void *src, void *dest, const void *args))

// Flash: agb_flash*.c.
static u16 EraseFlashSector_Stub(u16 sectorNum);
static u16 ProgramFlashByte_Stub(u16 sectorNum, u32 offset, u8 data);

u16 (*EraseFlashSector)(u16) = EraseFlashSector_Stub;
u16 (*ProgramFlashByte)(u16, u32, u8) = ProgramFlashByte_Stub;

u16 IdentifyFlash(void)
{
    return 0;
}

u16 SetFlashTimerIntr(u8 timerNum, void (**intrFunc)(void))
{
    return 0;
}

// Erased flash reads as 0xFF.
void ReadFlash(u16 sectorNum, u32 offset, u8 *dest, u32 size)
{
    memset(dest, 0xFF, size);
}

LOGGED_STUB(u32, ProgramFlashSectorAndVerify, (u16 sectorNum, u8 *src))

static u16 EraseFlashSector_Stub(u16 sectorNum)
{
    static bool8 logged;

    StubCalled("EraseFlashSector", &logged);
    return 0;
}

static u16 ProgramFlashByte_Stub(u16 sectorNum, u32 offset, u8 data)
{
    static bool8 logged;

    StubCalled("ProgramFlashByte", &logged);
    return 0;
}

// The clock: siirtc.c. Noon on 1 January 2000, in BCD, in 24-hour mode with no power failure.
static const struct SiiRtcInfo sFixedTime =
{
    .year = 0x00,
    .month = 0x01,
    .day = 0x01,
    .dayOfWeek = 0x06,
    .hour = 0x12,
    .minute = 0x00,
    .second = 0x00,
    .status = SIIRTCINFO_24HOUR,
};

void SiiRtcUnprotect(void)
{
}

void SiiRtcProtect(void)
{
}

// The low nibble 1 is a working clock, the high nibble 0 a clock that kept its time.
u8 SiiRtcProbe(void)
{
    return 1;
}

bool8 SiiRtcReset(void)
{
    return TRUE;
}

bool8 SiiRtcGetStatus(struct SiiRtcInfo *rtc)
{
    rtc->status = sFixedTime.status;
    return TRUE;
}

bool8 SiiRtcGetDateTime(struct SiiRtcInfo *rtc)
{
    u8 status = rtc->status;

    *rtc = sFixedTime;
    rtc->status = status;
    return TRUE;
}

// The wireless adapter: librfu_*.c.
LOGGED_STUB(u16, rfu_CHILD_getConnectRecoveryStatus, (u8 *status))
LOGGED_STUB(u16, rfu_NI_CHILD_setSendGameName, (u8 slotNo, u8 subFrameSize))
LOGGED_STUB(u16, rfu_NI_setSendData, (u8 bmSendSlot, u8 subFrameSize, const void *src, u32 size))
LOGGED_STUB(u16, rfu_NI_stopReceivingData, (u8 slotStatusIndex))
LOGGED_STUB(u32, rfu_REQBN_softReset_and_checkID, (void))
LOGGED_STUB(u16, rfu_REQBN_watchLink, (u16 reqCommandId, u8 *bmLinkLossSlot, u8 *linkLossReason, u8 *parentBmLinkRecoverySlot))
LOGGED_VOID_STUB(rfu_REQ_CHILD_endConnectRecovery, (void))
LOGGED_VOID_STUB(rfu_REQ_CHILD_pollConnectRecovery, (void))
LOGGED_VOID_STUB(rfu_REQ_CHILD_startConnectRecovery, (u8 bmRecoverySlot))
LOGGED_VOID_STUB(rfu_REQ_PARENT_resumeRetransmitAndChange, (void))
LOGGED_VOID_STUB(rfu_REQ_RFUStatus, (void))
LOGGED_VOID_STUB(rfu_REQ_changeMasterSlave, (void))
LOGGED_VOID_STUB(rfu_REQ_configGameData, (u8 mbootFlag, u16 serialNo, const u8 *gname, const u8 *uname))
LOGGED_VOID_STUB(rfu_REQ_configSystem, (u16 availSlotFlag, u8 maxMFrame, u8 mcTimer))
LOGGED_VOID_STUB(rfu_REQ_disconnect, (u8 bmDisconnectSlot))
LOGGED_VOID_STUB(rfu_REQ_endConnectParent, (void))
LOGGED_VOID_STUB(rfu_REQ_endSearchChild, (void))
LOGGED_VOID_STUB(rfu_REQ_endSearchParent, (void))
LOGGED_VOID_STUB(rfu_REQ_pollConnectParent, (void))
LOGGED_VOID_STUB(rfu_REQ_pollSearchChild, (void))
LOGGED_VOID_STUB(rfu_REQ_pollSearchParent, (void))
LOGGED_VOID_STUB(rfu_REQ_recvData, (void))
LOGGED_VOID_STUB(rfu_REQ_reset, (void))
LOGGED_VOID_STUB(rfu_REQ_sendData, (bool8 clockChangeFlag))
LOGGED_VOID_STUB(rfu_REQ_startConnectParent, (u16 pid))
LOGGED_VOID_STUB(rfu_REQ_startSearchChild, (void))
LOGGED_VOID_STUB(rfu_REQ_startSearchParent, (void))
LOGGED_VOID_STUB(rfu_REQ_stopMode, (void))
LOGGED_STUB(u16, rfu_UNI_PARENT_getDRAC_ACK, (u8 *ackFlag))
LOGGED_VOID_STUB(rfu_UNI_clearRecvNewDataFlag, (u8 slotStatusIndex))
LOGGED_VOID_STUB(rfu_UNI_readySendData, (u8 slotStatusIndex))
LOGGED_STUB(u16, rfu_UNI_setSendData, (u8 bmSendSlot, const void *src, u8 size))
LOGGED_STUB(u16, rfu_changeSendTarget, (u8 connType, u8 slotStatusIndex, u8 bmNewTgtSlot))
LOGGED_VOID_STUB(rfu_clearAllSlot, (void))
LOGGED_STUB(u16, rfu_clearSlot, (u8 connTypeFlag, u8 slotStatusIndex))
LOGGED_STUB(u16, rfu_getConnectParentStatus, (u8 *status, u8 *connectSlotNo))
LOGGED_STUB(bool8, rfu_getMasterSlave, (void))
LOGGED_STUB(u16, rfu_getRFUStatus, (u8 *rfuState))
LOGGED_STUB(u8 *, rfu_getSTWIRecvBuffer, (void))
LOGGED_STUB(u16, rfu_initializeAPI, (u32 *APIBuffer, u16 buffByteSize, IntrFunc *sioIntrTable_p, bool8 copyInterruptToRam))
LOGGED_VOID_STUB(rfu_setMSCCallback, (void (*callback)(u16 reqCommandId)))
LOGGED_VOID_STUB(rfu_setREQCallback, (void (*callback)(u16 reqCommandId, u16 reqResult)))
LOGGED_STUB(u16, rfu_setRecvBuffer, (u8 connType, u8 slotNo, void *buffer, u32 buffSize))
LOGGED_VOID_STUB(rfu_setTimerInterrupt, (u8 timerNo, IntrFunc *timerIntrTable_p))
LOGGED_STUB(u16, rfu_syncVBlank, (void))
LOGGED_STUB(u16, rfu_waitREQComplete, (void))

// librfu_rfu.c's state, read by the link code once a link starts.
struct RfuLinkStatus *gRfuLinkStatus;
struct RfuSlotStatusNI *gRfuSlotStatusNI[RFU_CHILD_MAX];
struct RfuSlotStatusUNI *gRfuSlotStatusUNI[RFU_CHILD_MAX];

// Multiboot to another GBA (multiboot.c) and to a GameCube (libgcnmultiboot.s).
LOGGED_VOID_STUB(MultiBootInit, (struct MultiBootParam *mp))
LOGGED_STUB(int, MultiBootMain, (struct MultiBootParam *mp))
LOGGED_VOID_STUB(MultiBootStartMaster, (struct MultiBootParam *mp, const u8 *srcp, int length, u8 palette_color, s8 palette_speed))
LOGGED_STUB(int, MultiBootCheckComplete, (struct MultiBootParam *mp))
LOGGED_VOID_STUB(GameCubeMultiBoot_Main, (struct GcmbStruct *pStruct))
LOGGED_VOID_STUB(GameCubeMultiBoot_ExecuteProgram, (struct GcmbStruct *pStruct))
LOGGED_VOID_STUB(GameCubeMultiBoot_Init, (struct GcmbStruct *pStruct))
LOGGED_VOID_STUB(GameCubeMultiBoot_HandleSerialInterrupt, (struct GcmbStruct *pStruct))
LOGGED_VOID_STUB(GameCubeMultiBoot_Quit, (void))

// mGBA's debug log: libisagbprn.c. The game formats with mini_printf, as for mGBA.
#define MGBA_REG_DEBUG_MAX 256

bool32 MgbaOpen(void)
{
    return TRUE;
}

void MgbaPrintf(s32 level, const char *ptr, ...)
{
    char buffer[MGBA_REG_DEBUG_MAX + 1];
    va_list args;

    va_start(args, ptr);
    mini_vsnprintf(buffer, MGBA_REG_DEBUG_MAX, ptr, args);
    va_end(args);
    buffer[MGBA_REG_DEBUG_MAX] = '\0';
    printf("%s\n", buffer);
}

void MgbaAssert(const char *pFile, s32 nLine, const char *pExpression, bool32 nStopProgram)
{
    if (nStopProgram)
    {
        MgbaPrintf(MGBA_LOG_ERROR, "ASSERTION FAILED  FILE=[%s] LINE=[%d]  EXP=[%s]", pFile, nLine, pExpression);
        // File and line come first, so a cut at the end of the line drops only the expression's end.
        IrvWasm_Stop("assert failed at %s line %d: %s", pFile, nLine, pExpression);
    }
    else
    {
        MgbaPrintf(MGBA_LOG_WARN, "WARNING FILE=[%s] LINE=[%d]  EXP=[%s]", pFile, nLine, pExpression);
    }
}
