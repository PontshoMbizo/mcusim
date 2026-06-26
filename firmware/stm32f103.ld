/*
 * stm32f103.ld — linker script for STM32F103C8, sized to also run on QEMU's
 * `stm32vldiscovery` machine (STM32F100RB) used by the mainline engine.
 * Cortex-M3. Places the vector table at the start of flash (0x08000000), code/rodata in
 * flash, and .data/.bss in SRAM with the load image (_sidata) kept in flash for startup.
 *
 * RAM is capped at 8 KB: that's the SRAM the stm32vldiscovery QEMU model provides, so the
 * initial stack pointer (_estack = end of RAM) stays inside emulated memory. A real
 * STM32F103C8 has 20 KB and the F1 peripheral map is identical, so this is safe on
 * hardware too — bump LENGTH to 20K when targeting the xPack F103 model or real silicon.
 */
ENTRY(Reset_Handler)

MEMORY
{
  FLASH (rx)  : ORIGIN = 0x08000000, LENGTH = 64K
  RAM   (rwx) : ORIGIN = 0x20000000, LENGTH = 8K
}

/* Top of stack = end of RAM (full-descending stack). */
_estack = ORIGIN(RAM) + LENGTH(RAM);

SECTIONS
{
  .isr_vector :
  {
    . = ALIGN(4);
    KEEP(*(.isr_vector))
    . = ALIGN(4);
  } > FLASH

  .text :
  {
    . = ALIGN(4);
    *(.text)
    *(.text*)
    *(.rodata)
    *(.rodata*)
    . = ALIGN(4);
    _etext = .;
  } > FLASH

  /* load address of .data in flash */
  _sidata = LOADADDR(.data);

  .data :
  {
    . = ALIGN(4);
    _sdata = .;
    *(.data)
    *(.data*)
    . = ALIGN(4);
    _edata = .;
  } > RAM AT > FLASH

  .bss :
  {
    . = ALIGN(4);
    _sbss = .;
    *(.bss)
    *(.bss*)
    *(COMMON)
    . = ALIGN(4);
    _ebss = .;
  } > RAM

  /DISCARD/ : { *(.ARM.exidx*) *(.ARM.extab*) }
}
