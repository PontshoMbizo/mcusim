#include "trace.h"

/* Reference solution — Bit-banged UART transmitter on PC13 (STM32F103 "Blue Pill").
 *
 * Sends one byte as a standard 8N1 UART frame, MSB of the wire being the order in
 * which bits go out: idle(1) -> start(0) -> 8 data bits LSB-first -> stop(1).
 * Each line level is emitted to the trace, so the waveform reads as the UART frame.
 * (PC13 also drives the on-board LED; here we use it purely as the TX line.) */

#define RCC_APB2ENR  (*(volatile unsigned int *)0x40021018u)
#define GPIOC_CRH    (*(volatile unsigned int *)0x40011004u)
#define GPIOC_ODR    (*(volatile unsigned int *)0x4001100Cu)

#define IOPCEN     (1u << 4)
#define PC13       13u
#define TX_BYTE    0x4Bu      /* 'K' = 0b0100_1011, sent LSB-first */
#define BIT_DELAY  20000u

static void delay(volatile unsigned int n) { while (n--) asm volatile("nop"); }

/* Drive the line to `level`, record it, and hold for one bit period. */
static void tx_bit(unsigned level) {
  if (level) GPIOC_ODR |=  (1u << PC13);
  else       GPIOC_ODR &= ~(1u << PC13);
  trace_pin("PC13", level);
  delay(BIT_DELAY);
}

int main(void) {
  RCC_APB2ENR |= IOPCEN;            /* clock GPIOC */
  GPIOC_CRH &= ~(0xFu << 20);       /* PC13: output 2 MHz, push-pull */
  GPIOC_CRH |=  (0x2u << 20);

  tx_bit(1);                        /* idle / mark */
  tx_bit(0);                        /* start bit */
  for (unsigned i = 0; i < 8; ++i)
    tx_bit((TX_BYTE >> i) & 1u);    /* 8 data bits, LSB first */
  tx_bit(1);                        /* stop bit */

  trace_end();
  trace_exit();
  return 0;
}
