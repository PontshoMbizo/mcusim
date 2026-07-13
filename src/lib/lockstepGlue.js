// Lockstep glue codegen for fulgurlab bridge sessions (bridge-protocol v1).
//
// The user's firmware declares its bridge pins with (see firmware/trace.h):
//     LOCKSTEP_PINS("PC13:out", "PA0:in");
// We parse that declaration host-side and append generated C that provides STRONG
// versions of the trace shim's weak hooks plus a SysTick-driven quantum exchange:
//
//   __lockstep_boot()      reads the first `T <quantum_ns> <in_hex>` line (blocking
//                          semihosting SYS_READC) and arms SysTick before main() runs
//   SysTick_Handler()      per quantum: emit `O <t_ns> <out_hex>`, then block reading
//                          the next T line — the vCPU stalls inside the semihosting
//                          call, which IS the lockstep
//   __trace_pin_hook()     output pins: update the out shadow + emit capped `E` lines
//   __trace_read_hook()    input pins: serve bits from the in shadow
//
// Virtual time = tick_count × quantum_ns (SysTick owns time; sub-quantum instruction
// timing is approximate). Engine cycle rates differ: mainline models an F100 @ 24 MHz,
// xpack a real F103 @ 72 MHz — pass `cyclesPerUs` accordingly.

/** Parse the LOCKSTEP_PINS declaration. Returns {pins:[{name,dir}]} or {error}. */
export function parseLockstepPins(source) {
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const m = /\bLOCKSTEP_PINS\s*\(([^)]*)\)/.exec(noComments);
  if (!m) return { error: 'no LOCKSTEP_PINS("PIN:dir", ...) declaration in firmware' };
  const pins = [];
  const seen = new Set();
  for (const raw of m[1].split(",")) {
    const s = raw.trim();
    if (!s) continue;
    const pm = /^"([A-Za-z_]\w*)\s*:\s*(in|out)"$/.exec(s);
    if (!pm) return { error: `bad LOCKSTEP_PINS entry ${s} (want "NAME:in" or "NAME:out")` };
    if (seen.has(pm[1])) return { error: `duplicate pin ${pm[1]} in LOCKSTEP_PINS` };
    seen.add(pm[1]);
    pins.push({ name: pm[1], dir: pm[2] });
  }
  if (pins.length === 0) return { error: "LOCKSTEP_PINS declares no pins" };
  if (pins.length > 32) return { error: "LOCKSTEP_PINS supports at most 32 pins" };
  return { pins };
}

export const MAX_EDGE_EVENTS_PER_QUANTUM = 256;

/**
 * Generate the glue C (appended to the user's source in the same compile).
 * @param {Array<{name:string,dir:"in"|"out"}>} pins
 * @param {{cyclesPerUs?: number}} opts
 */
