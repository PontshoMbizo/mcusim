/*
 * diag.c — SELF-CONTAINED step-by-step diagnostic firmware (no trace.h dependency, so it
 * compiles against any baked image). Emits a "dbg:" marker after each operation; wherever
 * output stops is where execution stopped. Run via the container command in the chat.
 */

/* semihosting: SYS_WRITE0 (0x04) writes a NUL-terminated string to the host console */
static inline void shw(const char *s) {
  register int r0 asm("r0") = 0x04;
  register const char *r1 asm("r1") = s;
  asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
}
/* SYS_EXIT (0x18) — cleanly stop QEMU */
static inline void shexit(void) {
  unsigned b[2] = {0x20026u, 0u};
  register int r0 asm("r0") = 0x18;
  register void *r1 asm("r1") = b;
  asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
  for (;;) { }
}

#define RCC_APB2ENR (*(volatile unsigned int *)0x40021018u)
#define GPIOC_CRH   (*(volatile unsigned int *)0x40011004u)
#define GPIOC_ODR   (*(volatile unsigned int *)0x4001100Cu)

int main(void) {
  shw("dbg: start\n");

  RCC_APB2ENR |= (1u << 4);
  shw("dbg: rcc enabled\n");

  GPIOC_CRH &= ~(0xFu << 20);
  GPIOC_CRH |=  (0x2u << 20);
  shw("dbg: crh configured\n");

  for (unsigned i = 0; i < 3; ++i) {
    GPIOC_ODR |= (1u << 13);
    shw("#A PC13 1\n");
    shw("dbg: odr-set done\n");

    for (volatile int d = 0; d < 50; ++d) { asm volatile("nop"); }
    shw("dbg: post-delay\n");

    GPIOC_ODR &= ~(1u << 13);
    shw("#B PC13 0\n");
    shw("dbg: odr-clr done\n");
  }

  shw("dbg: loop done\n");
  shw("##END\n");
  shexit();
  return 0;
}
