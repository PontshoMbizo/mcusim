import React from "react";

// Renders the Blue Pill board photo as the SVG backdrop. Pin/component overlays are
// positioned in the same 1774x887 image-pixel coordinate space (see src/data/pins.json).
export default function BoardImage({ width = 1774, height = 887, href = "/images/bluePill.png" }) {
  return <image href={href} x="0" y="0" width={width} height={height} preserveAspectRatio="none" />;
}
