# stmVSimulator — Tasks

Target: STM32F103C8 "Blue Pill" · bare-metal C · QEMU backend · Next.js frontend.
Mirrors nikaVSimulator's architecture; reuse its frontend + model where possible.

## Phase 0 — Spike the backend (de-risk first)

- [x] **DONE** F103 linker script + startup (vector table, reset, `.data`/`.bss` init) — `firmware/`
- [x] **DONE** Blink PC13 in bare-metal C with semihosting trace — `firmware/blink.c` + `trace.h`
- [x] **DONE** Observability path chosen to spike both: mainline semihosting trace + xPack native GPIO
- [x] **DONE** Sim container for both engines — `sim/Dockerfile.mainline`, `Dockerfile.xpack`, `entrypoint.sh`
- [x] **DONE** Makefile with `run-main` / `run-xpack` targets
- [ ] **RUN ON DOCKER HOST:** build images, pipe `blink.c`, confirm `##END` trace (see `sim/README.md` checklist)
- [ ] Decide default engine after comparing xPack native GPIO vs mainline trace

## Phase 1 — Board model + viewer (port from nikaV)

- [ ] Source/redraw a Blue Pill board image; define `src/boards/bluepill.js`
- [ ] Author `pins.json` / `components.json` / `nets.json` for the F103 pinout (48-pin LQFP)
- [ ] Port `HardwareViewer` + pin overlay / inspector / legend / search from nikaV
- [ ] Pin-mapper page: map firmware GPIO (e.g. PC13) → board pin highlight

## Phase 1.5 — Backend pipeline (DONE — ported from nikaV)

- [x] **DONE** `/api/simulate` contract: POST `{ code, engine? }` → `{ ok, engine, trace, model, log, stage }` — `src/app/api/simulate/route.js`
- [x] **DONE** Sandbox entrypoint: `stdin C → gcc → qemu → trace on stdout, logs on stderr`
- [x] **DONE** Container lockdown in `src/lib/sandbox.js` (no network, read-only FS, non-root, CPU/mem/pid/time caps, dual timeout)
- [x] **DONE** Trace format + parser → board-state model — `src/lib/trace.js` (4 unit tests passing)
- [ ] Wire the parsed model into the (Phase 2) pin overlay + waveform pane

## Phase 3 — Editor + UX

- [ ] Monaco editor pane with C syntax + bare-metal F103 starter template
- [ ] Run button → footer status (green/red, first log line) like nikaV
- [ ] Signal/waveform pane driven by the trace
- [ ] Example gallery: blink, SysTick delay, TIM PWM, USART "hello"

## Phase 4 — Peripherals (incremental)

- [ ] GPIO (read/write, modes) — first
- [ ] SysTick + TIM2/3/4 (delays, PWM)
- [ ] USART1 TX (serial console pane)
- [ ] SPI / I2C / ADC

## Phase 5 — Hardening + ship

- [ ] Rate limit + concurrency cap + size cap on `/api/simulate`
- [ ] Unit tests for the trace parser and board model (Node `--test`, mirror nikaV)
- [ ] Dockerfile(s) + compose; CI build
- [ ] Docs: `docs/simulation-backend.md`, `docs/API.md`
