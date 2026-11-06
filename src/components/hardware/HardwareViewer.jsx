"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Cpu } from "lucide-react";

import BoardImage from "./BoardImage";
import ComponentOverlay from "./ComponentOverlay";
import PinOverlay from "./PinOverlay";
import SearchPanel from "./SearchPanel";
import FloatingInspector from "./FloatingInspector";
import Legend from "./Legend";
import ExternalChipLayer from "./ExternalChipLayer";
import WireLayer from "./WireLayer";
import ComponentsPanel from "./ComponentsPanel";

import { useSim } from "../../lib/simState";

export default function HardwareViewer({ board }) {
  const [search, setSearch] = useState("");
  const [hoveredPin, setHoveredPin] = useState(null);
  const [hoveredComponent, setHoveredComponent] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [layer, setLayer] = useState("ALL");

  const { pinStates, components } = useSim();

  // Ref to the SVG element for coordinate conversion in ExternalChipLayer/WireLayer.
  const svgRef = useRef(null);

  // Wiring mode state — lifted from ExternalChipLayer so PinOverlay can show the
  // "wiring target" affordance on board pins while the user is mid-wire.
  const [wiringActive, setWiringActive] = useState(false);
  const wiringCommitRef = useRef(null);

  const [selectedChipId, setSelectedChipId] = useState(null);
  const [editingChipId, setEditingChipId] = useState(null);
  const [componentsPanelOpen, setComponentsPanelOpen] = useState(false);

  const handleEditChip = useCallback((compId) => {
    setEditingChipId(compId);
    setComponentsPanelOpen(true);
  }, []);

  const handleBoardPinClickForWiring = useCallback((pin) => {
    if (wiringCommitRef.current) wiringCommitRef.current(pin);
  }, []);

  const PINS = board?.pins || [];
  const COMPONENTS = board?.components || [];
  const BOARD_WIDTH = board?.width || 1100;
  const BOARD_HEIGHT = board?.height || 470;
  // External chips are placed starting at BOARD_WIDTH + 24 (chipGeometry's
  // nextChipPosition) in the free space beside the board image. Without extra canvas
  // width, the SVG's own viewBox clips at BOARD_WIDTH and a newly-created chip renders
  // completely outside the visible/interactive canvas (a bug found and fixed in
  // fpgasim — applying the fix here from day one instead of rediscovering it).
  const CHIP_WORKSPACE_WIDTH = 280;
  const CANVAS_WIDTH = BOARD_WIDTH + CHIP_WORKSPACE_WIDTH;

  const layers = useMemo(
    () => ["ALL", ...Array.from(new Set(PINS.map((p) => p.layer))).sort()],
    [PINS]
  );

  const filteredPins = useMemo(() => {
    const q = search.toLowerCase();
    return PINS.filter((pin) => {
      const searchMatch =
        search === "" ||
        pin.label.toLowerCase().includes(q) ||
        (pin.special || []).some((s) => s.toLowerCase().includes(q));
      const layerMatch = layer === "ALL" || pin.layer === layer;
      return searchMatch && layerMatch;
    });
  }, [search, layer, PINS]);

  // Hovering a pin highlights other pins that share one of its alternate functions.
  const highlightedNet = hoveredPin ? hoveredPin.special || [] : [];

  return (
    <div className="w-full h-full bg-panel flex flex-col font-sans relative">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "24px 24px" }}
      />

      <div
        className="flex-1 overflow-hidden relative z-10"
        onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
      >
        <SearchPanel
          search={search}
          setSearch={setSearch}
          layer={layer}
          setLayer={setLayer}
          layers={layers}
          count={filteredPins.length}
        />

        <TransformWrapper
          minScale={0.1}
          initialScale={0.2}
          maxScale={8}
          centerOnInit
          smooth={false}
          wheel={{ step: 0.1 }}
          panning={{ excluded: ["chip-drag", "cursor-crosshair", "cursor-move"] }}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
            <svg
              ref={svgRef}
              viewBox={`0 0 ${CANVAS_WIDTH} ${BOARD_HEIGHT}`}
              width={CANVAS_WIDTH}
              height={BOARD_HEIGHT}
              className="drop-shadow-[0_28px_60px_rgba(0,0,0,0.65)]"
            >
              <BoardImage />

              {COMPONENTS.map((component) => (
                <ComponentOverlay
                  key={component.name}
                  component={component}
                  isHovered={hoveredComponent?.name === component.name}
                  onHover={() => setHoveredComponent(component)}
                  onLeave={() => setHoveredComponent(null)}
                />
              ))}

              {filteredPins.map((pin) => {
                const isHighlighted =
                  highlightedNet.length > 0 &&
                  pin.id !== hoveredPin?.id &&
                  (pin.special || []).some((s) => highlightedNet.includes(s));

                return (
                  <PinOverlay
                    key={pin.id}
                    pin={pin}
                    state={pinStates[pin.id]}
                    isHovered={hoveredPin?.id === pin.id}
                    isHighlighted={isHighlighted}
                    onHover={() => setHoveredPin(pin)}
                    onLeave={() => setHoveredPin(null)}
                    isWiringTarget={wiringActive}
                    onWiringTargetClick={wiringActive ? () => handleBoardPinClickForWiring(pin) : null}
                  />
                );
              })}

              {/* External chip wires — rendered below chips, above board overlays */}
              <WireLayer boardPins={PINS} svgRef={svgRef} />

              {/* External chip bodies — topmost SVG layer */}
              <ExternalChipLayer
                svgRef={svgRef}
                onEditChip={handleEditChip}
                onWiringBoardPinRef={wiringCommitRef}
                onWiringStateChange={setWiringActive}
                onSelectionChange={setSelectedChipId}
              />
            </svg>
          </TransformComponent>
        </TransformWrapper>

        <Legend />

        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          <button
            onClick={() => setComponentsPanelOpen((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              componentsPanelOpen ? "bg-accent text-white border-accent" : "bg-panel text-text-secondary border-edge hover:bg-hover"
            }`}
            title="External Components — custom chips wired to the board"
          >
            <Cpu size={13} />
            Components{components.length ? ` (${components.length})` : ""}
          </button>
        </div>

        {componentsPanelOpen && (
          <ComponentsPanel
            board={board}
            focusChipId={editingChipId}
            onClose={() => { setComponentsPanelOpen(false); setEditingChipId(null); }}
          />
        )}
      </div>

      <FloatingInspector
        hoveredPin={hoveredPin}
        hoveredComponent={hoveredComponent}
        pinState={hoveredPin ? pinStates[hoveredPin.id] : undefined}
        mousePos={mousePos}
      />
    </div>
  );
}
