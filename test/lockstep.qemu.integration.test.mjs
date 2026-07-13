// End-to-end lockstep against REAL arm-none-eabi-gcc + qemu-system-arm (no container):
// compiles user firmware + generated glue and drives quanta through
// sim/entrypoint-lockstep.sh exactly as the bridge server would. Skips when the
// toolchain isn't installed (the sandbox images have it; CI can apt-install).
//
// This is the test that pins down the icount/SysTick behaviour documented in
// lockstepGlue.js (disarm-during-exchange) — QEMU 6.2+ / stm32vldiscovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseLockstepPins, generateLockstepGlue } from "../src/lib/lockstepGlue.js";
import { LockstepSession } from "../src/lib/lockstepSession.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function have(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
const HAVE = have("arm-none-eabi-gcc", ["--version"]) && have("qemu-system-arm", ["--version"]);

// entrypoint-lockstep.sh compiles against /opt/fw and works in /work; outside a
// container we re-point both at repo firmware/ and a throwaway dir.
function hostEntrypoint() {
  const dir = mkdtempSync(path.join(tmpdir(), "fl-mcu-"));
  const text = readFileSync(path.join(ROOT, "sim", "entrypoint-lockstep.sh"), "utf8")
    .replaceAll("/opt/fw", path.join(ROOT, "firmware"))
    .replaceAll("/work", dir);
  const patched = path.join(dir, "entrypoint.sh");
  writeFileSync(patched, text, { mode: 0o755 });
  return patched;
}

// PC13 mirrors PA0 — the simplest closed loop that proves inputs reach the firmware
// and outputs come back, quantum by quantum.
const MIRROR_SRC = `
#include "trace.h"
LOCKSTEP_PINS("PC13:out", "PA0:in");
int main(void) {
  unsigned v, i;
  for (;;) {
    v = (unsigned)trace_read("PA0");
    trace_pin("PC13", v);
    for (i = 0; i < 200; ++i) asm volatile("nop");
  }
}
`;

function makeSource() {
  const pins = parseLockstepPins(MIRROR_SRC);
  assert.equal(pins.error, undefined);
  return MIRROR_SRC + generateLockstepGlue(pins.pins, { cyclesPerUs: 24 });
}

test("qemu e2e: PC13 follows PA0 across quanta (bidirectional lockstep)", { skip: !HAVE }, async () => {
  const s = new LockstepSession(makeSource(), {
    command: ["sh", hostEntrypoint()],
    replyTimeoutMs: 30_000,
  });

  const r1 = await s.step(1_000_000, "1"); // PA0 = 1
  assert.equal(r1.tNs, 1_000_000);
  assert.equal(r1.outHex, "1", "PC13 must mirror PA0=1 by the end of quantum 1");

  const r2 = await s.step(1_000_000, "0"); // PA0 = 0
  assert.equal(r2.tNs, 2_000_000);
  assert.equal(r2.outHex, "0", "PC13 must follow PA0 back to 0");
  assert.ok(r2.snaps.some((e) => e.outHex === "0"), "the 1→0 edge must be reported");

  const r3 = await s.step(1_000_000, "1");
  assert.equal(r3.outHex, "1", "PC13 must follow PA0 back to 1");
  assert.equal(r3.tNs, 3_000_000, "virtual time = sum of quanta (lockstep, not wall)");
  s.dispose();
});

test("qemu e2e: compile failure exits with stage code 2", { skip: !HAVE }, async () => {
  await new Promise((resolve) => {
    const s = new LockstepSession('LOCKSTEP_PINS("PC13:out"); int main(void { broken', {
      command: ["sh", hostEntrypoint()],
      onEnd: () => {
        assert.equal(s.dead, true);
        resolve();
      },
    });
  });
});
