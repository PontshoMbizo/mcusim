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

void Reset_Handler(void);
void Default_Handler(void);

/* Weak aliases so user code could override later; all trap by default. */
void NMI_Handler(void)        __attribute__((weak, alias("Default_Handler")));
void HardFault_Handler(void)  __attribute__((weak, alias("Default_Handler")));
void SysTick_Handler(void)    __attribute__((weak, alias("Default_Handler")));

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

  main();
  for (;;) { /* main returned: trap */ }
}

void Default_Handler(void) {
  for (;;) { /* unexpected exception: trap */ }
}
