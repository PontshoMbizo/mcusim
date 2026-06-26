#!/bin/sh
# Sandbox contract (mirrors nikaVSimulator): read the user's bare-metal C on stdin,
# emit the pin/peripheral TRACE on stdout, put all compile/runtime logs on stderr.
# Exit codes name the failing stage so the launcher can label errors:
#   2 = compile (arm-none-eabi-gcc) failure
#   3 = runtime (qemu) failure
#   4 = no trace produced (firmware never emitted ##END)
#
# The startup, linker script and trace.h are baked into the image at /opt/fw.
# SIM_ENGINE selects the emulator: "mainline" (qemu-system-arm, stm32vldiscovery) or
# "xpack" (qemu-system-gnuarmeclipse, native STM32F103).
set -eu

ENGINE="${SIM_ENGINE:-mainline}"
WORK=/work
USER_C="$WORK/user.c"
ELF="$WORK/firmware.elf"
TRACE="$WORK/trace.txt"

# 1. Read user firmware from stdin.
cat > "$USER_C"

# 2. Cross-compile: startup + user code, linked for the F103. Logs -> stderr.
if ! arm-none-eabi-gcc \
      -mcpu=cortex-m3 -mthumb -ffreestanding -nostdlib -Os \
      -ffunction-sections -fdata-sections -I/opt/fw \
      /opt/fw/startup.c "$USER_C" \
      -T /opt/fw/stm32f103.ld -Wl,--gc-sections -nostdlib -lgcc \
      -o "$ELF" 1>&2; then
  exit 2
fi

# 3. Run under the selected engine. The firmware ends with SYS_EXIT, so QEMU stops on
#    its own; sandbox.js still enforces a host-side hard timeout as the primary stop.
#    Trace (semihosting stdout) is captured to a file; QEMU's own logs go to stderr.
case "$ENGINE" in
  xpack)
    if ! qemu-system-gnuarmeclipse \
          --board STM32-H103 --mcu STM32F103RB -nographic \
          --semihosting-config enable=on,target=native \
          -kernel "$ELF" >"$TRACE" 2>>/dev/stderr; then
      exit 3
    fi
    ;;
  *)
    if ! qemu-system-arm -M stm32vldiscovery -nographic \
          -semihosting-config enable=on,target=native \
          -kernel "$ELF" >"$TRACE" 2>>/dev/stderr; then
      exit 3
    fi
    ;;
esac

# 4. A well-formed run ends with the ##END marker. Absence => firmware never traced.
if ! grep -q '##END' "$TRACE"; then
  echo "error: no trace produced (did the firmware call trace_end()/trace_exit()?)" 1>&2
  exit 4
fi

cat "$TRACE"