export function generateLockstepGlue(pins, opts = {}) {
  const cyclesPerUs = opts.cyclesPerUs ?? 24; // mainline stm32vldiscovery HCLK model
  const outs = pins.filter((p) => p.dir === "out");
  const ins = pins.filter((p) => p.dir === "in");
  const names = (list) => list.map((p) => `"${p.name}"`).join(", ") || '""';

  return `
/* ---- fulgurlab lockstep glue (auto-generated; bridge-protocol v1) ---- */
#include "trace.h"

#define __FL_NOUT ${outs.length}
#define __FL_NIN  ${ins.length}
#define __FL_MAX_EV ${MAX_EDGE_EVENTS_PER_QUANTUM}
#define __FL_CYC_PER_US ${cyclesPerUs}u

static const char *__fl_out_names[] = { ${names(outs)} };
static const char *__fl_in_names[]  = { ${names(ins)} };
static volatile unsigned __fl_out_shadow = 0;
static volatile unsigned __fl_in_shadow = 0;
static volatile unsigned __fl_ticks = 0;
static volatile unsigned __fl_quantum_ns = 0;
static volatile unsigned __fl_ev = 0;

/* SYS_READC (0x07): read one byte from the semihosting console, blocking. */
static inline int __fl_readc(void) { return sh_call(0x07, (void *)0); }

static void __fl_emit_u64(unsigned long long v, char *buf, int *p) {
  char tmp[21]; int i = 0;
  do { tmp[i++] = (char)('0' + (unsigned)(v % 10ull)); v /= 10ull; } while (v);
  while (i) buf[(*p)++] = tmp[--i];
}

static void __fl_emit_hex(unsigned v, char *buf, int *p) {
  char tmp[9]; int i = 0;
  do { tmp[i++] = "0123456789abcdef"[v & 0xfu]; v >>= 4; } while (v);
  while (i) buf[(*p)++] = tmp[--i];
}

static unsigned long long __fl_now_ns(void) {
  return (unsigned long long)__fl_ticks * (unsigned long long)__fl_quantum_ns;
}

static void __fl_emit_line(char tag) {
  char line[48]; int p = 0;
  line[p++] = tag; line[p++] = ' ';
  __fl_emit_u64(__fl_now_ns(), line, &p);
  line[p++] = ' ';
  __fl_emit_hex(__fl_out_shadow, line, &p);
  line[p++] = '\\n'; line[p] = '\\0';
  sh_write0(line);
}

/* Blocking read of one "T <quantum_ns> <in_hex>" line. Returns 0 on EOF/garbage. */
static int __fl_read_T(unsigned *quantum, unsigned *inv) {
  int c;
  do { c = __fl_readc(); if (c < 0) return 0; } while (c == '\\n' || c == '\\r' || c == ' ');
  if (c != 'T') return 0;
  c = __fl_readc();                                   /* the space */
  unsigned q = 0;
  for (c = __fl_readc(); c >= '0' && c <= '9'; c = __fl_readc())
    q = q * 10u + (unsigned)(c - '0');
  unsigned v = 0;
  for (c = (c == ' ') ? __fl_readc() : c; ; c = __fl_readc()) {
    if (c >= '0' && c <= '9') v = (v << 4) | (unsigned)(c - '0');
    else if (c >= 'a' && c <= 'f') v = (v << 4) | (unsigned)(c - 'a' + 10);
    else if (c >= 'A' && c <= 'F') v = (v << 4) | (unsigned)(c - 'A' + 10);
    else break;
  }
  if (q == 0) return 0;
  *quantum = q; *inv = v;
  return 1;
}

static int __fl_name_index(const char **list, int n, const char *name) {
  for (int i = 0; i < n; ++i) if (streq_(list[i], name)) return i;
  return -1;
}

/* STRONG hook overrides (weak in trace.h). */
void __trace_pin_hook(const char *name, unsigned value) {
  int i = __fl_name_index(__fl_out_names, __FL_NOUT, name);
  if (i < 0) return;
  unsigned bit = 1u << i;
  unsigned next = value ? (__fl_out_shadow | bit) : (__fl_out_shadow & ~bit);
  if (next == __fl_out_shadow) return;
  __fl_out_shadow = next;
  if (__fl_ev < __FL_MAX_EV) { __fl_emit_line('E'); }
  __fl_ev++;
}

int __trace_read_hook(const char *name) {
  int i = __fl_name_index(__fl_in_names, __FL_NIN, name);
  if (i < 0) return 0;
  return (int)((__fl_in_shadow >> i) & 1u);
}

/* SysTick registers (armv7-m). */
#define __FL_SYST_CSR (*(volatile unsigned *)0xE000E010u)
#define __FL_SYST_RVR (*(volatile unsigned *)0xE000E014u)
#define __FL_SYST_CVR (*(volatile unsigned *)0xE000E018u)

static void __fl_arm_systick(unsigned quantum_ns) {
  unsigned long long cycles =
      (unsigned long long)(quantum_ns / 1000u) * __FL_CYC_PER_US;
  if (cycles < 100ull) cycles = 100ull;               /* keep the exchange schedulable */
  if (cycles > 0xFFFFFFull) cycles = 0xFFFFFFull;     /* 24-bit reload ceiling */
  __FL_SYST_RVR = (unsigned)cycles - 1u;
  __FL_SYST_CVR = 0u;
  __FL_SYST_CSR = 7u;                                 /* ENABLE | TICKINT | CLKSOURCE */
}

static void __fl_exchange(void) {
  unsigned q, inv;
  if (!__fl_read_T(&q, &inv)) {
    sh_write0("X host-eof\\n");
    trace_exit();
  }
  if (__fl_quantum_ns == 0u) __fl_quantum_ns = q;     /* first T fixes the quantum */
  __fl_in_shadow = inv;
  __fl_ev = 0u;
}

/* CRITICAL: SysTick must be DISARMED while the exchange blocks in SYS_READC.
 * Under -icount, QEMU warps virtual time to the next timer deadline while the vCPU
 * is blocked in the semihosting call; with the timer left armed, the next tick is
 * already pending when the handler returns — it tail-chains forever and main() never
 * runs again (observed on QEMU 6.2, stm32vldiscovery). Disarm → exchange → re-arm
 * gives main() the full quantum of instruction budget between ticks. */
void SysTick_Handler(void) {
  __FL_SYST_CSR = 0u;                                 /* disarm during the exchange */
  __fl_ticks++;
  __fl_emit_line('O');
  __fl_exchange();
  __fl_arm_systick(__fl_quantum_ns);                  /* fresh full quantum for main */
}

void __lockstep_boot(void) {
  __fl_exchange();                                    /* blocks until the first step */
  __fl_arm_systick(__fl_quantum_ns);
}
/* ---- end fulgurlab lockstep glue ---- */
`;
}
