/*
 * blink.c — Phase 0 spike firmware for stmVSimulator.
 *
 * Bare-metal STM32F103C8 ("Blue Pill"): toggle PC13 (on-board LED, active low) a fixed
 * number of times, emitting a semihosting trace of every level change, then exit so QEMU
 * terminates. This is the known-good design that proves the
 *     C  ->  arm-none-eabi-gcc  ->  qemu  ->  pin trace
 * pipeline end to end. No HAL, no libc — direct register access only.
 *
 * Registers (STM32F103, reference manual RM0008):
 *   RCC->APB2ENR  @ 0x40021018, bit 4 (IOPCEN) enables GPIOC clock
 *   GPIOC->CRH    @ 0x40011004, pin 13 config (MODE13/CNF13) at bit 20
 *   GPIOC->ODR    @ 0x4001100C, output data register
 */
#include "trace.h"

#define RCC_APB2ENR  (*(volatile unsigned int *)0x40021018u)
#define GPIOC_CRH    (*(volatile unsigned int *)0x40011004u)
#define GPIOC_ODR    (*(volatile unsigned int *)0x4001100Cu)

#define IOPCEN       (1u << 4)         /* GPIOC clock enable */
#define PC13         13u
#define BLINKS       8u

static void gpioc_pc13_init(void) {
  RCC_APB2ENR |= IOPCEN;               /* clock the port */
  /* PC13: MODE = 0b10 (output, 2 MHz), CNF = 0b00 (push-pull) -> 0x2 at bit 20 */
  GPIOC_CRH &= ~(0xFu << 20);
  GPIOC_CRH |=  (0x2u << 20);
}

static void delay(volatile unsigned int n) {
  while (n--) { asm volatile("nop"); }
}

int main(void) {
  gpioc_pc13_init();

  for (unsigned i = 0; i < BLINKS; ++i) {
    GPIOC_ODR |=  (1u << PC13);         /* LED off (active low) */
    trace_pin("PC13", 1);
    delay(100000);

    GPIOC_ODR &= ~(1u << PC13);         /* LED on */
    trace_pin("PC13", 0);
    delay(100000);
  }

  trace_end();
  trace_exit();                          /* SYS_EXIT -> QEMU stops */
  return 0;
}
