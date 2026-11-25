#include "irv_wasm_divide.h"

// WebAssembly's division and remainder trap on a zero divisor, and its signed division traps on
// INT_MIN / -1. The ROM's libgcc 14.2.1 (thumb/nofp) returns a value for each and goes on, and
// these helpers return the same. After the link, scripts/wasm-divide.ts turns every division and
// remainder outside them into a call of its helper. It finds each helper by its name, so the link
// exports all eight (scripts/wasm-link.ts) though no C code calls them. Each helper tests the
// divisor and the overflow case before its own op, so that op never traps, and calls no function
// that divides: such a division would become a call back into the helper.
//
// By zero, a 32-bit quotient and remainder both give the quotient saturated by the numerator's
// sign (0 for 0, all ones unsigned). A 64-bit result by zero depends on the bit length k of the
// numerator's magnitude (0 for 0, 64 from 2^63 on): the quotient is 2^(k+1) - 1 and the remainder
// the numerator modulo 2^(64-k), both modulo 2^64; a signed one takes the result of the magnitude
// with the numerator's sign. The ROM links no 64-bit remainder helper, so those two follow
// libgcc's __moddi3 and __umoddi3 from the same archive.

static int32_t SignedByZero32(int32_t n)
{
    if (n > 0)
        return INT32_MAX;
    if (n < 0)
        return INT32_MIN;
    return 0;
}

static uint32_t UnsignedByZero32(uint32_t n)
{
    return n == 0 ? 0 : UINT32_MAX;
}

static int BitLength(uint64_t n)
{
    return n == 0 ? 0 : 64 - __builtin_clzll(n);
}

static uint64_t QuotientByZero64(uint64_t n)
{
    int k = BitLength(n);

    if (k >= 63)
        return UINT64_MAX;
    return ((uint64_t)1 << (k + 1)) - 1;
}

static uint64_t RemainderByZero64(uint64_t n)
{
    int k = BitLength(n);

    if (k == 0 || k == 64)
        return 0;
    return n & (((uint64_t)1 << (64 - k)) - 1);
}

static uint64_t Magnitude64(int64_t n)
{
    return n < 0 ? -(uint64_t)n : (uint64_t)n;
}

static int64_t WithSign64(uint64_t result, int64_t n)
{
    return (int64_t)(n < 0 ? -result : result);
}

int32_t IrvWasm_I32DivS(int32_t n, int32_t d)
{
    if (d == 0)
        return SignedByZero32(n);
    if (n == INT32_MIN && d == -1)
        return INT32_MIN;
    return n / d;
}

uint32_t IrvWasm_I32DivU(uint32_t n, uint32_t d)
{
    if (d == 0)
        return UnsignedByZero32(n);
    return n / d;
}

int32_t IrvWasm_I32RemS(int32_t n, int32_t d)
{
    if (d == 0)
        return SignedByZero32(n);
    if (n == INT32_MIN && d == -1)
        return 0;
    return n % d;
}

uint32_t IrvWasm_I32RemU(uint32_t n, uint32_t d)
{
    if (d == 0)
        return UnsignedByZero32(n);
    return n % d;
}

int64_t IrvWasm_I64DivS(int64_t n, int64_t d)
{
    if (d == 0)
        return WithSign64(QuotientByZero64(Magnitude64(n)), n);
    if (n == INT64_MIN && d == -1)
        return INT64_MIN;
    return n / d;
}

uint64_t IrvWasm_I64DivU(uint64_t n, uint64_t d)
{
    if (d == 0)
        return QuotientByZero64(n);
    return n / d;
}

int64_t IrvWasm_I64RemS(int64_t n, int64_t d)
{
    if (d == 0)
        return WithSign64(RemainderByZero64(Magnitude64(n)), n);
    if (n == INT64_MIN && d == -1)
        return 0;
    return n % d;
}

uint64_t IrvWasm_I64RemU(uint64_t n, uint64_t d)
{
    if (d == 0)
        return RemainderByZero64(n);
    return n % d;
}
