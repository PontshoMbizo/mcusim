// POST /api/simulate — compile + run untrusted bare-metal C for the STM32F103 in an
// ephemeral sandbox and return the resulting pin trace + parsed board model. Isolation
// lives in src/lib/sandbox.js; trace parsing in src/lib/trace.js. Ported from
// nikaVSimulator's route (Verilog/VCD) to firmware/trace, keeping the same guard rails.

import { runSimulation } from "@/lib/sandbox";
import { parseTrace } from "@/lib/trace";
import { validateComponents, parseChipPins, MAX_COMPONENTS, MAX_WIRES } from "@/lib/chipSchema";
import { generateCombinedSource } from "@/lib/chipCodegen";
import BOARD_PINS from "@/data/pins.json";

const MAX_CODE_BYTES = 200 * 1024; // reject oversized source outright
const MAX_CONCURRENT = Number(process.env.SIM_MAX_CONCURRENT || 4);
const RATE_PER_MIN = Number(process.env.SIM_RATE_PER_MIN || 30);
const ENGINES = new Set(["mainline", "xpack"]);

let inFlight = 0;
const hits = new Map(); // ip -> timestamps within the window

function rateLimited(ip) {
  const now = Date.now();
  const win = now - 60_000;
  const arr = (hits.get(ip) || []).filter((t) => t > win);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_PER_MIN;
}

export async function POST(request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ ok: false, stage: "rate", log: "Too many requests; slow down." }, { status: 429 });
  }
  if (inFlight >= MAX_CONCURRENT) {
    return Response.json({ ok: false, stage: "busy", log: "Simulator busy; try again shortly." }, { status: 429 });
  }

  let code, engine, components, wires;
  try {
    ({ code, engine, components, wires } = await request.json());
  } catch {
    return Response.json({ ok: false, stage: "input", log: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim()) {
    return Response.json({ ok: false, stage: "input", log: "Missing `code`." }, { status: 400 });
  }
  if (engine != null && !ENGINES.has(engine)) {
    return Response.json({ ok: false, stage: "input", log: "`engine` must be 'mainline' or 'xpack'." }, { status: 400 });
  }
  components = components || [];
  wires = wires || [];
  if (!Array.isArray(components) || !Array.isArray(wires)) {
    return Response.json({ ok: false, stage: "input", log: "`components`/`wires` must be arrays." }, { status: 400 });
  }
  if (components.length > MAX_COMPONENTS || wires.length > MAX_WIRES) {
    return Response.json({ ok: false, stage: "input", log: "Too many components/wires." }, { status: 400 });
  }

  let combinedCode = code;
  let diagnostics = [];
  if (components.length || wires.length) {
    diagnostics = validateComponents(components, wires, BOARD_PINS);
    if (diagnostics.some((d) => d.severity === "error")) {
      return Response.json({ ok: false, stage: "validation", log: "Component/wire validation failed.", diagnostics });
    }
    const componentsWithPins = components.map((c) => ({ ...c, pins: parseChipPins(c.source, c.name) }));
    combinedCode = generateCombinedSource(code, componentsWithPins, wires);
  }

  if (Buffer.byteLength(combinedCode, "utf8") > MAX_CODE_BYTES) {
    return Response.json({ ok: false, stage: "input", log: "Source too large." }, { status: 413 });
  }

  inFlight++;
  try {
    const r = await runSimulation(combinedCode, { engine });
    if (!r.ok) {
      return Response.json({ ok: false, stage: r.stage, log: r.log, engine: r.engine, diagnostics });
    }
    const model = parseTrace(r.trace);
    return Response.json({
      ok: true,
      engine: r.engine,
      trace: r.trace,
      model,
      log: r.log,
      complete: model.complete,
      diagnostics,
    });
  } finally {
    inFlight--;
  }
}
