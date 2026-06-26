# Makefile — build the Phase 0 spike firmware locally (outside the sandbox container).
# Requires arm-none-eabi-gcc. Produces firmware.elf, which QEMU runs via -kernel.
#
#   make            # build firmware.elf
#   make run-main   # run under mainline qemu-system-arm (stm32vldiscovery)
#   make run-xpack  # run under xPack qemu-system-gnuarmeclipse (STM32F103)
#   make clean

CC      := arm-none-eabi-gcc
OBJCOPY := arm-none-eabi-objcopy

CFLAGS  := -mcpu=cortex-m3 -mthumb -ffreestanding -nostdlib -Os -Wall -Wextra \
           -ffunction-sections -fdata-sections -I.
LDFLAGS := -T stm32f103.ld -Wl,--gc-sections -nostdlib -lgcc

# user.c is the firmware-under-test; defaults to the bundled blink spike.
USER ?= blink.c

ELF := firmware.elf

$(ELF): startup.c $(USER) stm32f103.ld trace.h
	$(CC) $(CFLAGS) startup.c $(USER) $(LDFLAGS) -o $(ELF)

bin: $(ELF)
	$(OBJCOPY) -O binary $(ELF) firmware.bin

# Mainline QEMU: Cortex-M3 via the STM32F100 value-line board (closest in-tree machine).
# Pin trace arrives on stdout via semihosting.
run-main: $(ELF)
	qemu-system-arm -M stm32vldiscovery -nographic \
	  -semihosting-config enable=on,target=native \
	  -kernel $(ELF)

# xPack fork: native STM32F103 board model (GPIO/LED). Semihosting trace also works;
# the fork additionally renders the LED, which we compare against during the spike.
run-xpack: $(ELF)
	qemu-system-gnuarmeclipse --board STM32-H103 --mcu STM32F103RB -nographic \
	  --semihosting-config enable=on,target=native \
	  -kernel $(ELF)

clean:
	rm -f $(ELF) firmware.bin

.PHONY: bin run-main run-xpack clean
