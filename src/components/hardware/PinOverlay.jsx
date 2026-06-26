import React from "react";
import { COLORS, STATE_COLORS, LAYER_COLORS } from "../../lib/theme";

// One header pin: a pad circle tinted by its simulated level, plus a small rotated
// label (GPIO name). Driven pins glow; the on-board LED (PC13) gets an extra ring.
export default function PinOverlay({ pin, state, isHovered, isHighlighted, onHover, onLeave }) {
  const stateColor = state ? STATE_COLORS[state] : null;
  const fill = isHovered ? COLORS.info : stateColor || COLORS.copper;
  const stroke = stateColor || COLORS.pcbEdge;

  // Label sits above TOP-row pins, below BOTTOM-row pins, right of END pins.
  const isEnd = pin.side === "END";
  const labelY = isEnd ? pin.y + 4 : pin.side === "TOP" ? pin.y - 14 : pin.y + 20;
  const labelX = isEnd ? pin.x + 16 : pin.x;
  const anchor = isEnd ? "start" : "middle";
  const layerTint = LAYER_COLORS[pin.layer] || COLORS.textMuted;

  return (
    <g onMouseEnter={onHover} onMouseLeave={onLeave} className="cursor-pointer">
      {/* enlarged transparent hit target */}
      <circle cx={pin.x} cy={pin.y} r={16} fill="transparent" />

      {/* net highlight ring (shared alt-function hover) */}
      {isHighlighted && (
        <circle cx={pin.x} cy={pin.y} r={11} fill={COLORS.accent} opacity="0.25">
          <animate attributeName="r" values="7;11;7" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* glow on driven-HIGH pins */}
      {state === "HIGH" && (
        <circle cx={pin.x} cy={pin.y} r={9} fill={COLORS.sigHigh} opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.05;0.35" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* pad */}
      <circle cx={pin.x} cy={pin.y} r="6" fill={fill} stroke={stroke} strokeWidth="1.5" />

      {/* label */}
      <text
        x={labelX}
        y={labelY}
        textAnchor={anchor}
        fontSize="9"
        fontFamily="monospace"
        fill={isHovered ? COLORS.info : layerTint}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {pin.label}
      </text>
    </g>
  );
}
