// Parse the semihosting pin trace emitted by firmware into the shared board-state model.
//
// Trace line grammar (see firmware/trace.h):
//     #<seq> <signal> <value>      e.g.  "#3 PC13 1"
//     ##END                        terminates a well-formed trace
// Anything else (QEMU banners, $printf-style logs) is ignored gracefully.
//
// The model is intentionally VCD-shaped so the waveform pane ported from nikaVSimulator
// can consume it unchanged: each signal is a list of { t, v } transitions, where `t` is
// the event sequence index (a true timebase replaces this once SysTick lands).

const LINE = /^#(\d+)\s+(\S+)\s+([01])\s*$/;

/**
 * @param {string} text raw stdout from the sandbox
 * @returns {{
 *   ok: boolean,
 *   complete: boolean,
 *   signals: Record<string, {name:string, transitions:{t:number,v:number}[]}>,
 *   events: {t:number, signal:string, v:number}[],
 *   last: Record<string, number>
 * }}
 */
export function parseTrace(text) {
  const signals = {};
  const events = [];
  const last = {};
  let complete = false;

  for (const raw of String(text).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line === "##END") { complete = true; continue; }
    const m = LINE.exec(line);
    if (!m) continue; // ignore non-trace output
    const t = Number(m[1]);
    const signal = m[2];
    const v = Number(m[3]);
    if (!signals[signal]) signals[signal] = { name: signal, transitions: [] };
    signals[signal].transitions.push({ t, v });
    events.push({ t, signal, v });
    last[signal] = v;
  }

  return { ok: events.length > 0, complete, signals, events, last };
}

/**
 * Collapse a parsed trace into final pin levels for the board overlay.
 * @returns {Record<string, number>} signal -> last known level (0|1)
 */
export function computePinStates(model) {
  return model && model.last ? { ...model.last } : {};
}
