// Unit tests for the trace parser (mirrors nikaVSimulator's node:test setup).
//   run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTrace, computePinStates } from "../src/lib/trace.js";

test("parses a well-formed blink trace", () => {
  const raw = [
    "QEMU 8.2.0 monitor banner (ignored)",
    "#0 PC13 1",
    "#1 PC13 0",
    "#2 PC13 1",
    "##END",
  ].join("\n");

  const m = parseTrace(raw);
  assert.equal(m.ok, true);
  assert.equal(m.complete, true);
  assert.equal(m.events.length, 3);
  assert.equal(m.signals.PC13.transitions.length, 3);
  assert.deepEqual(m.last, { PC13: 1 });
  assert.deepEqual(computePinStates(m), { PC13: 1 });
});

test("flags an incomplete trace (no ##END)", () => {
  const m = parseTrace("#0 PC13 1\n#1 PC13 0\n");
  assert.equal(m.ok, true);
  assert.equal(m.complete, false);
  assert.equal(m.last.PC13, 0);
});

test("ignores noise and empty input", () => {
  assert.equal(parseTrace("").ok, false);
  const m = parseTrace("random qemu log\nnot a trace line\n##END");
  assert.equal(m.ok, false);
  assert.equal(m.complete, true);
});

test("tracks multiple signals independently", () => {
  const m = parseTrace("#0 PA5 1\n#1 PC13 0\n#2 PA5 0\n##END");
  assert.equal(Object.keys(m.signals).length, 2);
  assert.equal(m.signals.PA5.transitions.length, 2);
  assert.deepEqual(m.last, { PA5: 0, PC13: 0 });
});
