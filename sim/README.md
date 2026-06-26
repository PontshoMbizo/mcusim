# sim/ — the firmware sandbox

One container = one untrusted firmware run. Reads bare-metal C on stdin, emits a pin
trace on stdout, logs on stderr. See `../docs/simulation-backend.md` for the full design.

## Images

| File | Engine | Notes |
|------|--------|-------|
| `Dockerfile.mainline` | `qemu-system-arm` (`stm32vldiscovery`, Cortex-M3) | maintained; pins observed via semihosting trace |
| `Dockerfile.xpack` | `qemu-system-gnuarmeclipse` (native STM32F103 GPIO/LED) | less maintained; pin `XPACK_VER` when building |

Both bake in `firmware/startup.c`, `firmware/stm32f103.ld`, `firmware/trace.h`; user code
supplies `main()`.

## Build + run (requires podman/docker — not available in the dev sandbox)

```bash
# from the project ROOT (build context must see ./firmware and ./sim)
podman build -t stm-sim-mainline -f sim/Dockerfile.mainline .
podman build -t stm-sim-xpack    -f sim/Dockerfile.xpack .

cat firmware/blink.c | podman run --rm -i --network none --read-only \
  --tmpfs /work:rw,size=64m --cap-drop ALL --security-opt no-new-privileges \
  localhost/stm-sim-mainline
```

Expected stdout: a run of `#<n> PC13 1` / `#<n> PC13 0` lines ending in `##END`.

## Status / open items (Phase 0 spike)

- [ ] Confirm `apk add gcc-arm-none-eabi newlib-arm-none-eabi` provides `-lgcc` + headers
      for `-nostdlib` builds (Alpine package names can drift).
- [ ] Confirm `stm32vldiscovery` loads an ELF linked at `0x08000000` and runs it.
- [ ] Confirm mainline semihosting writes reach stdout under `-nographic`.
- [ ] xPack: verify the current `XPACK_VER` + the `--board/--mcu` names for an F103.
- [ ] Compare xPack native GPIO/LED state against the semihosting trace, then pick the
      default engine.
