import React from "react";
import { COLORS } from "../../lib/theme";

// Self-contained SVG rendering of the Blue Pill PCB (no bitmap needed). Drawn to the
// board's 1100x470 viewBox; the PinOverlay circles sit on top at the header positions
// authored in pins.json. Silkscreen only — pin holes are drawn by PinOverlay.
export default function BoardImage() {
  return (
    <g>
      {/* PCB body */}
      <rect x="60" y="30" width="980" height="410" rx="14"
        fill={COLORS.pcb} stroke={COLORS.pcbEdge} strokeWidth="3" />

      {/* header silkscreen strips (top + bottom) */}
      <rect x="135" y="48" width="820" height="34" rx="4" fill="#0e2548" opacity="0.6" />
      <rect x="135" y="388" width="820" height="34" rx="4" fill="#0e2548" opacity="0.6" />

      {/* USB micro-B at the left short edge */}
      <rect x="26" y="200" width="64" height="74" rx="6" fill="#9aa7b8" stroke="#6b7686" strokeWidth="2" />
      <rect x="34" y="212" width="48" height="50" rx="3" fill="#6b7686" />

      {/* MCU (LQFP48) */}
      <rect x="470" y="175" width="160" height="120" rx="6" fill="#111317" stroke="#2a2d34" strokeWidth="2" />
      <circle cx="486" cy="191" r="5" fill="#2a2d34" />
      <text x="550" y="232" textAnchor="middle" fill="#8b93a1" fontSize="13"
        fontFamily="monospace" fontWeight="bold">STM32F103</text>
      <text x="550" y="250" textAnchor="middle" fill="#6b7280" fontSize="10"
        fontFamily="monospace">C8T6</text>
      {/* lead hints */}
      {Array.from({ length: 12 }).map((_, i) => (
        <React.Fragment key={i}>
          <rect x={478 + i * 12.6} y="168" width="6" height="8" fill="#3a3d44" />
          <rect x={478 + i * 12.6} y="294" width="6" height="8" fill="#3a3d44" />
        </React.Fragment>
      ))}

      {/* 8 MHz HSE + 32.768 kHz LSE crystals */}
      <rect x="640" y="300" width="54" height="26" rx="10" fill="#c0c6d0" stroke="#8b93a1" strokeWidth="2" />
      <text x="667" y="317" textAnchor="middle" fill="#1b1d22" fontSize="9" fontFamily="monospace">8MHz</text>
      <rect x="420" y="300" width="54" height="22" rx="9" fill="#c0c6d0" stroke="#8b93a1" strokeWidth="2" />
      <text x="447" y="315" textAnchor="middle" fill="#1b1d22" fontSize="8" fontFamily="monospace">32k</text>

      {/* on-board LED on PC13 (top row, 2nd pin ~ x=191) */}
      <rect x="300" y="120" width="22" height="22" rx="4" fill="#3a1414" stroke="#7a2a2a" strokeWidth="1.5" />
      <text x="311" y="158" textAnchor="middle" fill={COLORS.silk} fontSize="10" fontFamily="monospace">PC13</text>

      {/* power LED */}
      <rect x="30" y="110" width="18" height="18" rx="4" fill="#142a14" stroke="#2a7a2a" strokeWidth="1.5" />

      {/* reset button */}
      <rect x="90" y="330" width="40" height="30" rx="4" fill="#1b1d22" stroke="#3a3d44" strokeWidth="2" />
      <text x="110" y="378" textAnchor="middle" fill={COLORS.silk} fontSize="9" fontFamily="monospace">RST</text>

      {/* BOOT0 / BOOT1 jumpers */}
      <rect x="120" y="92" width="80" height="22" rx="3" fill="#0e2548" stroke="#2a4a7a" strokeWidth="1.5" />
      <text x="160" y="107" textAnchor="middle" fill={COLORS.silk} fontSize="9" fontFamily="monospace">BOOT0/1</text>

      {/* SWD header label (right short edge) */}
      <rect x="980" y="135" width="40" height="225" rx="6" fill="#0e2548" opacity="0.6" />
      <text x="1000" y="128" textAnchor="middle" fill={COLORS.silk} fontSize="10" fontFamily="monospace">SWD</text>

      {/* board name */}
      <text x="550" y="60" textAnchor="middle" fill={COLORS.silk} fontSize="13"
        fontFamily="monospace" opacity="0.7" letterSpacing="2">BLUE&nbsp;PILL · STM32F103</text>
    </g>
  );
}
