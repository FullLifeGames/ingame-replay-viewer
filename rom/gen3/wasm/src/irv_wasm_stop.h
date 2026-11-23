#ifndef GUARD_IRV_WASM_STOP_H
#define GUARD_IRV_WASM_STOP_H

// The WebAssembly build (#46): the one way a run stops when it must not go on. The line, formatted
// as printf formats it after "irv-emerald: ", reaches the host as the message of an Error, and
// wasm:run and the page show it.
void IrvWasm_Stop(const char *format, ...) __attribute__((format(printf, 1, 2)));

#endif // GUARD_IRV_WASM_STOP_H
