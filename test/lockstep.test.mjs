// Unit tests for mcusim's fulgurlab lockstep bridge: LOCKSTEP_PINS parsing, glue
// codegen, line codec, session management (against fakesim.mjs) and the ws message
// handler. Hermetic — no container, no QEMU, no arm-none-eabi-gcc.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  parseLockstepPins,
  generateLockstepGlue,
  MAX_EDGE_EVENTS_PER_QUANTUM,
} from "../src/lib/lockstepGlue.js";
import { inputsToHex, hexToOutputs, parseSimLine, eventsFromSnapshots } from "../src/lib/lockstepCodec.js";
import { LockstepSession } from "../src/lib/lockstepSession.js";
import { handleConnection, PROTO } from "../bridge/server.mjs";

const FAKESIM = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "fakesim.mjs");
const fakeCmd = [process.execPath, FAKESIM];

const BLINK_SRC = `
#include "trace.h"
LOCKSTEP_PINS("PC13:out", "PA0:in");
int main(void) {
  for (;;) {
    if (trace_read("PA0")) trace_pin("PC13", 1);
  }
}
`;

// ---------- LOCKSTEP_PINS parsing ----------

test("parseLockstepPins: names, dirs, order; comments ignored", () => {
  const r = parseLockstepPins(BLINK_SRC + "\n// LOCKSTEP_PINS(\"NOT_ME:out\")\n");
  assert.equal(r.error, undefined);
  assert.deepEqual(r.pins, [
    { name: "PC13", dir: "out" },
    { name: "PA0", dir: "in" },
  ]);
});

test("parseLockstepPins: missing declaration, bad entries, dupes rejected", () => {
  assert.match(parseLockstepPins("int main(void){}").error, /no LOCKSTEP_PINS/);
  assert.match(parseLockstepPins('LOCKSTEP_PINS("PC13:sideways");').error, /bad LOCKSTEP_PINS entry/);
  assert.match(parseLockstepPins('LOCKSTEP_PINS("A:in", "A:out");').error, /duplicate/);
  assert.match(parseLockstepPins("LOCKSTEP_PINS();").error, /no pins/);
});

// ---------- glue codegen ----------

test("glue: strong hooks, SysTick exchange, engine cycle rate, edge cap", () => {
  const { pins } = parseLockstepPins(BLINK_SRC);
  const g = generateLockstepGlue(pins, { cyclesPerUs: 24 });
  assert.match(g, /void __trace_pin_hook\(const char \*name, unsigned value\)/);
  assert.match(g, /int __trace_read_hook\(const char \*name\)/);
  assert.match(g, /void SysTick_Handler\(void\)/);
  assert.match(g, /void __lockstep_boot\(void\)/);
  assert.match(g, /#define __FL_CYC_PER_US 24u/);
  assert.match(g, new RegExp(`#define __FL_MAX_EV ${MAX_EDGE_EVENTS_PER_QUANTUM}`));
  assert.match(g, /"PC13"/);
  assert.match(g, /"PA0"/);
  // out/in tables must be direction-filtered
  assert.match(g, /#define __FL_NOUT 1/);
  assert.match(g, /#define __FL_NIN {2}1/);
});

test("glue: xpack engine gets 72 cycles/µs", () => {
  const { pins } = parseLockstepPins(BLINK_SRC);
  assert.match(generateLockstepGlue(pins, { cyclesPerUs: 72 }), /#define __FL_CYC_PER_US 72u/);
});

// ---------- codec (deliberate copy of fpgasim's; assert the contract here too) ----------

test("codec: hex vectors are LSB-first over direction-filtered pins", () => {
  const pins = [
    { name: "PC13", dir: "out" },
    { name: "PA0", dir: "in" },
    { name: "PA1", dir: "in" },
  ];
  assert.equal(inputsToHex(pins, { PA0: 1 }), "1");
  assert.equal(inputsToHex(pins, { PA1: 1 }), "2");
  assert.deepEqual(hexToOutputs(pins, "1"), { PC13: 1 });
  assert.deepEqual(parseSimLine("O 2000000 1"), { kind: "O", tNs: 2000000, outHex: "1" });
  assert.deepEqual(
    eventsFromSnapshots(pins, "0", [{ tNs: 1500000, outHex: "1" }]),
    [[1500000, "PC13", 1]]
  );
});

// ---------- session (against fakesim; same semantics as fpgasim's) ----------

test("session: framing + step/reply; reply timeout kills", async () => {
  const s = new LockstepSession("plain firmware", { command: fakeCmd });
  const r = await s.step(1000000, "1");
  assert.equal(r.tNs, 1000000);
  s.dispose();

  const hung = new LockstepSession("FAKE_HANG", { command: fakeCmd, replyTimeoutMs: 150 });
  await assert.rejects(() => hung.step(1000000, "0"), /reply-timeout/);
  assert.equal(hung.dead, true);
});

test("session: X ends session (firmware SYS_EXIT path)", async () => {
  let ended;
  const s = new LockstepSession("FAKE_END_AT_2", { command: fakeCmd, onEnd: (r) => (ended = r) });
  await s.step(1000000, "0");
  await assert.rejects(() => s.step(1000000, "0"), /ended: done/);
  assert.equal(ended, "done");
});

// ---------- ws message handler ----------

function stubWs() {
  const handlers = {};
  return {
    OPEN: 1,
    readyState: 1,
    sent: [],
    on(ev, fn) { handlers[ev] = fn; },
    send(s) { this.sent.push(JSON.parse(s)); },
    emit(ev, ...a) { return handlers[ev]?.(...a); },
    async say(obj) { await handlers.message(JSON.stringify(obj)); },
    last() { return this.sent[this.sent.length - 1]; },
  };
}

const makeFakeSession = (source, hooks) => new LockstepSession(source, { ...hooks, command: fakeCmd });

test("server: hello names the mcusim backend", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "hello", proto: PROTO });
  assert.equal(ws.last().backend, "mcusim");
});

test("server: create parses LOCKSTEP_PINS; step exchanges quanta", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "create", source: BLINK_SRC });
  const created = ws.last();
  assert.equal(created.type, "created");
  assert.deepEqual(created.pins, [
    { name: "PC13", dir: "out" },
    { name: "PA0", dir: "in" },
  ]);
  await ws.say({ type: "step", session: created.session, t_ns: 0, inputs: { PA0: 1 } });
  const stepped = ws.last();
  assert.equal(stepped.type, "stepped");
  assert.deepEqual(Object.keys(stepped.outputs), ["PC13"]);
  await ws.say({ type: "dispose", session: created.session });
  assert.equal(ws.last().type, "disposed");
});

test("server: firmware without LOCKSTEP_PINS is a compile-stage error", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "create", source: "int main(void){for(;;);}" });
  assert.equal(ws.last().type, "error");
  assert.equal(ws.last().stage, "compile");
  assert.match(ws.last().log, /LOCKSTEP_PINS/);
});

test("server: unknown engine rejected", async () => {
  const ws = stubWs();
  handleConnection(ws, makeFakeSession);
  await ws.say({ type: "create", source: BLINK_SRC, config: { engine: "veryfast" } });
  assert.equal(ws.last().type, "error");
  assert.match(ws.last().log, /unknown engine/);
});
