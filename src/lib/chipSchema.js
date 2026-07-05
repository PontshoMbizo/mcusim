// Data model, caps, and validation for external components (custom chips) wired to the
// Blue Pill board. Pure data + validation — no Node APIs — safe to import from client
// components and server route handlers alike.
//
// A "component" is a user-authored C file, compiled into the SAME firmware ELF as the
// design (see chipCodegen.js), exposing a `void <name>_step(void)` function. Wiring is a
// software bus, not real silicon-level tapping: see firmware/trace.h and chipCodegen.js
// for exactly how a chip observes/drives a board pin.
//
// Mirrors nikaVSimulator's componentSchema.js structurally (same caps shape, same
// diagnostic {severity, message, port?} format) — adapted for C instead of Verilog:
// no bit widths (every board pin here is 1-bit GPIO), no .cst layer (board pin ids ARE
// the GPIO names), no inout pins.

// ---- Caps ------------------------------------------------------------------

export const MAX_COMPONENTS = 8;
export const MAX_WIRES = 64;
export const MAX_COMPONENT_CODE_BYTES = 32 * 1024; // 32 KiB per component
export const MAX_WAYPOINTS_PER_WIRE = 12; // manual bend points, purely cosmetic

// ---- Identifier helpers ------------------------------------------------------

/** True if s is a valid C identifier. */
function isCIdent(s) {
  return typeof s === 'string' && /^[A-Za-z_]\w*$/.test(s);
}

const utf8Bytes = (s) => new TextEncoder().encode(s).length;

// ---- Public helpers -----------------------------------------------------------

/**
 * Parse a chip's declared pins from its header comment:
 *   // module <name>(input A, input B, output C, output D);
 * Reuses nikaV's ANSI-port-list grammar (minus bit widths — every pin here is 1-bit
 * GPIO) so the two sibling projects share the same authoring convention.
 *
 * @param {string} source  Full C source for the component.
 * @param {string} name    Chip name to look for in the `// module <name>(...)` comment.
 * @returns {{ dir: 'input'|'output', name: string }[]}
 */
export function parseChipPins(source, name) {
  if (typeof source !== 'string' || !name) return [];
  const re = new RegExp(`//\\s*module\\s+${name}\\s*\\(([^)]*)\\)\\s*;`);
  const m = re.exec(source);
  if (!m) return [];
  const portList = m[1];
  const pins = [];
  for (const raw of portList.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const pm = /^(input|output)\s+([A-Za-z_]\w*)$/.exec(part);
    if (!pm) continue;
    pins.push({ dir: pm[1], name: pm[2] });
  }
  return pins;
}

/**
 * Find every `// module <name>(...)` declaration in a source file (used to check the
 * declared chip name is actually present, mirroring nikaV's moduleNames()).
 * @param {string} source
 * @returns {string[]}
 */
