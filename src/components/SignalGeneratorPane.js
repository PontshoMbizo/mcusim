"use client";
import React, { useState } from "react";
import { useSim } from "../lib/simState";
import { COLORS } from "../lib/theme";

// Waveform viewer for the firmware pin trace. Time is the event index emitted by the
// trace shim (#0, #1, …); a true microsecond timebase replaces it once SysTick is
// modelled. Reads the shared model + cursor so it stays in sync with the Hardware tab.
export default function SignalGeneratorPane() {
  const { signals, timeCursor, setTimeCursor, timeMax } = useSim();
  const [zoom, setZoom] = useState(1);

  const PX_PER_UNIT = 46;
  const ROW_H = 30;
  const px = (t) => t * PX_PER_UNIT * zoom;
  const canvasW = Math.max(px(timeMax) + 80, 360);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.max(0.4, Math.min(6, z * delta)));
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + e.currentTarget.scrollLeft;
    setTimeCursor(Math.max(0, Math.min(Math.round(x / (PX_PER_UNIT * zoom)), timeMax)));
  };

  const renderWave = (sig) => {
    const pts = [...sig.changes];
    if (!pts.length) return null;
    // extend the last level to the end of the canvas
    pts.push({ t: timeMax, v: pts[pts.length - 1].v });
    const y = (v) => (v ? 4 : ROW_H - 8);
    let d = `M0,${y(pts[0].v)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L${px(pts[i].t)},${y(pts[i - 1].v)} L${px(pts[i].t)},${y(pts[i].v)}`;
    }
    return <path d={d} fill="none" stroke={COLORS.sigHigh} strokeWidth="1.5" />;
  };

  if (!signals.length) {
    return (
      <div className="h-full w-full flex items-center justify-center text-text-muted text-sm">
        Run firmware to capture a pin trace.
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex bg-panel text-text-secondary overflow-hidden font-sans">
      {/* signal list */}
      <div className="w-[170px] h-full flex flex-col border-r border-edge bg-panel shrink-0">
        <div className="h-8 flex items-center px-3 text-[11px] uppercase tracking-wide text-text-muted border-b border-edge">
          Signals
        </div>
        {signals.map((s) => (
          <div key={s.id} className="flex items-center px-3 text-[12px] font-mono text-text-secondary border-b border-edge/40"
            style={{ height: ROW_H }}>
            {s.name}
          </div>
        ))}
      </div>

      {/* waveform canvas */}
      <div className="flex-1 overflow-auto custom-scrollbar" onWheel={handleWheel} onClick={handleSeek}>
        <div style={{ width: canvasW }}>
          <div className="h-8 relative border-b border-edge text-[10px] text-text-muted">
            {Array.from({ length: timeMax + 1 }).map((_, t) => (
              <span key={t} className="absolute top-2 -translate-x-1/2 tabular-nums" style={{ left: px(t) }}>#{t}</span>
            ))}
            {/* cursor */}
            <div className="absolute top-0 bottom-0 w-px bg-info" style={{ left: px(timeCursor) }} />
          </div>
          {signals.map((s) => (
            <svg key={s.id} width={canvasW} height={ROW_H} className="block border-b border-edge/40">
              {renderWave(s)}
              <line x1={px(timeCursor)} y1="0" x2={px(timeCursor)} y2={ROW_H} stroke={COLORS.info} strokeWidth="1" opacity="0.5" />
            </svg>
          ))}
        </div>
      </div>
    </div>
  );
}
