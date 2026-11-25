"use client";
import React, { useState, useEffect } from "react";
import { Microchip, CircuitBoard, Activity, CircleCheck } from "lucide-react";
import EditorPane from "@/components/EditorPane";
import HardwareViewer from "@/components/hardware/HardwareViewer";
import SignalGeneratorPane from "@/components/SignalGeneratorPane";
import PaneHeader, { TabButton } from "@/components/ui/PaneHeader";
import { SimProvider, useSim } from "@/lib/simState";
import { listenForInit, announceReady } from "@/lib/scopeioBridge";
import { BluePillBoard } from "@/boards/bluepill";

// The suite's shared layout ("refined classic", see ../*-refined-classic.html):
//   brand bar
//   firmware (Run toolbar, editor) | hardware preview (board + external chips)
//   results dock: Waveforms
//   status bar
const DEFAULT_DOCK = 34; // % of the window height

export default function HomeClient() {
  // Set only when embedded under scope.io with a scopeio:init message — drives
  // the starter prefill + the extra Save/Capture/Submit button in EditorPane.
  // Plain standalone use or the /tools iframe (no bridge) leaves this null.
  const [embedMode, setEmbedMode] = useState(null);

  useEffect(() => {
    const unlisten = listenForInit(setEmbedMode);
    announceReady();
    return unlisten;
  }, []);

  return (
    <SimProvider board={BluePillBoard}>
      <Workspace embedMode={embedMode} />
    </SimProvider>
  );
}

function Workspace({ embedMode }) {
  const [fullscreen, setFullscreen] = useState(null); // 'editor' | 'board' | 'dock' | null
  const [dockHeight, setDockHeight] = useState(DEFAULT_DOCK);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const toggleFullscreen = (pane) => setFullscreen((cur) => (cur === pane ? null : pane));

  // Drag the dock's top edge to resize it.
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockHeight;
    setDockCollapsed(false);
    const onMove = (m) => {
      const delta = m.clientY - startY;
      setDockHeight(Math.max(15, Math.min(startH - (delta / window.innerHeight) * 100, 75)));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "default";
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "row-resize";
  };

  const full = "fixed inset-0 z-[100] bg-panel";
  const board = BluePillBoard;

  return (
    <div className="h-screen w-full flex flex-col bg-base text-text-primary overflow-hidden font-sans selection:bg-focus/30">
      {/* Brand bar */}
      <header className="min-h-[37px] flex items-center flex-wrap gap-2 px-2.5 py-[5px] bg-panel border-b border-rule shrink-0">
        <span className="flex items-center gap-[7px] font-semibold text-[13px]">
          <Microchip size={15} className="text-accent" aria-hidden />
          mcusim
        </span>
        <span className="text-[11px] text-text-muted truncate">{board.mcu} · {board.core} · bare-metal C</span>
      </header>

      {/* Main row: firmware | hardware preview */}
      <div className="flex-1 min-h-0 flex max-[760px]:flex-col">
        <section
          aria-label="Firmware"
          className={fullscreen === "editor" ? full : "flex-[1.12] min-w-0 min-h-0 flex flex-col border-r border-edge max-[760px]:border-r-0 max-[760px]:border-b"}
          hidden={fullscreen !== null && fullscreen !== "editor"}
        >
          <EditorPane
            embedMode={embedMode}
            isFullscreen={fullscreen === "editor"}
            onFullscreen={() => toggleFullscreen("editor")}
          />
        </section>

        <section
          aria-label="Hardware preview"
          className={fullscreen === "board" ? `${full} flex flex-col` : "flex-1 min-w-0 min-h-0 flex flex-col bg-elevated"}
          hidden={fullscreen !== null && fullscreen !== "board"}
        >
          <PaneHeader isFullscreen={fullscreen === "board"} onFullscreen={() => toggleFullscreen("board")}>
            <span className="flex items-center gap-1.5 px-1 text-[13px] font-medium">
              <CircuitBoard size={14} className="text-text-muted" aria-hidden />
              Hardware preview
              <span className="text-[11px] font-normal text-text-muted">Blue Pill</span>
            </span>
          </PaneHeader>
          <div className="flex-1 min-h-0 overflow-hidden relative">
            <HardwareViewer board={board} />
          </div>
        </section>
      </div>

      {/* Results dock */}
      <section
        aria-label="Results"
        style={fullscreen === "dock" || dockCollapsed ? undefined : { height: `${dockHeight}%` }}
        className={fullscreen === "dock" ? `${full} flex flex-col` : "shrink-0 min-h-0 flex flex-col bg-panel border-t border-edge relative"}
        hidden={fullscreen !== null && fullscreen !== "dock"}
      >
        {!fullscreen && (
          <div className="absolute -top-[3px] inset-x-0 h-[6px] cursor-row-resize z-10" onMouseDown={handleMouseDown} title="Drag to resize" aria-hidden />
        )}
        <PaneHeader
          isFullscreen={fullscreen === "dock"}
          onFullscreen={() => toggleFullscreen("dock")}
          isCollapsed={dockCollapsed}
          onCollapse={fullscreen ? undefined : () => setDockCollapsed((c) => !c)}
        >
          <TabButton icon={Activity} label="Waveforms" active onClick={() => setDockCollapsed(false)} />
        </PaneHeader>
        {!dockCollapsed && (
          <div className="flex-1 min-h-0 relative">
            <SignalGeneratorPane />
          </div>
        )}
      </section>

      <StatusBar board={board} />
    </div>
  );
}

// Bottom status bar: what the last run produced, plus the board and the engine.
function StatusBar({ board }) {
  const { signals, timeCursor } = useSim();
  const n = signals.length;
  return (
    <footer className="min-h-[26px] flex items-center flex-wrap gap-[7px] px-2.5 py-0.5 bg-base border-t border-edge text-[11px] text-text-muted shrink-0">
      <span className="flex items-center gap-[5px] text-text-primary min-w-0">
        <CircleCheck size={13} className="text-ok shrink-0" aria-hidden />
        <span className="truncate">{n ? `${n} traced signal${n === 1 ? "" : "s"} · cursor #${timeCursor}` : "Ready"}</span>
      </span>
      <span className="ml-auto flex gap-3.5">
        <span className="max-[520px]:hidden">STM32F103 · {board.pins.length} pins</span>
        <span className="text-accent">QEMU</span>
      </span>
    </footer>
  );
}
