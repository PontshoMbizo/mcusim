/*
 * startup.c — minimal Cortex-M3 startup + vector table for STM32F103C8.
 *
 * Provides the reset sequence the silicon expects: the vector table's first word is the
 * initial stack pointer, the second is the reset handler. Reset_Handler copies .data from
 * flash to SRAM, zeroes .bss, then calls main(). All other exceptions trap in a spin loop.
 *
 * Symbols (_sidata, _sdata, _edata, _sbss, _ebss, _estack) come from stm32f103.ld.
 */
#include <stdint.h>

extern uint32_t _sidata, _sdata, _edata, _sbss, _ebss, _estack;
extern int main(void);

/* Lockstep-bridge boot hook (fulgurlab co-simulation). Weak no-op normally; the
 * bridge's generated glue provides a strong version that reads the first quantum
 * command and arms SysTick BEFORE main() runs. Batch runs are unaffected. */
void __lockstep_boot(void) __attribute__((weak));
void __lockstep_boot(void) {}

void Reset_Handler(void);
void Default_Handler(void);
void NMI_Handler(void);
void HardFault_Handler(void);
void SysTick_Handler(void) __attribute__((weak, alias("Default_Handler")));

/* Minimal semihosting so a fault is *visible* (a ##FAULT marker on stdout) instead of a
 * silent lockup. Kept self-contained here so startup has no dependency on trace.h. */
static inline void sh_write0_(const char *s) {
  register int r0 asm("r0") = 0x04;          /* SYS_WRITE0 */
  register const char *r1 asm("r1") = s;
  asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
}
static inline void sh_exit_(void) {
  unsigned b[2] = {0x20026u, 0u};            /* SYS_EXIT: ApplicationExit */
  register int r0 asm("r0") = 0x18;
  register void *r1 asm("r1") = b;
  asm volatile("bkpt 0xAB" : "+r"(r0) : "r"(r1) : "memory");
  for (;;) { }
}

/* Vector table: only the core entries the spike needs. Extend for NVIC IRQs later. */
__attribute__((section(".isr_vector"), used))
void (* const g_vectors[])(void) = {
  (void (*)(void))(&_estack),  /* 0x00 initial SP   */
  Reset_Handler,               /* 0x04 reset        */
  NMI_Handler,                 /* 0x08 NMI          */
  HardFault_Handler,           /* 0x0C HardFault    */
  0, 0, 0, 0, 0, 0, 0,         /* reserved          */
  0,                           /* SVC (unused)      */
  0, 0,                        /* reserved          */
  0,                           /* PendSV (unused)   */
  SysTick_Handler,             /* 0x3C SysTick      */
};

void Reset_Handler(void) {
  /* copy initialised data from flash (_sidata) to SRAM (_sdata.._edata) */
  uint32_t *src = &_sidata, *dst = &_sdata;
  while (dst < &_edata) *dst++ = *src++;

  /* zero the .bss section */
  for (uint32_t *b = &_sbss; b < &_ebss; ++b) *b = 0;

  __lockstep_boot();
  main();
  /* main returned (e.g. SYS_EXIT no-op): surface it rather than hang. */
  sh_write0_("##END main-returned\n");
  sh_exit_();
}

/* Fault handlers emit a marker then stop QEMU, so failures are diagnosable. */
void HardFault_Handler(void) { sh_write0_("##FAULT HardFault\n"); sh_exit_(); }
void NMI_Handler(void)       { sh_write0_("##FAULT NMI\n");       sh_exit_(); }

void Default_Handler(void) { sh_write0_("##FAULT unexpected exception\n"); sh_exit_(); }
