"use client";
import React, { useState } from "react";
import Editor from "@monaco-editor/react";
import { Code2, Play, Loader, RotateCcw, Cpu } from "lucide-react";
import PaneHeader from "./ui/PaneHeader";
import { useSim } from "../lib/simState";
import { DEFAULT_FIRMWARE } from "../lib/templateDefaults";

// Editor for bare-metal C firmware. On "Run" the source is POSTed to /api/simulate, the
// selected engine compiles + emulates it, and the returned trace model flows into the
// shared sim state (board pins + waveforms update).
export default function EditorPane({ isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [code, setCode] = useState(DEFAULT_FIRMWARE);
  const [engine, setEngine] = useState("mainline"); // 'mainline' | 'xpack'
  const { setModel } = useSim();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setStatus(null);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, engine }),
      });
      const data = await res.json();
      if (data.ok) {
        const model = setModel(data.model);
        const n = model?.signals?.length ?? 0;
        const warn = data.complete ? "" : " (incomplete trace)";
        setStatus({ ok: true, text: `Built + ran on ${data.engine} ✓ ${n} signal${n === 1 ? "" : "s"}${warn}` });
      } else {
        const firstLine = (data.log || "Run failed").split("\n").find(Boolean) || "Run failed";
        setStatus({ ok: false, text: `${data.stage || "error"}: ${firstLine}` });
      }
    } catch (e) {
      setStatus({ ok: false, text: `Request failed: ${e.message}` });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-panel rounded-lg border border-edge overflow-hidden font-sans shadow-xl">
      <PaneHeader isFullscreen={isFullscreen} onFullscreen={onFullscreen} isCollapsed={isCollapsed} onCollapse={onCollapse}>
        <div className="flex items-center gap-2 text-text-secondary font-semibold text-[13px]">
          <Code2 size={16} className="text-accent" />
          Firmware · main.c
        </div>
      </PaneHeader>

      {/* toolbar */}
      <div className="h-10 bg-panel flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2 text-[12px] text-text-muted">
          <Cpu size={14} className="text-accent/70" />
          <label className="flex items-center gap-1.5">
            Engine
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="border border-edge bg-panel text-text-secondary rounded px-2 py-1 text-[12px] focus:outline-none focus:border-focus"
              title="QEMU backend"
            >
              <option value="mainline">mainline (qemu-system-arm)</option>
              <option value="xpack">xPack (native GPIO)</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3 text-text-muted">
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 bg-accent/90 hover:bg-accent text-white px-2.5 py-1 rounded text-[12px] font-medium transition-colors disabled:opacity-60"
            title="Build + run firmware"
          >
            {running ? <Loader size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? "Running" : "Run"}
          </button>
          <button onClick={() => setCode(DEFAULT_FIRMWARE)} className="hover:text-text-primary transition-colors" title="Reset to default">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* editor */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          path="main.c"
          defaultLanguage="c"
          theme="vs-dark"
          value={code}
          onChange={(val) => setCode(val ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            lineHeight: 24,
            padding: { top: 16 },
            wordWrap: "on",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            renderLineHighlight: "all",
          }}
        />
      </div>

      {/* footer */}
      <div className="h-8 bg-panel border-t border-edge/50 flex items-center justify-between px-4 shrink-0 text-[12px] text-text-muted">
        <div className={`truncate font-mono ${status ? (status.ok ? "text-accent" : "text-danger") : ""}`} title={status?.text || ""}>
          {status ? status.text : "Ready"}
        </div>
        <div className="shrink-0 pl-3">STM32F103C8 · Cortex-M3</div>
      </div>
    </div>
  );
}
