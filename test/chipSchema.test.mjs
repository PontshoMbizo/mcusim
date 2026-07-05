// Unit tests for chip data model / validation (mirrors nikaVSimulator's
// components.test.mjs, adapted for C chips + GPIO board pins).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseChipPins,
  chipModuleNames,
  makeStubChip,
  validateComponents,
  MAX_COMPONENTS,
  MAX_WIRES,
  MAX_WAYPOINTS_PER_WIRE,
} from "../src/lib/chipSchema.js";

// ---- Shared fixtures ----

const BUTTON_CHIP_SRC = `// module button_chip(input A, output C);
static void button_chip_step(void) {
  // TODO: behaviour
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

// Minimal board pin set: one GPIO, one power pin, one ground pin.
const BOARD_PINS = [
  { id: "PC13", kind: "io" },
  { id: "PA0", kind: "io" },
  { id: "5V", kind: "pwr" },
  { id: "GND", kind: "gnd" },
];

// ============================================================
// makeStubChip / parseChipPins / chipModuleNames
// ============================================================

test("makeStubChip generates a module comment + empty _step body", () => {
  const src = makeStubChip("my_chip", ["A", "B"], ["C"]);
  assert.match(src, /\/\/ module my_chip\(input A, input B, output C\);/);
  assert.match(src, /static void my_chip_step\(void\) {/);
  assert.match(src, /\/\/ TODO: behaviour/);
});

test("makeStubChip works with no ports", () => {
  const src = makeStubChip("empty_chip", [], []);
  assert.match(src, /\/\/ module empty_chip\(\);/);
});

test("parseChipPins extracts input/output pins from the module comment", () => {
  const pins = parseChipPins(BUTTON_CHIP_SRC, "button_chip");
  assert.equal(pins.length, 2);
  const a = pins.find((p) => p.name === "A");
  assert.equal(a.dir, "input");
  const c = pins.find((p) => p.name === "C");
  assert.equal(c.dir, "output");
});

test("parseChipPins returns [] for unknown chip name", () => {
  assert.deepEqual(parseChipPins(BUTTON_CHIP_SRC, "nonexistent"), []);
});

test("chipModuleNames finds every declared module comment", () => {
  const names = chipModuleNames(BUTTON_CHIP_SRC);
  assert.deepEqual(names, ["button_chip"]);
});

// ============================================================
// validateComponents — caps
// ============================================================

test("validateComponents errors on too many components", () => {
  const comps = Array.from({ length: MAX_COMPONENTS + 1 }, (_, i) => ({
    id: `c${i}`,
    name: `chip${i}`,
    source: `// module chip${i}(input A);\nstatic void chip${i}_step(void) {}`,
  }));
  const diags = validateComponents(comps, [], BOARD_PINS);
  assert.ok(diags.some((d) => d.severity === "error" && /Too many components/.test(d.message)));
});

test("validateComponents errors on too many wires", () => {
  const manyWires = Array.from({ length: MAX_WIRES + 1 }, (_, i) => ({
    id: `w${i}`,
    a: { comp: "c1", pin: "A" },
    b: { pin: "PC13" },
  }));
  const diags = validateComponents([BUTTON_CHIP], manyWires, BOARD_PINS);
  assert.ok(diags.some((d) => d.severity === "error" && /Too many wires/.test(d.message)));
});

test("validateComponents errors when a wire has too many waypoints", () => {
  const waypoints = Array.from({ length: MAX_WAYPOINTS_PER_WIRE + 1 }, (_, i) => ({ x: i, y: i }));
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PC13" }, waypoints };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(diags.some((d) => d.severity === "error" && /waypoints/.test(d.message)));
});

// ============================================================
// validateComponents — identifier / duplicate / source checks
// ============================================================

test("validateComponents errors on duplicate component id", () => {
  const c2 = { ...BUTTON_CHIP, name: "other_chip", source: `// module other_chip(input A);\nstatic void other_chip_step(void) {}` };
  const diags = validateComponents([BUTTON_CHIP, c2], [], BOARD_PINS);
  assert.ok(diags.some((d) => /Duplicate component id/.test(d.message)));
});

