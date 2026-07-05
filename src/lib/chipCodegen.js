// Codegen for external chips (chipSchema.js) — mirrors nikaVSimulator's
// generateComponentLayer (src/lib/testbench.js), adapted for C/QEMU instead of
// Verilog/iverilog. See docs/plan for the full design; short version:
//
// A chip is a C file compiled into the SAME firmware ELF. Wiring is a software bus:
// each net (a group of wire-connected endpoints) gets a `static volatile int`, plus
// per-chip-pin inline accessor functions the chip's own `_step()` body calls. Board
// pins hook in via firmware/trace.h's weak __trace_pin_hook/__trace_read_hook — this
// module generates the STRONG override of both, active only when components/wires are
// present. On any `trace_pin()` call, every wired chip's `_step()` runs once (in
// declaration order) — a synchronous, event-driven analogue of Verilog's own
// event-driven simulation, and simple enough to reason about without a real settling
// algorithm (nikaV doesn't rigorously solve combinational ordering either, beyond
// single-driver-conflict validation).
//
// Callers are expected to have already run chipSchema.validateComponents() and to only
// call this on a components/wires set with zero errors — this module does not
// re-validate; it generates best-effort C for whatever it's given.

function netKey(ep) {
  if (!ep) return null;
  if (ep.comp != null) return `comp:${ep.comp}:${ep.pin}`;
  if (ep.pin != null) return `board:${String(ep.pin)}`;
  return null;
}

/** Union-find over wire endpoints -> { find(key), roots: Set<string> } */
function buildNets(wires) {
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    if (parent.get(k) !== k) parent.set(k, find(parent.get(k)));
    return parent.get(k);
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const w of wires || []) {
    const ka = netKey(w?.a);
    const kb = netKey(w?.b);
    if (ka) find(ka);
    if (kb) find(kb);
    if (ka && kb) union(ka, kb);
  }
  return { find, keys: [...parent.keys()] };
}

/**
 * Generate the wiring glue: net variables, per-chip pin accessor functions, and the
 * strong __trace_pin_hook / __trace_read_hook overrides. Returns '' if there are no
 * components at all — callers should skip appending glue entirely in that case so a
 * chip-less run is byte-for-byte what it was before this feature. A component with zero
 * wires still gets glue (its source still compiles and its `_step()` still runs on every
 * trace_pin() call — just with every accessor reading/discarding a constant, since it
 * has nothing wired) rather than being silently dropped.
 *
 * @param {{id:string,name:string,pins:{dir:'input'|'output',name:string}[]}[]} components
 *        Components with their PARSED pins attached (chipSchema.parseChipPins output) —
 *        the route computes this once during validation and passes it through.
 * @param {object[]} wires
 * @returns {string}
 */
export function generateWiringGlue(components, wires) {
  if (!components?.length) return '';
  wires = wires || [];

  const { find } = buildNets(wires);

  // Assign a stable net_<n> variable name per distinct root, in first-seen order.
  const netNameByRoot = new Map();
  let netCounter = 0;
  const netVarFor = (key) => {
    const root = find(key);
    if (!netNameByRoot.has(root)) netNameByRoot.set(root, `net_${++netCounter}`);
    return netNameByRoot.get(root);
  };

  // Board pin names that participate in wiring, each mapped to its net variable.
  const boardNetVar = new Map(); // boardPinId -> net_N
  // Chip pin -> net variable, so we can emit accessor functions.
  const chipPinNetVar = new Map(); // "compId:pinName" -> net_N

  for (const w of wires) {
    for (const ep of [w.a, w.b]) {
      if (!ep) continue;
      const key = netKey(ep);
      if (!key) continue;
      const netVar = netVarFor(key);
      if (ep.comp != null) chipPinNetVar.set(`${ep.comp}:${ep.pin}`, netVar);
      else boardNetVar.set(String(ep.pin), netVar);
    }
  }

  const lines = [];
  lines.push('/* ---- Generated wiring glue (chipCodegen.js) ---- */');

  // Net variables, in declaration order.
  const declaredNets = [...new Set(netNameByRoot.values())];
  for (const nv of declaredNets) {
    lines.push(`static volatile int ${nv} = 0;`);
  }
  lines.push('');

  // Per-chip pin accessors: unwired pins get a harmless constant/no-op body so
  // generated code stays well-formed C even when a pin has no wire (flagged
  // separately as a WIRE_NO_DRIVER-style warning by validateComponents).
  for (const c of components) {
    for (const pin of c.pins || []) {
      const netVar = chipPinNetVar.get(`${c.id}:${pin.name}`);
      const fn = `${c.name}_${pin.name}`;
      if (pin.dir === 'input') {
        lines.push(
          netVar
            ? `static inline int ${fn}(void) { return ${netVar}; }`
            : `static inline int ${fn}(void) { return 0; } /* unwired */`
        );
      } else {
        lines.push(
          netVar
            ? `static inline void ${fn}(int v) { ${netVar} = v; }`
            : `static inline void ${fn}(int v) { (void)v; } /* unwired */`
        );
      }
    }
  }
  lines.push('');

  // __trace_pin_hook: update the matching board net (if any), then step every wired
  // chip once — a simple, deterministic over-approximation that also covers
  // chip-to-chip chains without a real topological sort (see module doc comment).
  lines.push('void __trace_pin_hook(const char *name, unsigned value) {');
  for (const [pinId, netVar] of boardNetVar) {
    lines.push(`  if (streq_(name, "${pinId}")) { ${netVar} = (int)value; }`);
  }
  for (const c of components) {
    lines.push(`  ${c.name}_step();`);
  }
  lines.push('}');
  lines.push('');

  // __trace_read_hook: pure getter, no stepping side effect (reading doesn't drive
  // anything — only trace_pin's write side propagates).
  lines.push('int __trace_read_hook(const char *name) {');
  for (const [pinId, netVar] of boardNetVar) {
    lines.push(`  if (streq_(name, "${pinId}")) { return ${netVar}; }`);
  }
  lines.push('  return 0;');
  lines.push('}');

  return lines.join('\n');
}

/**
 * Assemble the final combined C source sent to the sandbox: firmware + each chip's
 * source + the generated glue, in that order (chip `_step` functions must be fully
 * defined before the glue's hook functions call them; net vars + accessors must
 * precede the chip source that calls them).
 *
 * @param {string} firmwareSource
 * @param {{id:string,name:string,source:string,pins:object[]}[]} components
 * @param {object[]} wires
 * @returns {string}
 */
export function generateCombinedSource(firmwareSource, components = [], wires = []) {
  const glue = generateWiringGlue(components, wires);
  if (!glue) return firmwareSource; // no chips/wires -> byte-for-byte unchanged

  // Split the glue into its two halves so chip sources can sit between them: net vars
  // + accessors first (chips call these), then chip sources, then the hook functions
  // (which call the chips' _step()).
  const hookStart = glue.indexOf('void __trace_pin_hook');
  const accessorsAndNets = glue.slice(0, hookStart).trimEnd();
  const hooks = glue.slice(hookStart);

  const chipSources = components.map((c) => c.source).join('\n\n');

  return [firmwareSource, accessorsAndNets, chipSources, hooks].join('\n\n');
}
