import React from "react";
import { COLORS, STATE_COLORS } from "../../lib/theme";

/**
 * Overlay indicator sitting on a board-photo pad. Undriven pins stay invisible (just a
 * hit target) so the photo reads cleanly; driven or hovered pins get a colored ring/disc.
 *
 * Optional wiring-mode props (set by HardwareViewer when ExternalChipLayer is in
 * wiring mode), mirroring nikaVSimulator's PinOverlay:
 *   isWiringTarget       — bool; when true, pin acts as a wire endpoint
 *   onWiringTargetClick  — () => void; commit the in-progress wire to this pin
 */
export default function PinOverlay({ pin, state, isHovered, isHighlighted, onHover, onLeave, isWiringTarget, onWiringTargetClick }) {
  const stateColor = state ? STATE_COLORS[state] : null;
  const R = 13;
  const show = stateColor || isHovered || isHighlighted;

  return (
    <g
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={isWiringTarget && onWiringTargetClick ? (e) => { e.stopPropagation(); onWiringTargetClick(); } : undefined}
      className={isWiringTarget ? "cursor-crosshair" : "cursor-pointer"}
    >
      {/* enlarged transparent hit target */}
      <circle cx={pin.x} cy={pin.y} r={20} fill="transparent" />

      {/* Wiring-mode target ring — shown on all board pins when wiring is active */}
      {isWiringTarget && (
        <circle cx={pin.x} cy={pin.y} r={R - 4} fill={COLORS.info} opacity="0.2">
          <animate attributeName="r" values={`${R - 6};${R - 2};${R - 6}`} dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* shared alt-function highlight ring */}
      {isHighlighted && !stateColor && (
        <circle cx={pin.x} cy={pin.y} r={R} fill={COLORS.accent} opacity="0.3">
          <animate attributeName="r" values={`${R - 4};${R + 2};${R - 4}`} dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* glow on driven-HIGH pins */}
      {state === "HIGH" && (
        <circle cx={pin.x} cy={pin.y} r={R + 6} fill={COLORS.sigHigh} opacity="0.35">
          <animate attributeName="opacity" values="0.35;0.08;0.35" dur="1s" repeatCount="indefinite" />
        </circle>
      )}

      {/* main indicator — only visible when driven or hovered */}
      {show && (
        <circle
          cx={pin.x}
          cy={pin.y}
          r={R}
          fill={stateColor || "transparent"}
          fillOpacity={stateColor ? 0.55 : 0}
          stroke={isHovered ? COLORS.info : stateColor || COLORS.focus}
          strokeWidth="3.5"
        />
      )}
    </g>
  );
}
