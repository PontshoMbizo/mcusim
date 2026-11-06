# stmVSimulator

An in-browser simulator for the **STM32 "Blue Pill" (STM32F103C8T6)**. Write bare-metal
C in a Monaco editor, run it through a sandboxed **QEMU** ARM backend, and watch the
board's GPIO pins, timers, and peripherals come alive in real time.

Spiritual successor to [fpgasim](https://github.com/PontshoMbizo/fpgasim) (which does the same for the
Tang Nano 9K FPGA), rebuilt around an MCU + firmware execution model instead of Verilog.

## How it works (target architecture)

```
Editor (bare-metal C)
   │  POST /api/simulate { code }
   ▼
/api/simulate ── rate limit + size cap ──► sandboxed container
   │                                          arm-none-eabi-gcc → firmware.elf
   │                                          qemu-system-arm (-M ... , no network)
   │                                          peripheral/GPIO trace → stdout
   ▼
parse trace → board model → live pin overlay + signal/waveform pane
```

## Getting started

> Not scaffolded yet — see `TASKS.md` for the build order.

```bash
npm install
npm run dev      # Next.js dev server on http://localhost:3000
```

## Stack

- Next.js / React frontend (board viewer, pin overlay, Monaco editor)
- `arm-none-eabi-gcc` cross-compiler + linker script + startup for STM32F103
- `qemu-system-arm` as the execution engine, in a locked-down container
- Shared trace → board-state model (GPIO levels, timer state, UART output)

See `CLAUDE.md` for working conventions and `~/Workspace/second brain/10 - Projects/STM32 Simulator/`
for design notes and decisions.
