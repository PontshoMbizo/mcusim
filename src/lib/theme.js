// Single source of truth for colors used inside SVG fill/stroke attributes, where
// Tailwind utility classes can't be applied cleanly. Mirrors the @theme tokens in
// src/app/globals.css — keep them in sync.

export const COLORS = {
  base: "#0a0a0a",
  panel: "#1e1e1e",
  elevated: "#262626",
  hover: "#2a2a2a",
  edge: "#3e3e42",

  textPrimary: "#ffffff",
  textSecondary: "#d4d4d4",
  textMuted: "#6b7280",

  accent: "#22c55e",
  danger: "#ef4444",
  info: "#38bdf8",
  focus: "#3b82f6",

  // Pin / signal states
  sigHigh: "#22c55e",
  sigLow: "#3f6212",
  sigX: "#f59e0b",
  sigZ: "#6b7280",

  // Blue Pill board cosmetics
  pcb: "#15366b",
  pcbEdge: "#0e2548",
  silk: "#cdd8ec",
  copper: "#d9a441",
};

// Per-state colors for board pins and waveforms.
export const STATE_COLORS = {
  HIGH: COLORS.sigHigh,
  LOW: COLORS.sigLow,
  X: COLORS.sigX,
  Z: COLORS.sigZ,
};

// Tint pins by which board group they belong to (drives the layer filter).
export const LAYER_COLORS = {
  ALL: COLORS.info,
  IO: "#94a3b8",
  POWER: "#ef4444",
  SWD: "#a855f7",
};
