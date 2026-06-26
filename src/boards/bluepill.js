import PINS from "../data/pins.json";
import COMPONENTS from "../data/components.json";

// Board descriptor for the STM32F103C8 "Blue Pill". Pin ids are GPIO names (PC13, PA5,
// …) so they map 1:1 to the signal names emitted by the firmware trace — no separate
// pin-assignment layer is needed (unlike nikaV's FPGA net mapping).
export const BluePillBoard = {
  id: "stm32-bluepill",
  name: "STM32F103C8 — Blue Pill",
  mcu: "STM32F103C8T6",
  core: "ARM Cortex-M3",
  width: 1100,
  height: 470,
  pins: PINS,
  components: COMPONENTS,
  // On-board LED, handy for the default example.
  led: "PC13",
};