test("validateComponents errors on duplicate component name", () => {
  const c2 = { ...BUTTON_CHIP, id: "c2" };
  const diags = validateComponents([BUTTON_CHIP, c2], [], BOARD_PINS);
  assert.ok(diags.some((d) => /Duplicate component name/.test(d.message)));
});

test("validateComponents errors on invalid C identifier name", () => {
  const bad = { ...BUTTON_CHIP, name: "1bad-name" };
  const diags = validateComponents([bad], [], BOARD_PINS);
  assert.ok(diags.some((d) => /not a valid C identifier/.test(d.message)));
});

test("validateComponents errors when module comment doesn't match declared name", () => {
  const bad = { id: "c1", name: "mismatch", source: BUTTON_CHIP_SRC };
  const diags = validateComponents([bad], [], BOARD_PINS);
  assert.ok(diags.some((d) => /no "\/\/ module mismatch/.test(d.message)));
});

test("validateComponents errors when the chip is missing its _step function", () => {
  const bad = { id: "c1", name: "button_chip", source: "// module button_chip(input A, output C);\n// no step fn" };
  const diags = validateComponents([bad], [], BOARD_PINS);
  assert.ok(diags.some((d) => /missing its "button_chip_step/.test(d.message)));
});

// ============================================================
// validateComponents — wire endpoint checks
// ============================================================

test("validateComponents errors WIRE_BAD_ENDPOINT for unknown component", () => {
  const wire = { id: "w1", a: { comp: "nonexistent", pin: "A" }, b: { pin: "PC13" } };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(diags.some((d) => /WIRE_BAD_ENDPOINT/.test(d.message) && /nonexistent/.test(d.message)));
});

test("validateComponents errors WIRE_BAD_ENDPOINT for unknown pin on known component", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "NOPIN" }, b: { pin: "PC13" } };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(diags.some((d) => /WIRE_BAD_ENDPOINT/.test(d.message) && /NOPIN/.test(d.message)));
});

test("validateComponents errors WIRE_UNMAPPED_PIN for a board pin that doesn't exist", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PZ99" } };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(diags.some((d) => /WIRE_UNMAPPED_PIN/.test(d.message)));
});

test("validateComponents rejects wiring to a power/ground pin", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "5V" } };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(diags.some((d) => /not GPIO/.test(d.message)));
});

test("validateComponents accepts a wire to a valid GPIO pin", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PC13" } };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(!diags.some((d) => d.severity === "error"));
});

test("validateComponents errors WIRE_DRIVER_CONFLICT for two chip outputs on same net", () => {
  const c2 = { id: "c2", name: "chip2", source: `// module chip2(output C);\nstatic void chip2_step(void) {}` };
  const wire1 = { id: "w1", a: { comp: "c1", pin: "C" }, b: { pin: "PC13" } };
  const wire2 = { id: "w2", a: { comp: "c2", pin: "C" }, b: { pin: "PC13" } };
  const diags = validateComponents([BUTTON_CHIP, c2], [wire1, wire2], BOARD_PINS);
  assert.ok(diags.some((d) => /WIRE_DRIVER_CONFLICT/.test(d.message)));
});

test("validateComponents warns about a floating chip input", () => {
  const diags = validateComponents([BUTTON_CHIP], [], BOARD_PINS);
  assert.ok(diags.some((d) => d.severity === "warning" && /input pin "A" has no wire/.test(d.message)));
});

test("validateComponents does not warn when the input is wired", () => {
  const wire = { id: "w1", a: { comp: "c1", pin: "A" }, b: { pin: "PC13" } };
  const diags = validateComponents([BUTTON_CHIP], [wire], BOARD_PINS);
  assert.ok(!diags.some((d) => /has no wire/.test(d.message)));
});
