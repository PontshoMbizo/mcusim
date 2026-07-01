"use client";
import React, { useState, useEffect } from "react";
import EditorPane from "@/components/EditorPane";
import SimulationPane from "@/components/SimulationPane";
import { SimProvider } from "@/lib/simState";
import { listenForInit } from "@/lib/scopeioBridge";
import { BluePillBoard } from "@/boards/bluepill";

const DEFAULT_SPLIT = 55;

export default function HomeClient() {
  const [topHeight, setTopHeight] = useState(DEFAULT_SPLIT); // % height of editor
  const [fullscreen, setFullscreen] = useState(null); // 'editor' | 'sim' | null
  // Set only when embedded under scope.io with a scopeio:init message — drives
  // the starter prefill + the extra Save/Capture/Submit button in EditorPane.
  // Plain standalone use or the /tools iframe (no bridge) leaves this null.
  const [embedMode, setEmbedMode] = useState(null);

  useEffect(() => listenForInit(setEmbedMode), []);

  const handleMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = topHeight;
    const onMove = (m) => {
      const delta = m.clientY - startY;
      setTopHeight(Math.max(10, Math.min(startH + (delta / window.innerHeight) * 100, 90)));
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

  const editorCollapsed = topHeight <= 12;
  const simCollapsed = topHeight >= 88;
  const toggleEditorCollapse = () => setTopHeight(editorCollapsed ? DEFAULT_SPLIT : 10);
  const toggleSimCollapse = () => setTopHeight(simCollapsed ? DEFAULT_SPLIT : 90);
  const toggleFullscreen = (pane) => setFullscreen((cur) => (cur === pane ? null : pane));

  return (
    <SimProvider board={BluePillBoard}>
      <div className="h-screen w-full flex flex-col bg-base text-text-primary overflow-hidden font-sans selection:bg-focus/30">
        <div
          style={fullscreen === "editor" ? undefined : { height: `${topHeight}%` }}
          className={`w-full p-2 pb-1 flex flex-col min-h-0 ${fullscreen === "editor" ? "fixed inset-0 z-[100] p-3 bg-base" : ""}`}
          hidden={fullscreen === "sim"}
        >
          <EditorPane
            embedMode={embedMode}
            isFullscreen={fullscreen === "editor"}
            onFullscreen={() => toggleFullscreen("editor")}
            isCollapsed={editorCollapsed}
            onCollapse={toggleEditorCollapse}
          />
        </div>

        {!fullscreen && (
          <div className="h-2 w-full flex items-center justify-center cursor-row-resize shrink-0 group z-50 relative" onMouseDown={handleMouseDown}>
            <div className="absolute inset-y-[-4px] inset-x-0" />
            <div className="w-12 h-1 bg-edge rounded-full group-hover:bg-text-muted transition-colors" />
          </div>
        )}

        <div
          style={fullscreen === "sim" ? undefined : { height: `${100 - topHeight}%` }}
          className={`w-full p-2 pt-1 flex flex-col min-h-0 ${fullscreen === "sim" ? "fixed inset-0 z-[100] p-3 bg-base" : ""}`}
          hidden={fullscreen === "editor"}
        >
          <SimulationPane
            board={BluePillBoard}
            isFullscreen={fullscreen === "sim"}
            onFullscreen={() => toggleFullscreen("sim")}
            isCollapsed={simCollapsed}
            onCollapse={toggleSimCollapse}
          />
        </div>
      </div>
    </SimProvider>
  );
}
