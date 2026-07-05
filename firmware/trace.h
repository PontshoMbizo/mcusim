/*
 * trace.h — tiny ARM semihosting trace shim for stmVSimulator (STM32F103, Cortex-M3).
 *
 * The simulator observes pin/peripheral state by having firmware emit a textual event
 * trace over ARM semihosting (SYS_WRITE0). QEMU prints it to stdout; the Node parser
 * (src/lib/trace.js) turns it into the board-state model.
 *
 * Trace line format (one event per line):
 *     #<seq> <signal> <value>\n
 *   e.g.  #0 PC13 0
 *         #1 PC13 1
 *   end with: ##END\n  then call trace_exit().
 *
 * Semihosting works on BOTH engines we spike: mainline qemu-system-arm
 * (-semihosting-config enable=on) and the xPack qemu-system-gnuarmeclipse fork.
 * No libc / no stdio is used — this is freestanding.
 *
 * External chips (co-simulated, compiled into this same firmware image — see
 * src/lib/chipCodegen.js) hook in here via two WEAK symbols. With no chips/wires in a
 * run neither symbol resolves, both calls below are no-ops, and trace_pin()/trace_read()
 * behave exactly as before — this file is unchanged for every existing firmware.
 * When chips ARE present, codegen emits a STRONG definition of each hook that dispatches
 * by name to the wired net(s) and steps any chip whose input is on that net.
 */
#ifndef TRACE_H
#define TRACE_H

/* Wiring hooks — weak so they're no-ops unless a run's generated glue overrides them. */
extern void __trace_pin_hook(const char *name, unsigned value) __attribute__((weak));
extern int __trace_read_hook(const char *name) __attribute__((weak));

/* Tiny freestanding string-equality check — no libc under -nostdlib. */
static inline int streq_(const char *a, const char *b) {
  while (*a && *a == *b) { ++a; ++b; }
  return *a == *b;
}

/* --- raw semihosting call: r0 = op, r1 = arg block, returns r0 --- */
static inline int sh_call(int op, void *arg) {
  register int r0 asm("r0") = op;
  register void *r1 asm("r1") = arg;
  asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
  return r0;
}

/* SYS_WRITE0 (0x04): write a NUL-terminated string to the host console (stdout). */
static inline void sh_write0(const char *s) {
  sh_call(0x04, (void *)s);
}

/* SYS_EXIT (0x18): cleanly stop QEMU. ADP_Stopped_ApplicationExit = 0x20026. */
static inline void trace_exit(void) {
  unsigned int block[2] = {0x20026u, 0u};
  sh_call(0x18, block);
  for (;;) { /* never reached */ }
}

/* minimal unsigned -> decimal, writes into buf (caller supplies >= 11 bytes) */
static inline char *utoa_(unsigned v, char *buf) {
  char tmp[11];
  int i = 0;
  do { tmp[i++] = (char)('0' + (v % 10u)); v /= 10u; } while (v);
  int j = 0;
  while (i) buf[j++] = tmp[--i];
  buf[j] = '\0';
  return buf;
}

static unsigned trace_seq_ = 0;

/* Emit one pin event:  #<seq> <name> <value> */
static inline void trace_pin(const char *name, unsigned value) {
  char line[64];
  char num[11];
  int p = 0;
  line[p++] = '#';
  utoa_(trace_seq_++, num);
  for (const char *c = num; *c; ++c) line[p++] = *c;
  line[p++] = ' ';
  for (const char *c = name; *c; ++c) line[p++] = *c;
  line[p++] = ' ';
  line[p++] = (char)('0' + (value ? 1u : 0u));
  line[p++] = '\n';
  line[p] = '\0';
  sh_write0(line);
  if (__trace_pin_hook) __trace_pin_hook(name, value);
}

/* Read the current value of a named net driven by a wired external chip (e.g. a virtual
 * button/sensor). Returns 0 if the name isn't wired to anything — a safe "not present"
 * default, since there's no chip to have driven a real value. */
static inline int trace_read(const char *name) {
  return __trace_read_hook ? __trace_read_hook(name) : 0;
}

/* Free-form debug line. The host parser ignores any line that isn't "#n NAME 0|1",
 * so these are safe to sprinkle in for diagnostics. */
static inline void trace_msg(const char *s) {
  sh_write0(s);
  sh_write0("\n");
}

/* Mark end of trace. */
static inline void trace_end(void) {
  sh_write0("##END\n");
}

#endif /* TRACE_H */
