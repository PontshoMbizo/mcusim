import React from "react";
import { STATE_COLORS } from "../../lib/theme";

const ITEMS = [
  { label: "High (3.3V)", color: STATE_COLORS.HIGH },
  { label: "Low (0V)", color: STATE_COLORS.LOW },
  { label: "Unknown", color: STATE_COLORS.X },
  { label: "Floating", color: STATE_COLORS.Z },
];

// Corner key explaining pin-state colors.
export default function Legend() {
  return (
    <div className="absolute bottom-2.5 right-2.5 z-20 bg-panel border border-edge rounded-suite px-2.5 py-1.5 text-[11px] text-text-muted pointer-events-none">
      <div className="flex flex-wrap items-center gap-x-[9px] gap-y-1">
        <span className="font-medium text-text-primary">Pin state</span>
        {ITEMS.map((it) => (
          <div key={it.label} className="flex items-center gap-1">
            <span className="inline-block w-[7px] h-[7px] rounded-full" style={{ backgroundColor: it.color }} />
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}
