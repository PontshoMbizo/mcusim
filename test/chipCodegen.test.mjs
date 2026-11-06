// Unit tests for chip wiring codegen (mirrors fpgasim's generateComponentLayer
// tests in components.test.mjs — golden-ish assertions on the generated glue text).
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWiringGlue, generateCombinedSource } from "../src/lib/chipCodegen.js";

const FIRMWARE = `#include "trace.h"\nint main(void) { trace_pin("PC13", 1); trace_end(); trace_exit(); }`;

const BUTTON_CHIP_SRC = `// module button_chip(input A, output C);
static void button_chip_step(void) {
  button_chip_C(button_chip_A());
}`;

const BUTTON_CHIP = {
  id: "c1",
  name: "button_chip",
  source: BUTTON_CHIP_SRC,
  pins: [
    { dir: "input", name: "A" },
    { dir: "output", name: "C" },
  ],
};

test("generateWiringGlue returns '' when there are no components", () => {
  assert.equal(generateWiringGlue([], []), "");
});

test("generateWiringGlue still emits glue for a component with zero wires", () => {
  const glue = generateWiringGlue([BUTTON_CHIP], []);
  assert.match(glue, /button_chip_step\(\);/);
  assert.match(glue, /static inline int button_chip_A\(void\) { return 0; } \/\* unwired \*\//);
  assert.match(glue, /static inline void button_chip_C\(int v\) { \(void\)v; } \/\* unwired \*\//);
});

test("generateWiringGlue declares a net variable and accessors for a wired board pin", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PC13" } };
  const glue = generateWiringGlue([BUTTON_CHIP], [wire]);
  assert.match(glue, /static volatile int net_1 = 0;/);
  assert.match(glue, /static inline int button_chip_A\(void\) { return net_1; }/);
});

test("generateWiringGlue's __trace_pin_hook dispatches by board pin name and steps every chip", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PC13" } };
  const glue = generateWiringGlue([BUTTON_CHIP], [wire]);
  assert.match(glue, /void __trace_pin_hook\(const char \*name, unsigned value\) {/);
  assert.match(glue, /if \(streq_\(name, "PC13"\)\) { net_1 = \(int\)value; }/);
  assert.match(glue, /button_chip_step\(\);/);
});

test("generateWiringGlue's __trace_read_hook returns the net value for a wired board pin", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "C" }, b: { pin: "PA0" } };
  const glue = generateWiringGlue([BUTTON_CHIP], [wire]);
  assert.match(glue, /int __trace_read_hook\(const char \*name\) {/);
  assert.match(glue, /if \(streq_\(name, "PA0"\)\) { return net_1; }/);
});

test("generateWiringGlue shares one net variable across a chip-to-chip wire", () => {
  const chip2 = {
    id: "c2",
    name: "chip2",
    source: `// module chip2(input D);\nstatic void chip2_step(void) {}`,
    pins: [{ dir: "input", name: "D" }],
  };
  const wire = { id: "w1", a: { comp: "c1", pin: "C" }, b: { comp: "c2", pin: "D" } };
  const glue = generateWiringGlue([BUTTON_CHIP, chip2], [wire]);
  assert.match(glue, /static inline void button_chip_C\(int v\) { net_1 = v; }/);
  assert.match(glue, /static inline int chip2_D\(void\) { return net_1; }/);
  // No board pin touches this net, so no dispatch line for it — but both chips still step.
  assert.match(glue, /button_chip_step\(\);/);
  assert.match(glue, /chip2_step\(\);/);
});

test("generateCombinedSource returns the firmware unchanged when there are no components", () => {
  assert.equal(generateCombinedSource(FIRMWARE, [], []), FIRMWARE);
});

test("generateCombinedSource orders firmware, then accessors/nets, then chip source, then hooks", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PC13" } };
  const combined = generateCombinedSource(FIRMWARE, [BUTTON_CHIP], [wire]);
  const iFirmware = combined.indexOf("int main(void)");
  const iNetVar = combined.indexOf("static volatile int net_1");
  const iAccessor = combined.indexOf("button_chip_A(void)");
  const iChipStep = combined.indexOf("static void button_chip_step(void) {\n  button_chip_C");
  const iHook = combined.indexOf("void __trace_pin_hook");
  assert.ok(iFirmware >= 0 && iNetVar > iFirmware, "net var should come after firmware");
  assert.ok(iAccessor > iNetVar, "accessor should come after net var declaration");
  assert.ok(iChipStep > iAccessor, "chip source should come after accessors (it calls them)");
  assert.ok(iHook > iChipStep, "hook functions should come after chip source (they call _step)");
});
