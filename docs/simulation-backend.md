# Simulation Backend

How stmVSimulator turns bare-metal C in the editor into a live pin trace, safely, with
untrusted code from anyone on the internet. The design mirrors nikaVSimulator (Verilog →
VCD); here it is C → firmware → QEMU → pin trace.

## Architecture

```
  EditorPane ("Run")                                         Browser
      │  POST /api/simulate { code, engine? }
      ▼
  src/app/api/simulate/route.js          ── rate limit + concurrency cap + size cap
      │
      ▼
  src/lib/sandbox.js  runSimulation(code, {engine})   ── Node server
      │  spawn podman run … (locked-down flags)
      ▼
  ┌─────────────────────────────────────────────────────────┐
  │ ephemeral container  (stm-sim-mainline | stm-sim-xpack)  │ one per run, no network,
  │   sim/entrypoint.sh:                                     │ read-only FS, non-root,
  │     stdin → arm-none-eabi-gcc → firmware.elf             │ resource-capped, auto-killed
  │            → qemu (semihosting) → trace.txt → stdout     │
  └─────────────────────────────────────────────────────────┘
      │  TRACE text (stdout)            logs (stderr)
      ▼
  parseTrace(trace) → model            ── src/lib/trace.js
      │
      ├─► SignalGeneratorPane  (waveforms)        [Phase 2]
      └─► BluePillViewer       (board pins)        [Phase 2]
```

## The observability question (why two engines)

Mainline QEMU has no STM32F103 machine; the closest in-tree board is `stm32vldiscovery`
(STM32F100RB, same Cortex-M3 core). More importantly, mainline QEMU does **not** reliably
model STM32 GPIO output, so we cannot just read the LED pin from the emulator. Two paths
are being spiked (decision deferred until measured):

- **mainline** — maintained `qemu-system-arm`. Firmware emits pin events over ARM
  **semihosting** (`firmware/trace.h`), QEMU prints them to stdout, `trace.js` parses
  them. Robust and engine-independent; we own the instrumentation layer.
- **xpack** — the xPack / GNU MCU Eclipse `qemu-system-gnuarmeclipse` fork, which models
  the STM32F103 GPIO + on-board LED natively (pins observable without instrumentation).
  Less maintained, pinned to an older QEMU. The same semihosting trace also works here,
  so one firmware runs on both; the spike compares native GPIO vs the trace shim.

`SIM_ENGINE` (env, or the request's `engine` field) selects the image.

## `/api/simulate` contract

`POST /api/simulate`

Request: `{ "code": "<bare-metal C>", "engine"?: "mainline" | "xpack" }`

`code` must define `main()`. The startup/vector table (`firmware/startup.c`), linker
script (`firmware/stm32f103.ld`) and trace shim (`firmware/trace.h`) are baked into the
image — user code only provides firmware logic.

Response (HTTP 200 on a completed run; 4xx for bad input / limits):

| field      | type    | meaning                                                       |
|------------|---------|---------------------------------------------------------------|
| `ok`       | boolean | whether a trace was produced                                 |
| `engine`   | string  | which engine ran (`mainline` \| `xpack`)                      |
| `trace`    | string  | raw trace text (when `ok`)                                   |
| `model`    | object  | parsed board model: `signals`, `events`, `last`, `complete` |
| `complete` | boolean | trace ended with `##END`                                     |
| `log`      | string  | compile/runtime output (errors, QEMU logs)                  |
| `stage`    | string  | on failure: `compile` \| `runtime` \| `timeout` \| `output` \| `busy` \| `rate` \| `input` |

## Sandbox contract

`sim/entrypoint.sh` — **stdin → trace on stdout, logs on stderr**:

1. `cat > /work/user.c` — read the user firmware.
2. `arm-none-eabi-gcc … /opt/fw/startup.c user.c -T /opt/fw/stm32f103.ld -o firmware.elf`
   — cross-compile; failure → exit **2**.
3. `qemu-system-arm -M stm32vldiscovery -semihosting-config enable=on -kernel firmware.elf`
   (or `qemu-system-gnuarmeclipse` for xpack) — run; failure → exit **3**. The firmware
   ends with semihosting `SYS_EXIT`, so QEMU stops on its own.
4. Require the `##END` marker; absent → exit **4** (firmware never traced).

## Trace format

```
#<seq> <signal> <value>      e.g.  #0 PC13 1
##END
```

`seq` is an event index for now; a real timebase replaces it once SysTick is modelled.
`trace.js` ignores any non-matching lines (QEMU banners, stray prints).

## Hardening flags (sandbox.js)

`--network none` · `--read-only` + `--tmpfs /work` · `--cap-drop ALL` ·
`--security-opt no-new-privileges` · `--pids-limit` · `--memory`/`--memory-swap` ·
`--cpus` · `--user 1000:1000`. Enforced twice: container caps + the runtime's own
`--timeout` backstop, plus a host-side `SIGKILL` as the primary stop (so runaway runs are
reported as `timeout`). Identical posture to nikaVSimulator.

## Validating the spike (needs a container runtime — not the dev sandbox)

```bash
# from the project root, on a machine with podman/docker + the runtime
podman build -t stm-sim-mainline -f sim/Dockerfile.mainline .
echo '<paste firmware/blink.c>' | podman run --rm -i \
  --network none --read-only --tmpfs /work:rw,size=64m \
  --cap-drop ALL --security-opt no-new-privileges localhost/stm-sim-mainline
# expect:  #0 PC13 1 ... #15 PC13 0 ... ##END   on stdout

# or build the firmware directly with the toolchain:
cd firmware && make && make run-main      # mainline
cd firmware && make run-xpack             # xPack fork
```
