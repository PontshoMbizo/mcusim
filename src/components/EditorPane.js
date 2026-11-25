"use client";
import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Code2, Play, Loader, RotateCcw, Send, Maximize2, Minimize2, ChevronUp, ChevronDown, CircleCheck, CircleAlert } from "lucide-react";
import { defineSuiteThemes, monoFontFamily, useSuiteMonacoTheme } from "../lib/monacoTheme";
import { useSim } from "../lib/simState";
import { DEFAULT_FIRMWARE } from "../lib/templateDefaults";
import { sendResult, extractChanges } from "../lib/scopeioBridge";

const EMBED_ACTION_LABEL = { export: "Save starter", capture: "Capture golden", solve: "Submit" };

// Editor for bare-metal C firmware. On "Run" the source is POSTed to /api/simulate, the
// selected engine compiles + emulates it, and the returned trace model flows into the
// shared sim state (board pins + waveforms update).
//
// `embedMode` (optional) — set by HomeClient once a scopeio:init message arrives.
// `{ mode: "export"|"capture"|"solve", starterCode, engine?, signal? }`.
export default function EditorPane({ embedMode, isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [code, setCode] = useState(DEFAULT_FIRMWARE);
  const [engine, setEngine] = useState("mainline"); // 'mainline' | 'xpack'
  const { setModel, components, wires } = useSim();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null); // { ok, text }
  const monacoTheme = useSuiteMonacoTheme();

  // Seed the editor from the embed's starter/engine exactly once, the first
  // time a scopeio:init arrives — not on every embedMode reference change, so
  // it doesn't clobber edits if the parent re-renders.
  const seededEmbed = useRef(false);
  useEffect(() => {
    if (!embedMode || seededEmbed.current) return;
    seededEmbed.current = true;
    if (embedMode.starterCode != null) setCode(embedMode.starterCode);
    if (embedMode.engine) setEngine(embedMode.engine);
  }, [embedMode]);

  // Shared by the Run button and the embed action button: builds + emulates
  // the firmware and flows a successful trace into the shared model.
  const runSimulation = async () => {
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, engine, components, wires }),
    });
    const data = await res.json();
    const model = data.ok ? setModel(data.model) : null;
    return { data, model };
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    setStatus(null);
    try {
      const { data, model } = await runSimulation();
      if (data.ok) {
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

  // The embed-mode action button (Save starter / Capture golden / Submit).
  // "export" just hands the current code back to scope.io — no pin is
  // configured yet at that stage, so no run is needed. "capture" and "solve"
  // both run and extract the configured pin's trace, which scope.io grades
  // (capture: stores as golden; solve: grades against it).
  const handleEmbedAction = async () => {
    if (!embedMode || running) return;
    if (embedMode.mode === "export") {
      sendResult({ code, ok: true, log: "", changes: [], raw: "" });
      return;
    }
    setRunning(true);
    setStatus(null);
    try {
      const { data, model } = await runSimulation();
      if (!data.ok) {
        const firstLine = (data.log || "Run failed").split("\n").find(Boolean) || "Run failed";
        setStatus({ ok: false, text: `${data.stage || "error"}: ${firstLine}` });
        sendResult({ code, ok: false, log: data.log || firstLine, changes: [], raw: data.trace || "" });
        return;
      }
      setStatus({ ok: true, text: `Built + ran on ${data.engine} ✓` });
      const changes = extractChanges(model, embedMode.signal);
      sendResult({ code, ok: true, log: "", changes, raw: data.trace });
    } catch (e) {
      setStatus({ ok: false, text: `Request failed: ${e.message}` });
      sendResult({ code, ok: false, log: e.message, changes: [], raw: "" });
    } finally {
      setRunning(false);
    }
  };

  const iconBtn = "inline-flex items-center justify-center min-w-[27px] min-h-[27px] rounded-suite text-text-muted hover:bg-accent-bg hover:text-text-primary transition-colors";

  return (
    <div className="w-full h-full flex flex-col bg-panel overflow-hidden font-sans">
      {/* toolbar: Run first, as across the suite */}
      <div role="toolbar" aria-label="Firmware toolbar" className="min-h-[41px] bg-base border-b border-edge flex items-center flex-wrap gap-[5px] px-[9px] py-[6px] shrink-0">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="inline-flex items-center gap-1.5 min-h-[28px] px-[11px] rounded-suite border border-run bg-run text-white text-[13px] font-medium hover:brightness-110 disabled:opacity-60 transition"
          title="Build + run firmware"
        >
          {running ? <Loader size={13} className="animate-spin" /> : <Play size={13} fill="currentColor" />}
          {running ? "Running" : "Run"}
        </button>
        {embedMode && (
          <button
            type="button"
            onClick={handleEmbedAction}
            disabled={running}
            className="inline-flex items-center gap-1.5 min-h-[28px] px-2.5 rounded-suite border border-accent bg-accent text-on-accent text-[13px] font-medium hover:brightness-110 disabled:opacity-60 transition"
            title={`Send to scope.io (${embedMode.mode})`}
          >
            <Send size={13} />
            {EMBED_ACTION_LABEL[embedMode.mode] || "Send"}
          </button>
        )}
        <span className="w-px h-[18px] bg-edge mx-1" aria-hidden />
        <button type="button" onClick={() => setCode(DEFAULT_FIRMWARE)} className={iconBtn} title="Reset to default" aria-label="Reset to default">
          <RotateCcw size={15} />
        </button>
        <div className="ml-auto flex items-center gap-[7px] text-text-muted text-[13px]">
          <label className="flex items-center gap-[5px]">
            Engine
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="min-h-[28px] border border-edge bg-panel text-text-primary rounded-suite px-1.5 text-[12px] focus:outline-none focus:border-accent"
              title="QEMU backend"
            >
              <option value="mainline">mainline (qemu-system-arm)</option>
              <option value="xpack">xPack (native GPIO)</option>
            </select>
          </label>
          {onFullscreen && (
            <button type="button" onClick={onFullscreen} className={iconBtn} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
          {onCollapse && (
            <button type="button" onClick={onCollapse} className={iconBtn} title={isCollapsed ? "Expand" : "Collapse"} aria-label={isCollapsed ? "Expand" : "Collapse"}>
              {isCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
            </button>
          )}
        </div>
      </div>

      {/* file strip */}
      <div className="flex items-center gap-1 px-[5px] py-1 bg-elevated border-b border-rule shrink-0 text-[12px]">
        <Code2 size={13} className="text-text-muted mx-1" aria-hidden />
        <span className="inline-flex items-center min-h-[25px] px-2 rounded-suite border border-edge bg-panel font-medium">main.c</span>
        <span className="ml-1.5 text-[11px] text-text-muted">Firmware</span>
      </div>

      {/* editor */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          path="main.c"
          defaultLanguage="c"
          theme={monacoTheme}
          beforeMount={defineSuiteThemes}
          value={code}
          onChange={(val) => setCode(val ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: monoFontFamily(),
            lineHeight: 22,
            padding: { top: 10 },
            wordWrap: "on",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            renderLineHighlight: "all",
          }}
        />
      </div>

      {/* status line */}
      <div className="min-h-[26px] bg-base border-t border-edge flex items-center gap-1.5 px-2.5 shrink-0 text-[11px] text-text-muted">
        {status && (status.ok ? <CircleCheck size={13} className="text-ok shrink-0" /> : <CircleAlert size={13} className="text-danger shrink-0" />)}
        <div className={`truncate font-mono ${status ? (status.ok ? "text-text-primary" : "text-danger") : ""}`} title={status?.text || ""}>
          {status ? status.text : "Ready"}
        </div>
        <div className="ml-auto shrink-0 pl-3">STM32F103C8 · Cortex-M3</div>
      </div>
    </div>
  );
}
