# stmVSimulator — Example Problems

Self-contained worked problems for the STM32 (Blue Pill) bare-metal C simulator. Each
folder has a `PROBLEM.md` (statement + how to run), a `starter.c` skeleton, and a
reference `solution.c`. Paste the firmware into the editor at `/tools/mcu` (in scope.io)
or run it locally through the sandbox image with `podman`.

| Problem | Folder | Concepts |
|---|---|---|
| Bit-Banged UART Transmitter on PC13 | [`uart-tx/`](uart-tx/) | GPIO registers, serial framing, semihosting trace |

Run any example locally through the same sandbox image CI builds:

```bash
podman build -t stm-sim-mainline -f sim/Dockerfile.mainline .
podman run --rm -i stm-sim-mainline < uart-tx/solution.c   # -> #n PC13 v ... ##END
```
