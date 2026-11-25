"use client";
import React, { useState } from "react";
import { Cpu, Activity } from "lucide-react";
import HardwareViewer from "./hardware/HardwareViewer";
import SignalGeneratorPane from "./SignalGeneratorPane";
import PaneHeader, { TabButton } from "./ui/PaneHeader";

export default function SimulationPane({ board, isFullscreen, onFullscreen, isCollapsed, onCollapse }) {
  const [activeTab, setActiveTab] = useState("hardware");

  return (
    <div className="w-full h-full flex flex-col bg-panel border border-edge overflow-hidden font-sans">
      <PaneHeader isFullscreen={isFullscreen} onFullscreen={onFullscreen} isCollapsed={isCollapsed} onCollapse={onCollapse}>
        <TabButton icon={Cpu} label="Board" active={activeTab === "hardware"} onClick={() => setActiveTab("hardware")} />
        <TabButton icon={Activity} label="Waveforms" active={activeTab === "waveforms"} onClick={() => setActiveTab("waveforms")} />
      </PaneHeader>

      <div className="flex-1 min-h-0 relative bg-panel flex flex-col overflow-hidden">
        {activeTab === "hardware" ? (
          <div className="flex-1 overflow-hidden relative">
            <HardwareViewer board={board} />
          </div>
        ) : (
          <div className="flex-1 relative">
            <SignalGeneratorPane />
          </div>
        )}
      </div>
    </div>
  );
}
