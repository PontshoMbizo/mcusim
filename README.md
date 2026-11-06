# mcusim

**Write bare-metal C for the STM32F103 "Blue Pill" in your browser and watch it run on a virtual board.**
No toolchain install and no hardware needed.

<!-- TODO: add a screenshot or short GIF of the editor + board view + waveforms here -->

Companion to [fpgasim](https://github.com/PontshoMbizo/fpgasim), which does the same for the Tang Nano 9K FPGA with Verilog. mcusim swaps the Verilog simulator for an MCU execution model: firmware is cross-compiled and run under QEMU.

## How it works

```
Editor (bare-metal C, Monaco)
   │  POST /api/simulate { code, engine? }
   ▼
Next.js API route ── rate limit, concurrency cap, size cap
   ▼
Ephemeral container per run
   arm-none-eabi-gcc → firmware.elf → qemu-system-arm → pin trace
   no network, read-only filesystem, non-root, CPU/memory/PID caps, dual timeout
   ▼
Trace parser → board-state model → pin overlay + waveform pane
```

You write register-level C (RCC, GPIO, TIM, NVIC; no HAL). The firmware template provides the F103 startup code, linker script and a semihosting trace helper. See [docs/simulation-backend.md](docs/simulation-backend.md) for the sandbox design and the observability trade-offs.

## Status

Working:
- Sandboxed compile-and-run pipeline and `/api/simulate` contract
- Trace format and parser (unit tested)
- Self-contained SVG Blue Pill board with 44 pins, alternate functions, inspector, search and legend
- C editor with a bare-metal blink starter, waveform pane, CI and deployment

In progress:
- End-to-end verification of the QEMU pipeline on the container host
- Choosing the default engine (see below)
- Peripherals beyond GPIO (SysTick, timers/PWM, USART) and an example gallery

## Design decisions

| Decision | Why |
|---|---|
| QEMU as the execution engine | Runs real ARM Cortex-M3 machine code, so the C you write is the C that executes |
| Two engines spiked: mainline QEMU and xPack QEMU | Mainline QEMU has no STM32F103 machine and does not reliably model GPIO output, so it uses a semihosting trace. xPack models GPIO natively. The default will be chosen from measurements |
| Locked-down container per run | Untrusted C from the internet: no network, read-only filesystem, non-root, resource caps, auto-kill |
| Trace shaped like VCD | The waveform pane and board model are shared with fpgasim |

## Run it locally

Requires Node 20+ and Docker.

```bash
npm install
# build the sandbox images once, see sim/README.md
npm run dev          # http://localhost:3000
```

## Tests

```bash
npm test             # trace parser and chip model unit tests
```

CI runs lint, tests and a production build.

## Licence

TODO: add a licence file (MIT suggested).
