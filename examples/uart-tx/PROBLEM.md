# MCU Problem — Bit-Banged UART Transmitter on PC13

**Simulator:** `/tools/mcu` (stmVSimulator · STM32F103 "Blue Pill")
**Difficulty:** Easy–Medium · **Topics:** GPIO, bare-metal register access, serial framing
**Source theme:** UART TX framing without a hardware UART (embedded interview classic)

## Problem

Many sensors and debug links speak UART, but sometimes you must "bit-bang" the protocol
on a plain GPIO because the hardware UART is busy or absent. Implement a software UART
**transmitter** on `PC13` of the Blue Pill, in bare-metal C (no HAL, direct register
access).

Send the byte `TX_BYTE` (default `0x4B` = `'K'`) as a standard **8N1** frame:

```
line:   idle   start   d0 d1 d2 d3 d4 d5 d6 d7   stop
level:    1       0     <-- 8 data bits, LSB first -->  1
```

Drive `PC13` to each level in turn and call `trace_pin("PC13", level)` for every bit so
the simulator's waveform shows the frame. Finish with `trace_end()` then `trace_exit()`.

## Requirements

1. Enable the GPIOC clock and configure `PC13` as a push-pull output (registers, no HAL).
2. Emit the frame in order: idle `1`, start `0`, 8 data bits **LSB-first**, stop `1`.
3. Trace **every** bit level via `trace_pin("PC13", level)` (one event per bit).
4. End the trace with `trace_end()` and stop cleanly with `trace_exit()`.

## Expected trace

For `TX_BYTE = 0x4B` (`0b0100_1011`), LSB-first the data bits are `1 1 0 1 0 0 1 0`, so
the full event sequence (x-axis = event number) is:

```
#0 PC13 1   (idle)
#1 PC13 0   (start)
#2 PC13 1   #3 PC13 1   #4 PC13 0   #5 PC13 1   (d0..d3)
#6 PC13 0   #7 PC13 0   #8 PC13 1   #9 PC13 0   (d4..d7)
#10 PC13 1  (stop)
##END
```

> Note: the trace x-axis is the **event sequence number**, not real time — so this
> problem is graded by the *sequence of levels*, not pulse widths.

## Files

| File | Role |
|---|---|
| `starter.c` | Skeleton with the registers + TODOs — paste into the editor and implement. |
| `solution.c` | Reference solution. |

## How to run it in the simulator

1. Open **`/tools/mcu`**.
2. Paste `solution.c` (or your attempt from `starter.c`) into the **Firmware** editor.
3. Click **Run** (engine: `mainline`).
4. Open the **Waveforms** tab — `PC13` shows the 11-event UART frame above.

## Verify locally (same sandbox image CI builds)

```bash
# from the stmVSimulator repo root, with podman installed:
podman build -t stm-sim-mainline -f sim/Dockerfile.mainline .
podman run --rm -i stm-sim-mainline < examples/uart-tx/solution.c
# expect 11 "#n PC13 v" lines matching the sequence above, then ##END
```

## Acceptance

The emitted `#n PC13 v` sequence must equal `1 0 1 1 0 1 0 0 1 0 1` for `TX_BYTE = 0x4B`.