export function chipModuleNames(source) {
  if (typeof source !== 'string') return [];
  const names = [];
  const re = /\/\/\s*module\s+([A-Za-z_]\w*)\s*\(/g;
  let m;
  while ((m = re.exec(source))) names.push(m[1]);
  return names;
}

/**
 * Generate a stub C chip for quick-create (CircuitJS-style dialog, same shape as nikaV's
 * makeStubVerilog): a `// module` pin declaration + an empty `_step` function.
 *
 * @param {string}   name     - Chip name (must be a valid C identifier)
 * @param {string[]} inputs   - Input pin names
 * @param {string[]} outputs  - Output pin names
 * @returns {string} C source string
 */
export function makeStubChip(name, inputs = [], outputs = []) {
  const portList = [
    ...inputs.map((n) => `input ${n}`),
    ...outputs.map((n) => `output ${n}`),
  ];
  return [
    `// module ${name}(${portList.join(', ')});`,
    `static void ${name}_step(void) {`,
    '  // TODO: behaviour',
    '}',
  ].join('\n');
}

// ---- Validation -----------------------------------------------------------

/**
 * Validate an array of components and wires against the board.
 *
 * @param {object[]} components  - {id, name, source} chip descriptors
 * @param {object[]} wires       - {id, a, b} — each endpoint is {comp?,pin?} for chip
 *                                 pins or {pin} for a board pin id (e.g. "PC13")
 * @param {object[]} [boardPins] - The board's pins array ({id, kind, ...}); board wire
 *                                 endpoints are checked against this (must exist and be
 *                                 `kind === 'io'` — power/ground/reset pins can't be wired)
 * @returns {{ severity: 'error'|'warning', message: string, port?: string }[]}
 */
export function validateComponents(components = [], wires = [], boardPins = []) {
  const diags = [];

  if (!Array.isArray(components)) {
    return [{ severity: 'error', message: '`components` must be an array.' }];
  }
  if (!Array.isArray(wires)) {
    return [{ severity: 'error', message: '`wires` must be an array.' }];
  }

  if (components.length > MAX_COMPONENTS) {
    diags.push({ severity: 'error', message: `Too many components (max ${MAX_COMPONENTS}).` });
  }
  if (wires.length > MAX_WIRES) {
    diags.push({ severity: 'error', message: `Too many wires (max ${MAX_WIRES}).` });
  }

  const boardPinById = new Map(boardPins.map((p) => [String(p.id), p]));

  const seenIds = new Set();
  const seenNames = new Set();
  const compMap = new Map(); // id -> { component, pins[] }

  for (const c of components) {
    if (!c || typeof c !== 'object') {
      diags.push({ severity: 'error', message: 'Component entry must be an object.' });
      continue;
    }

    if (!c.id || typeof c.id !== 'string') {
      diags.push({ severity: 'error', message: 'Component missing `id`.' });
    } else if (seenIds.has(c.id)) {
      diags.push({ severity: 'error', message: `Duplicate component id "${c.id}".`, port: c.id });
    } else {
      seenIds.add(c.id);
    }

    if (!c.name || typeof c.name !== 'string') {
      diags.push({ severity: 'error', message: `Component "${c.id || '?'}" missing \`name\`.` });
    } else if (!isCIdent(c.name)) {
      diags.push({ severity: 'error', message: `Component "${c.id}" name "${c.name}" is not a valid C identifier.`, port: c.id });
    } else if (seenNames.has(c.name)) {
      diags.push({ severity: 'error', message: `Duplicate component name "${c.name}".`, port: c.id });
    } else {
      seenNames.add(c.name);
    }

    if (typeof c.source !== 'string' || !c.source.trim()) {
      diags.push({ severity: 'error', message: `Component "${c.id}" has no C source.`, port: c.id });
      compMap.set(c.id, { component: c, pins: [] });
      continue;
    }

    if (utf8Bytes(c.source) > MAX_COMPONENT_CODE_BYTES) {
      diags.push({ severity: 'error', message: `Component "${c.id}" source exceeds ${MAX_COMPONENT_CODE_BYTES / 1024} KiB.`, port: c.id });
    }

    if (c.name && isCIdent(c.name)) {
      const modNames = chipModuleNames(c.source);
      if (!modNames.includes(c.name)) {
        diags.push({
          severity: 'error',
          message: `Component "${c.id}" source has no "// module ${c.name}(...);" pin declaration.`,
          port: c.id,
        });
        compMap.set(c.id, { component: c, pins: [] });
        continue;
      }
      const pins = parseChipPins(c.source, c.name);
      if (pins.length === 0) {
        diags.push({
          severity: 'error',
          message: `Component "${c.id}" module "${c.name}" declares no parseable pins.`,
          port: c.id,
        });
      }
      if (!new RegExp(`\\b${c.name}_step\\s*\\(`).test(c.source)) {
        diags.push({
          severity: 'error',
          message: `Component "${c.id}" is missing its "${c.name}_step(void)" function.`,
          port: c.id,
        });
      }
      compMap.set(c.id, { component: c, pins });
    } else {
      compMap.set(c.id, { component: c, pins: [] });
    }
  }

  // --- Per-wire validation + net-level driver analysis (union-find, mirrors codegen) ---
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    if (parent.get(k) !== k) parent.set(k, find(parent.get(k)));
    return parent.get(k);
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  const chipOutputKeys = new Map(); // "comp:<id>:<pin>" -> "id.pin"
  const chipInputKeys = new Map();
  const seenWireIds = new Set();

  for (const w of wires) {
    if (!w || typeof w !== 'object') {
      diags.push({ severity: 'error', message: 'Wire entry must be an object.' });
      continue;
    }
    if (!w.id || typeof w.id !== 'string') {
      diags.push({ severity: 'error', message: 'Wire missing `id`.' });
    } else if (seenWireIds.has(w.id)) {
      diags.push({ severity: 'error', message: `Duplicate wire id "${w.id}".` });
    } else {
      seenWireIds.add(w.id);
    }

    if (w.waypoints != null) {
      if (!Array.isArray(w.waypoints)) {
        diags.push({ severity: 'error', message: `Wire "${w.id}" \`waypoints\` must be an array.` });
      } else if (w.waypoints.length > MAX_WAYPOINTS_PER_WIRE) {
        diags.push({ severity: 'error', message: `Wire "${w.id}" has ${w.waypoints.length} waypoints (max ${MAX_WAYPOINTS_PER_WIRE}).` });
      }
    }

    const endpointKeys = [];
    const endpointDirs = [];

    for (const ep of [w.a, w.b]) {
      if (!ep || typeof ep !== 'object') {
        diags.push({ severity: 'error', message: `Wire "${w.id}" has a malformed endpoint.` });
        endpointKeys.push(null);
        endpointDirs.push(null);
        continue;
      }

      if (ep.comp != null) {
        const info = compMap.get(ep.comp);
        if (!info) {
          diags.push({ severity: 'error', message: `Wire "${w.id}" references unknown component "${ep.comp}" (WIRE_BAD_ENDPOINT).` });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        const pin = info.pins.find((p) => p.name === ep.pin);
        if (!pin) {
          diags.push({ severity: 'error', message: `Wire "${w.id}" references unknown pin "${ep.pin}" on component "${ep.comp}" (WIRE_BAD_ENDPOINT).` });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        const key = `comp:${ep.comp}:${ep.pin}`;
        const label = `${ep.comp}.${ep.pin}`;
        if (pin.dir === 'output') chipOutputKeys.set(key, label);
        else chipInputKeys.set(key, label);
        endpointKeys.push(key);
        endpointDirs.push(pin.dir);
      } else if (ep.pin != null) {
        const pinStr = String(ep.pin);
        const bpin = boardPinById.get(pinStr);
        if (!bpin) {
          diags.push({ severity: 'error', message: `Wire "${w.id}" board endpoint pin "${ep.pin}" is not a pin on this board (WIRE_UNMAPPED_PIN).` });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        if (bpin.kind !== 'io') {
          diags.push({ severity: 'error', message: `Wire "${w.id}" board endpoint "${ep.pin}" is a ${bpin.kind} pin, not GPIO — it can't be wired to a chip.` });
          endpointKeys.push(null);
          endpointDirs.push(null);
          continue;
        }
        const key = `board:${pinStr}`;
        endpointKeys.push(key);
        endpointDirs.push(null);
      } else {
        diags.push({ severity: 'error', message: `Wire "${w.id}" has an endpoint with no \`comp\` or \`pin\` field (WIRE_BAD_ENDPOINT).` });
        endpointKeys.push(null);
        endpointDirs.push(null);
      }
    }

    // Per-wire fast path: both endpoints are chip outputs.
    if (endpointDirs[0] === 'output' && endpointDirs[1] === 'output') {
      diags.push({ severity: 'error', message: `Wire "${w.id}" connects two output-driver endpoints (WIRE_DRIVER_CONFLICT). At most one driver per net.` });
    }

    if (endpointKeys[0] && endpointKeys[1]) union(endpointKeys[0], endpointKeys[1]);
  }

  // --- Net-level single-driver check (chip outputs only — firmware's own GPIO
  // direction can't be inferred from arbitrary C, so this is scoped to chip-vs-chip
  // conflicts; see the "explicit v1 scope cuts" note in docs). ---
  const netDrivers = new Map(); // root -> ["id.pin", ...]
  for (const [key, label] of chipOutputKeys) {
    const root = find(key);
    if (!netDrivers.has(root)) netDrivers.set(root, []);
    netDrivers.get(root).push(label);
  }
  for (const [, labels] of netDrivers) {
    if (labels.length > 1) {
      diags.push({ severity: 'error', message: `Net has ${labels.length} chip-output drivers: ${labels.join(', ')} (WIRE_DRIVER_CONFLICT). At most one driver per net.` });
    }
  }

  // --- Floating chip input warnings ---
  for (const [compId, info] of compMap) {
    for (const pin of info.pins) {
      if (pin.dir !== 'input') continue;
      const hasWire = wires.some(
        (w) =>
          (w?.a?.comp === compId && w?.a?.pin === pin.name) ||
          (w?.b?.comp === compId && w?.b?.pin === pin.name)
      );
      if (!hasWire) {
        diags.push({
          severity: 'warning',
          message: `Component "${compId}" input pin "${pin.name}" has no wire — trace_read() for it will return 0.`,
          port: compId,
        });
      }
    }
  }

  return diags;
}
