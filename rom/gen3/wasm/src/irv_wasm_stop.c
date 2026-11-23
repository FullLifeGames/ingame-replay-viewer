#include <stdarg.h>
#include <stdio.h>
#include "irv_wasm_stop.h"
#include <emscripten/em_js.h>

// The throw ends AgbMain, as a throw of the frame import does (irv_wasm_frame.c), and the host
// shows the message. It must not throw a number: Emscripten's setjmp support reads a thrown
// number as a longjmp. The message reads the line with UTF8ToString, which the link includes
// only when asked.
EM_JS_DEPS(irv_wasm_stop, "$UTF8ToString");
EM_JS(void, IrvWasm_Throw, (const char *line), {
    throw new Error(UTF8ToString(line));
});

#define STOP_PREFIX "irv-emerald: "

void IrvWasm_Stop(const char *format, ...)
{
    char line[160] = STOP_PREFIX;
    va_list args;

    va_start(args, format);
    vsnprintf(line + sizeof(STOP_PREFIX) - 1, sizeof(line) - sizeof(STOP_PREFIX) + 1, format, args);
    va_end(args);
    IrvWasm_Throw(line);
}
