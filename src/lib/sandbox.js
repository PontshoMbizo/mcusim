// Server-only. Compiles + runs ONE untrusted STM32 firmware inside an ephemeral,
// locked-down container and returns its pin/peripheral trace. Ported from
// nikaVSimulator's sandbox.js — same defense-in-depth posture (container resource caps +
// the runtime's own timeout + a host-side SIGKILL), engine-agnostic via SIM_ENGINE.
//
// Contract with sim/entrypoint.sh: C source in via stdin, TRACE out via stdout, logs via
// stderr, exit code names the failing stage (2 compile, 3 runtime, 4 no-trace).

import { spawn } from "node:child_process";

const ENV = process.env;
const RUNTIME = ENV.SIM_RUNTIME || "podman";
// Engine -> image. "mainline" = qemu-system-arm; "xpack" = qemu-system-gnuarmeclipse.
const ENGINE = ENV.SIM_ENGINE || "mainline";
const IMAGES = {
  mainline: ENV.SIM_IMAGE_MAINLINE || "localhost/stm-sim-mainline:latest",
  xpack: ENV.SIM_IMAGE_XPACK || "localhost/stm-sim-xpack:latest",
};
const PODMAN_URL = ENV.SIM_PODMAN_URL || ""; // remote rootless socket, when app is containerized
const TIMEOUT_S = Number(ENV.SIM_TIMEOUT_S || 15); // wall-clock per run (compile + emulate)
const MAX_TRACE_BYTES = Number(ENV.SIM_MAX_TRACE_BYTES || 8 * 1024 * 1024);
const MEMORY = ENV.SIM_MEMORY || "256m";
const CPUS = ENV.SIM_CPUS || "1";

function imageFor(engine) {
  return IMAGES[engine] || IMAGES.mainline;
}

// Full hardening flag set — rationale per flag lives in docs/simulation-backend.md.
function runArgs(engine) {
  const args = [];
  if (RUNTIME === "podman" && PODMAN_URL) args.push("--remote", "--url", PODMAN_URL);
  args.push(
    "run", "--rm", "-i",
    "--network", "none",
    "--read-only",
    "--tmpfs", "/work:rw,size=64m,nosuid,nodev",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges",
    "--pids-limit", "128",
    "--memory", MEMORY,
    "--memory-swap", MEMORY,
    "--cpus", CPUS,
    "--user", "1000:1000",
    "--workdir", "/work",
    "--env", `SIM_ENGINE=${engine}`
  );
  // Podman self-enforces a max runtime as a BACKSTOP, longer than the host timeout below
  // (the primary stop, so runs are classified `timeout` rather than a generic exit).
  if (RUNTIME === "podman") args.push("--timeout", String(TIMEOUT_S + 5));
  args.push(imageFor(engine));
  return args;
}

function stageFromExit(code) {
  if (code === 2) return "compile";
  if (code === 3 || code === 4) return "runtime";
  return "error";
}

/**
 * @param {string} code  bare-metal C (defines main(); startup/linker are baked in)
 * @param {{engine?: "mainline"|"xpack"}} [opts]
 * @returns {Promise<{ok:boolean, trace?:string, log:string, stage?:string, engine:string}>}
 */
export function runSimulation(code, opts = {}) {
  const engine = opts.engine === "xpack" || opts.engine === "mainline" ? opts.engine : ENGINE;
  return new Promise((resolve) => {
    const child = spawn(RUNTIME, runArgs(engine), { stdio: ["pipe", "pipe", "pipe"] });

    const out = [];
    let outLen = 0;
    const errChunks = [];
    let settled = false;
    let timedOut = false;
    let overflow = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ engine, ...result });
    };

    // Host-side hard stop — the primary timeout, fires before the runtime backstop.
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_S * 1000);

    child.stdout.on("data", (d) => {
      outLen += d.length;
      if (outLen > MAX_TRACE_BYTES) {
        overflow = true;
        child.kill("SIGKILL");
        return;
      }
      out.push(d);
    });
    child.stderr.on("data", (d) => errChunks.push(d));

    child.on("error", (e) => {
      finish({ ok: false, stage: "error", log: `sandbox launch failed: ${e.message}` });
    });

    child.on("close", (code) => {
      const log = Buffer.concat(errChunks).toString("utf8");
      if (overflow) {
        return finish({ ok: false, stage: "output", log: `Trace exceeded ${MAX_TRACE_BYTES} bytes; aborted.` });
      }
      if (timedOut) {
        return finish({ ok: false, stage: "timeout", log: `Run exceeded ${TIMEOUT_S}s and was terminated.\n${log}` });
      }
      if (code === 0) {
        return finish({ ok: true, trace: Buffer.concat(out).toString("utf8"), log });
      }
      finish({ ok: false, stage: stageFromExit(code), log: log || `exited with code ${code}` });
    });

    child.stdin.on("error", () => {}); // ignore EPIPE if the child dies early
    child.stdin.end(code);
  });
}
