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
# -pipe keeps intermediate files off /tmp (the container FS is read-only except /work).
if ! TMPDIR=/work arm-none-eabi-gcc -pipe \
      -mcpu=cortex-m3 -mthumb -ffreestanding -nostdlib -Os \
      -ffunction-sections -fdata-sections -I/opt/fw \
      /opt/fw/startup.c "$USER_C" \
      -T /opt/fw/stm32f103.ld -Wl,--gc-sections -nostdlib -lgcc \
      -o "$ELF" 1>&2; then
  exit 2
fi

# 3. Run under the selected engine. The firmware ends with SYS_EXIT, so QEMU stops on
#    its own; `timeout` is a backstop if it doesn't, and sandbox.js adds a host SIGKILL.
#    IMPORTANT: QEMU's semihosting console defaults to *stderr* under -nographic (not
#    stdout), and SYS_EXIT can make QEMU return non-zero, so we must NOT judge success by
#    exit code or by stdout alone. Capture both streams and pick whichever carries ##END.
RUN_LOG="$WORK/qemu.log"

run_engine() {
  case "$ENGINE" in
    xpack)
      timeout 15 qemu-system-gnuarmeclipse \
        --board STM32-H103 --mcu STM32F103RB -nographic \
        --semihosting-config enable=on,target=native \
        -kernel "$ELF"
      ;;
    *)
      timeout 15 qemu-system-arm -M stm32vldiscovery -nographic \
        -semihosting-config enable=on,target=native \
        -kernel "$ELF"
      ;;
  esac
}

run_engine >"$TRACE" 2>"$RUN_LOG" || true

# Semihosting may have written the trace to stderr instead of stdout — fall back to it.
if ! grep -q '##END' "$TRACE" && grep -q '##END' "$RUN_LOG"; then
  cp "$RUN_LOG" "$TRACE"
fi

# 4. A well-formed run ends with the ##END marker. Absence => firmware never traced.
if ! grep -q '##END' "$TRACE"; then
  echo "error: no trace produced (no ##END on stdout or stderr)." 1>&2
  sed -n '1,40p' "$RUN_LOG" 1>&2
  exit 4
fi

cat "$TRACE"
