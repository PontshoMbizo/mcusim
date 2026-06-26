# CLAUDE.md — stmVSimulator

Context for Claude working in this project. Read at session start.

## What this is

An in-browser simulator for the **STM32F103C8T6 "Blue Pill"** board. The user writes
**bare-metal C** (direct register access — RCC, GPIO, TIM, NVIC; no HAL), it is
cross-compiled and executed in a sandboxed **QEMU** ARM emulator, and the resulting
peripheral activity drives a live interactive board view (pins light up, waveforms render).

This is the MCU analogue of `nikaVSimulator` (Tang Nano 9K FPGA + Verilog + iverilog).
Reuse its proven shape wherever it maps cleanly:

- Next.js app, `src/app/api/simulate/route.js` as the entry contract
- Monaco editor pane → POST source → backend → trace → shared board-state model
- Board defined by data files (pins/components/nets JSON) + a board descriptor in `src/boards/`
- Interactive board image with pin overlay, inspector, search, legend
- Sandbox is ephemeral, no network, read-only FS, non-root, resource-capped, auto-killed

What changes vs nikaV: the backend compiles C with `arm-none-eabi-gcc` and runs
`qemu-system-arm` instead of `iverilog`/`vvp`; the "waveform" source is a peripheral/GPIO
trace rather than a VCD (an early option: still emit VCD-shaped data so the existing
waveform pane is reusable).

## Tech stack

- **Frontend:** Next.js 16 / React 19, Tailwind, Monaco editor, framer-motion
- **Firmware lang:** bare-metal C (CMSIS register defs OK, no HAL)
- **Toolchain:** `arm-none-eabi-gcc`, custom linker script + startup/vector table for F103
- **Engine:** `qemu-system-arm` (machine model for a Cortex-M3 / STM32F103-like target)
- **Sandbox:** container (podman/docker) — same lock-down posture as nikaV's `sim/`

## Board facts (STM32F103C8T6)

- Cortex-M3, 72 MHz max, 64 KB flash, 20 KB SRAM
- GPIO ports A/B/C; on-board LED on **PC13** (active low), 8 MHz HSE crystal
- Peripherals to model first: GPIO, SysTick, TIM2/3/4, USART1, then SPI/I2C/ADC

## Key constraints

- Solo developer. Keep the backend posture identical to nikaV — untrusted code from
  anyone runs in the sandbox, so resource caps and isolation are non-negotiable.
- QEMU's stock STM32 peripheral support is partial; expect to model some peripherals
  (or pick a machine/board QEMU already supports well) — this is the main technical risk.
- Prefer reusing nikaV's frontend + model code over rewriting.

## How to help effectively

- When unsure about a peripheral's registers, check
  `~/Workspace/second brain/20 - Notes/Electrical Engineering/Embedded Systems/` and
  `.../Digital Design/STM32 timers and programming.md`.
- Project notes, decisions (ADRs), and learnings live in
  `~/Workspace/second brain/10 - Projects/STM32 Simulator/`.
- Commit frequently.
