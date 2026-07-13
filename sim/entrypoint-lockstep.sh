#!/bin/sh
# Lockstep session entrypoint (fulgurlab bridge), mainline-QEMU engine. Contract per
# fulgurlab/docs/bridge-protocol.md "container line protocol":
#   stdin : `##SRC <bytes>` + exactly that many bytes of C (user firmware + generated
#           lockstep glue), then the quantum stream (`T <quantum_ns> <in_hex>` lines),
#           which the FIRMWARE reads via blocking semihosting console reads.
#   stdout: E/O/X lines (emitted by the glue via SYS_WRITE0). Logs -> stderr.
# Exit codes: 2 = compile failure, 5 = bad framing.
set -eu

USER_C=/work/user.c
ELF=/work/firmware.elf

# 1. Framing header. POSIX `read` consumes single bytes — cannot over-read.
read -r header || { echo "error: empty stdin (want ##SRC <bytes>)" 1>&2; exit 5; }
case "$header" in
  "##SRC "*) n=${header#\#\#SRC } ;;
  *) echo "error: bad framing header: $header" 1>&2; exit 5 ;;
esac
case "$n" in
  ''|*[!0-9]*) echo "error: bad byte count: $n" 1>&2; exit 5 ;;
esac

# 2. Copy exactly $n source bytes; bs=1 so none of the quantum stream is consumed.
dd bs=1 count="$n" of="$USER_C" 2>/dev/null

# 3. Cross-compile — identical flags to the batch entrypoint.
if ! TMPDIR=/work arm-none-eabi-gcc -pipe \
      -mcpu=cortex-m3 -mthumb -ffreestanding -nostdlib -Os \
      -ffunction-sections -fdata-sections -I/opt/fw \
      /opt/fw/startup.c "$USER_C" \
      -T /opt/fw/stm32f103.ld -Wl,--gc-sections -nostdlib -lgcc \
      -o "$ELF" 1>&2; then
  exit 2
fi

# 4. Run under QEMU with stdin left to the SEMIHOSTING console (the lockstep channel):
#    -monitor none -serial none keeps the monitor/serial mux off stdio so SYS_READC
#    reads our T lines and SYS_WRITE0 emits E/O/X on stdout.
#    -icount makes virtual time instruction-driven (deterministic quanta, no wall-clock
#    coupling); sleep=off runs the guest as fast as the host allows.
#    No `timeout` backstop here — the bridge server owns reply/idle/wall caps and kills
#    the container (same posture as batch, enforced one layer up).
ENGINE="${SIM_ENGINE:-mainline}"
case "$ENGINE" in
  xpack)
    exec qemu-system-gnuarmeclipse --board STM32-H103 --mcu STM32F103RB -nographic \
      --semihosting-config enable=on,target=native \
      -kernel "$ELF"
    ;;
  *)
    # The explicit stdio chardev is REQUIRED: with -monitor none -serial none the
    # semihosting console otherwise has no backing chardev — SYS_READC blocks forever
    # and SYS_WRITE0 goes nowhere (verified on QEMU 6.2). signal=off keeps ^C handling
    # away from the guest; the server kills the container instead.
    exec qemu-system-arm -M stm32vldiscovery -nographic \
      -monitor none -serial none \
      -chardev stdio,id=sh0,signal=off \
      -icount shift=6,sleep=off \
      -semihosting-config enable=on,target=native,chardev=sh0 \
      -kernel "$ELF"
    ;;
esac
