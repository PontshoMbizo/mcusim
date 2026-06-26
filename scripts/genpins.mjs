// Generates src/data/pins.json for the Blue Pill photo (src/boards/bluePill.png, 1774x887).
// Pin coordinates are calibrated to the board image; tweak the GEOMETRY block and re-run:
//   node scripts/genpins.mjs   then   node scripts/overlay.mjs   to verify alignment.
import { writeFileSync } from "node:fs";

const FN = {
  PA0:["ADC0","TIM2_CH1"],PA1:["ADC1","TIM2_CH2"],PA2:["ADC2","TIM2_CH3","USART2_TX"],
  PA3:["ADC3","TIM2_CH4","USART2_RX"],PA4:["ADC4","SPI1_NSS"],PA5:["ADC5","SPI1_SCK"],
  PA6:["ADC6","SPI1_MISO","TIM3_CH1"],PA7:["ADC7","SPI1_MOSI","TIM3_CH2"],PA8:["TIM1_CH1","MCO"],
  PA9:["USART1_TX","TIM1_CH2"],PA10:["USART1_RX","TIM1_CH3"],PA11:["USB_DM","CAN_RX"],
  PA12:["USB_DP","CAN_TX"],PA13:["SWDIO"],PA14:["SWCLK"],PA15:["TIM2_CH1","JTDI"],
  PB0:["ADC8","TIM3_CH3"],PB1:["ADC9","TIM3_CH4"],PB3:["SPI1_SCK","JTDO"],PB4:["SPI1_MISO"],
  PB5:["SPI1_MOSI"],PB6:["I2C1_SCL","USART1_TX","TIM4_CH1"],PB7:["I2C1_SDA","USART1_RX","TIM4_CH2"],
  PB8:["I2C1_SCL","TIM4_CH3","CAN_RX"],PB9:["I2C1_SDA","TIM4_CH4","CAN_TX"],PB10:["I2C2_SCL","USART3_TX"],
  PB11:["I2C2_SDA","USART3_RX"],PB12:["SPI2_NSS"],PB13:["SPI2_SCK"],PB14:["SPI2_MISO"],PB15:["SPI2_MOSI"],
  PC13:["LED","TAMPER"],PC14:["OSC32_IN"],PC15:["OSC32_OUT"],
};
// Label order as printed on the board (left->right).
const TOP=["5V","GND","3V3","RESET","PB11","PB10","PB1","PB0","PA7","PA6","PA5","PA4","PA3","PA2","PA1","PA0","PC15","PC14","PC13","VBAT"];
const BOT=["PB12","PB13","PB14","PB15","PA8","PA9","PA10","PA11","PA12","PA15","PB3","PB4","PB5","PB6","PB7","PB8","PB9","5V","GND","3V3"];
const SWD=["GND","SWCLK","SWDIO","3V3"];
const SWDID={SWCLK:"PA14",SWDIO:"PA13"};

// ---- GEOMETRY (image px) ----
const XL=55, XR=1703, YT=262, YB=548;      // top/bottom header: left/right pad x, row y
const SWX=1716, SWY0=295, SWDY=85;          // SWD column x, first y, pitch
// -----------------------------

const N=20, DX=(XR-XL)/(N-1);
const kind=id=>id==="GND"?"gnd":(["VBAT","3V3","5V"].includes(id)?"pwr":(id==="RESET"?"rst":"io"));
const layer=id=>(["GND","VBAT","3V3","5V","RESET"].includes(id)?"POWER":((id==="PA13"||id==="PA14")?"SWD":"IO"));
const seen={}; const uid=id=>{seen[id]=(seen[id]||0)+1;return seen[id]>1?`${id}#${seen[id]}`:id;};
const pins=[];
const row=(arr,y,side)=>arr.forEach((lab,i)=>{const id=uid(lab);pins.push({id,label:lab,name:lab,special:FN[lab]||[],kind:kind(lab),layer:layer(lab),side,x:Math.round(XL+i*DX),y});});
row(TOP,YT,"TOP"); row(BOT,YB,"BOTTOM");
SWD.forEach((lab,i)=>{const gpio=SWDID[lab]||lab;const id=uid(gpio);pins.push({id,label:lab,name:gpio,special:FN[gpio]||[],kind:kind(gpio),layer:"SWD",side:"END",x:SWX,y:Math.round(SWY0+i*SWDY)});});
writeFileSync(new URL("../src/data/pins.json", import.meta.url), JSON.stringify(pins,null,2));
console.log("wrote", pins.length, "pins");
