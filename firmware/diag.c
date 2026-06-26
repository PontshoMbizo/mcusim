/*
 * diag.c — step-by-step diagnostic firmware. Emits a "dbg:" marker after each operation
 * so we can see exactly where execution stops. Tiny delay (no big loop). Run with:
 *     cd firmware && make run-main USER=diag.c
 * The host parser ignores the dbg lines; only #n PC13 v / ##END are real trace events.
 */
#include "trace.h"

#define RCC_APB2ENR  (*(volatile unsigned int *)0x40021018u)
#define GPIOC_CRH    (*(volatile unsigned int *)0x40011004u)
#define GPIOC_ODR    (*(volatile unsigned int *)0x4001100Cu)
#define PC13 13u

int main(void) {
  trace_msg("dbg: start");

  RCC_APB2ENR |= (1u << 4);
  trace_msg("dbg: rcc enabled");

  GPIOC_CRH &= ~(0xFu << 20);
  GPIOC_CRH |=  (0x2u << 20);
  trace_msg("dbg: crh configured");

  for (unsigned i = 0; i < 3; ++i) {
    GPIOC_ODR |= (1u << PC13);
    trace_pin("PC13", 1);
    trace_msg("dbg: led off written");

    for (volatile int d = 0; d < 50; ++d) { asm volatile("nop"); }
    trace_msg("dbg: post-delay");

    GPIOC_ODR &= ~(1u << PC13);
    trace_pin("PC13", 0);
    trace_msg("dbg: led on written");
  }

  trace_msg("dbg: loop done");
  trace_end();
  trace_exit();
  return 0;
}
