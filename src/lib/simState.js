"use client";
import React, { createContext, useContext, useMemo, useState } from "react";

// Shared simulation state for the Hardware + Waveforms tabs. The backend returns the
// parsed trace model (src/lib/trace.js); clicking "Run" replaces it via setModel().
// Pin ids are GPIO names (PC13, PA5, …) and equal the trace signal names, so no separate
// pin-assignment layer is needed (unlike nikaV's FPGA net mapping).

export const DEFAULT_MODEL = { timeMax: 0, signals: [], last: {} };

// Convert the API trace model { signals:{NAME:{transitions:[{t,v}]}}, events, last } into
// the canonical UI model: an array of bit signals with numeric { t, v } changes.
function toUiModel(input) {
  if (!input || !input.signals) return DEFAULT_MODEL;
  const signals = Object.values(input.signals).map((s) => ({
    id: s.name,
    name: s.name,
    kind: "bit",
    changes: (s.transitions || []).map((tr) => ({ t: tr.t, v: tr.v ? 1 : 0 })),
  }));
  let timeMax = 0;
  for (const s of signals) {
    const last = s.changes[s.changes.length - 1];
    if (last && last.t > timeMax) timeMax = last.t;
  }
  return { timeMax, signals, last: input.last || {} };
}

// Level of a bit signal at event-time t.
function valueAt(sig, t) {
  let v = sig.changes.length ? sig.changes[0].v : 0;
  for (const c of sig.changes) {
    if (c.t <= t) v = c.v;
    else break;
  }
  return v;
}

export function computePinStates(model, t) {
  const states = {};
  for (const sig of model.signals) {
    states[sig.id] = valueAt(sig, t) ? "HIGH" : "LOW";
  }
  return states;
}

const SimContext = createContext(null);

export function SimProvider({ children, board }) {
  const [model, setModelState] = useState(DEFAULT_MODEL);
  const [timeCursor, setTimeCursor] = useState(0);

  // Accepts the API trace model (or null to clear). Returns the UI model so callers can
  // read e.g. signal count immediately.
  const setModel = (input) => {
    const m = toUiModel(input);
    setModelState(m);
    setTimeCursor(m.timeMax); // park the cursor on the final state
    return m;
  };

  const pinStates = useMemo(() => computePinStates(model, timeCursor), [model, timeCursor]);
  const value = useMemo(
    () => ({
      model,
      setModel,
      signals: model.signals,
      timeCursor,
      setTimeCursor,
      pinStates,
      timeMax: model.timeMax,
      board,
    }),
    [model, timeCursor, pinStates, board]
  );
  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim() {
  const ctx = useContext(SimContext);
  if (!ctx) throw new Error("useSim must be used within a SimProvider");
  return ctx;
}
