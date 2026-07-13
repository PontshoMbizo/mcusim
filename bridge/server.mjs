// mcusim bridge server — WebSocket endpoint implementing fulgurlab's bridge-protocol
// v1 (see fulgurlab/docs/bridge-protocol.md). Mirrors fpgasim/bridge/server.mjs
// (deliberate copy; the repos stay standalone); what differs is the create path:
// pins come from the firmware's LOCKSTEP_PINS declaration and the payload is the
// user C + generated SysTick/semihosting glue instead of a Verilog harness.
//
//   node bridge/server.mjs            (port: BRIDGE_PORT, default 3101)

import { WebSocketServer } from "ws";
import { parseLockstepPins, generateLockstepGlue } from "../src/lib/lockstepGlue.js";
import { LockstepSession } from "../src/lib/lockstepSession.js";
import { inputsToHex, hexToOutputs, eventsFromSnapshots } from "../src/lib/lockstepCodec.js";

export const PROTO = 1;
export const BACKEND = "mcusim";
const VERSION = "1.0.0";
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_SESSIONS_PER_CONN = 4;
const DEFAULT_QUANTUM_NS = 1_000_000;

// Engine → sandbox image + modelled core clock (cycles per µs of virtual time).
const ENGINES = {
  mainline: { image: "stm-sim-mainline:latest", cyclesPerUs: 24 },
  xpack: { image: "stm-sim-xpack:latest", cyclesPerUs: 72 },
};

const send = (ws, obj) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
};
const err = (ws, stage, log, session) =>
  send(ws, { type: "error", stage, log, ...(session ? { session } : {}) });

export function handleConnection(ws, makeSession = defaultMakeSession) {
  const sessions = new Map();

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return err(ws, "proto", "not JSON");
    }
    try {
      await handleMessage(ws, msg, sessions, makeSession);
    } catch (e) {
      err(ws, "runtime", String(e?.message || e), msg?.session);
    }
  });

  ws.on("close", () => {
    for (const s of sessions.values()) s.sess.dispose("ws closed");
    sessions.clear();
  });
}

async function handleMessage(ws, msg, sessions, makeSession) {
  switch (msg.type) {
    case "hello": {
      if (msg.proto !== PROTO) return err(ws, "proto", `unsupported proto ${msg.proto}, want ${PROTO}`);
      return send(ws, { type: "welcome", proto: PROTO, backend: BACKEND, version: VERSION });
    }

    case "create": {
      if (typeof msg.source !== "string" || !msg.source.trim())
        return err(ws, "compile", "missing C source");
      if (Buffer.byteLength(msg.source, "utf8") > MAX_SOURCE_BYTES)
        return err(ws, "compile", `source exceeds ${MAX_SOURCE_BYTES} bytes`);
      if (sessions.size >= MAX_SESSIONS_PER_CONN)
        return err(ws, "proto", `session limit (${MAX_SESSIONS_PER_CONN}) reached`);

      const engine = ENGINES[msg.config?.engine ?? "mainline"];
      if (!engine) return err(ws, "compile", `unknown engine ${msg.config?.engine}`);

      const parsed = parseLockstepPins(msg.source);
      if (parsed.error) return err(ws, "compile", parsed.error);

      const quantumNs = clampQuantum(msg.config?.quantum_ns);
      const glue = generateLockstepGlue(parsed.pins, { cyclesPerUs: engine.cyclesPerUs });

      const rec = { pins: parsed.pins, quantumNs, lastOutHex: "0", busy: false };
      const sess = makeSession(msg.source + glue, {
        image: engine.image,
        onEnd: (reason) => {
          if (!rec.closedNotified) {
            rec.closedNotified = true;
            send(ws, { type: "ended", session: rec.id, reason });
          }
        },
      });
      rec.sess = sess;
      rec.id = sess.id;
      sessions.set(sess.id, rec);
      return send(ws, {
        type: "created",
        session: sess.id,
        pins: parsed.pins.map(({ name, dir }) => ({ name, dir })),
        quantum_ns: quantumNs,
      });
    }

    case "step": {
      const rec = sessions.get(msg.session);
      if (!rec) return err(ws, "proto", "unknown session", msg.session);
      if (rec.busy) return err(ws, "proto", "step already in flight", msg.session);
      rec.busy = true;
      try {
        const inHex = inputsToHex(rec.pins, msg.inputs ?? {});
        const r = await rec.sess.step(rec.quantumNs, inHex);
        const events = eventsFromSnapshots(rec.pins, rec.lastOutHex, r.snaps);
        rec.lastOutHex = r.outHex;
        return send(ws, {
          type: "stepped",
          session: msg.session,
          t_ns: r.tNs,
          outputs: hexToOutputs(rec.pins, r.outHex),
          events,
        });
      } catch (e) {
        const reason = String(e?.message || e);
        if (!reason.startsWith("ended:")) {
          err(ws, reason.includes("timeout") ? "timeout" : "runtime",
              `${reason}\n${rec.sess.log().slice(-2000)}`, msg.session);
        }
        sessions.delete(msg.session);
        return;
      } finally {
        rec.busy = false;
      }
    }

    case "reset": {
      const rec = sessions.get(msg.session);
      if (!rec) return err(ws, "proto", "unknown session", msg.session);
      return err(ws, "proto", "reset not supported in v1 — dispose and create", msg.session);
    }

    case "dispose": {
      const rec = sessions.get(msg.session);
      if (!rec) return err(ws, "proto", "unknown session", msg.session);
      rec.closedNotified = true;
      rec.sess.dispose();
      sessions.delete(msg.session);
      return send(ws, { type: "disposed", session: msg.session });
    }

    default:
      return err(ws, "proto", `unknown message type ${String(msg.type)}`);
  }
}

function clampQuantum(q) {
  const v = Number(q ?? DEFAULT_QUANTUM_NS);
  if (!Number.isFinite(v)) return DEFAULT_QUANTUM_NS;
  // SysTick reload is 24-bit: at 72 MHz that caps a quantum at ~233 ms; keep margin.
  return Math.min(Math.max(Math.round(v), 10_000), 100_000_000); // 10 µs .. 100 ms
}

function defaultMakeSession(source, hooks) {
  return new LockstepSession(source, hooks);
}

export function startServer(port = Number(process.env.BRIDGE_PORT || 3101)) {
  const wss = new WebSocketServer({ port });
  wss.on("connection", (ws) => handleConnection(ws));
  console.error(`[mcusim-bridge] listening on :${port} (proto v${PROTO})`);
  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) startServer();
