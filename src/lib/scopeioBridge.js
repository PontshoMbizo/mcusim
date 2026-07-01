// Thin postMessage bridge so scope.io can drive this app from a cross-origin
// iframe (no direct contentWindow access, unlike the same-origin CircuitJS
// embed). Inert until a well-formed scopeio:init arrives, so running this app
// standalone or under the plain /tools iframe (no bridge) is unaffected.
//
// Protocol: scope.io -> sim on load: { type: "scopeio:init", mode, starterCode,
// engine?, signal? }. sim -> scope.io on the embedded action button:
// { type: "scopeio:result", payload: { code, ok, log, changes, raw } }.

let parentOrigin = null;

export function listenForInit(onInit) {
  function handleMessage(event) {
    const data = event.data;
    if (!data || data.type !== "scopeio:init") return;
    parentOrigin = event.origin;
    onInit({
      mode: data.mode,
      starterCode: data.starterCode,
      engine: data.engine,
      signal: data.signal,
    });
  }
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

export function sendResult(payload) {
  if (!parentOrigin || window.parent === window) return;
  window.parent.postMessage({ type: "scopeio:result", payload }, parentOrigin);
}

// Pulls one named pin's value-change list out of the UI model (simState.js's
// toUiModel() shape — signals keyed by exact GPIO name, e.g. "PC13", numeric
// 0/1 values). Returns [] when the pin isn't found in the trace.
export function extractChanges(model, signalName) {
  if (!model || !signalName) return [];
  const sig = (model.signals || []).find((s) => s.name === signalName);
  if (!sig) return [];
  return sig.changes.map((c) => ({ t: c.t, v: c.v }));
}
