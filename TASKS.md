# stmVSimulator — Tasks

Target: STM32F103C8 "Blue Pill" · bare-metal C · QEMU backend · Next.js frontend.
Mirrors nikaVSimulator's architecture; reuse its frontend + model where possible.

## Phase 0 — Spike the backend (de-risk first)

- [ ] Install `arm-none-eabi-gcc` + `qemu-system-arm`; confirm versions
- [ ] Write a minimal F103 linker script + startup (vector table, reset handler, `.data`/`.bss` init)
- [ ] Blink PC13 in bare-metal C → compile to `.elf` → run under `qemu-system-arm`
- [ ] Decide QEMU machine/board: stock STM32 support vs a Cortex-M3 model we drive
- [ ] Get **one** observable signal out of QEMU (semihosting/UART/GPIO memory watch)
- [ ] **DONE marker:** a known-good blink produces a machine-readable pin trace

## Phase 1 — Board model + viewer (port from nikaV)

- [ ] Source/redraw a Blue Pill board image; define `src/boards/bluepill.js`
- [ ] Author `pins.json` / `components.json` / `nets.json` for the F103 pinout (48-pin LQFP)
- [ ] Port `HardwareViewer` + pin overlay / inspector / legend / search from nikaV
- [ ] Pin-mapper page: map firmware GPIO (e.g. PC13) → board pin highlight

## Phase 2 — Simulation pipeline

- [ ] `/api/simulate` contract: POST `{ code }` → `{ ok, trace, log, stage }`
- [ ] Sandbox entrypoint: `stdin C → gcc → qemu → trace on stdout, logs on stderr`
- [ ] Lock down the container (no network, read-only FS, non-root, CPU/mem/time caps)
- [ ] Trace format: GPIO level changes + timestamps (consider VCD shape for reuse)
- [ ] Parser → shared board-state model → live pin states + waveform pane

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
