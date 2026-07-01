#include "trace.h"

/* Starter — Bit-banged UART transmitter on PC13 (STM32F103 "Blue Pill").
 *
 * Goal: send TX_BYTE as an 8N1 UART frame on PC13 and trace every line level so the
 * waveform shows: idle(1) -> start(0) -> 8 data bits LSB-first -> stop(1).
 *
 * Fill in tx_bit() and the frame sequence in main(). Keep trace_pin("PC13", level)
 * for each bit, and finish with trace_end() + trace_exit().
 */

#define RCC_APB2ENR  (*(volatile unsigned int *)0x40021018u)
#define GPIOC_CRH    (*(volatile unsigned int *)0x40011004u)
#define GPIOC_ODR    (*(volatile unsigned int *)0x4001100Cu)

#define IOPCEN     (1u << 4)
#define PC13       13u
#define TX_BYTE    0x4Bu
#define BIT_DELAY  20000u

static void delay(volatile unsigned int n) { while (n--) asm volatile("nop"); }

static void tx_bit(unsigned level) {
  /* TODO: drive PC13 to `level`, trace_pin("PC13", level), then delay one bit period. */
  (void)level;
}

int main(void) {
  RCC_APB2ENR |= IOPCEN;
  GPIOC_CRH &= ~(0xFu << 20);
  GPIOC_CRH |=  (0x2u << 20);

  /* TODO: emit idle(1), start(0), 8 data bits LSB-first, stop(1) using tx_bit(). */

  trace_end();
  trace_exit();
  return 0;
}
