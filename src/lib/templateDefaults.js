// Built-in starter firmware for the editor. Pure string (no Node APIs) so it's safe to
// import from client components. The startup/vector table, linker script and trace.h are
// provided by the sandbox image — user code only writes main() + the firmware logic.

export const DEFAULT_FIRMWARE = `#include "trace.h"

/* STM32F103 "Blue Pill" — bare-metal register access (no HAL).
 * Toggle the on-board LED on PC13 and trace every level change. */

#define RCC_APB2ENR  (*(volatile unsigned int *)0x40021018u)
#define GPIOC_CRH    (*(volatile unsigned int *)0x40011004u)
#define GPIOC_ODR    (*(volatile unsigned int *)0x4001100Cu)

#define IOPCEN  (1u << 4)
#define PC13    13u
#define BLINKS  8u

static void delay(volatile unsigned int n) { while (n--) asm volatile("nop"); }

int main(void) {
  RCC_APB2ENR |= IOPCEN;            /* clock GPIOC */
  GPIOC_CRH &= ~(0xFu << 20);       /* PC13: output 2 MHz, push-pull */
  GPIOC_CRH |=  (0x2u << 20);

  for (unsigned i = 0; i < BLINKS; ++i) {
    GPIOC_ODR |=  (1u << PC13);      /* LED off (active low) */
    trace_pin("PC13", 1);
    delay(100000);

    GPIOC_ODR &= ~(1u << PC13);      /* LED on */
    trace_pin("PC13", 0);
    delay(100000);
  }

  trace_end();
  trace_exit();
  return 0;
}
`;
