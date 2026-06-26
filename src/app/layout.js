import "./globals.css";

export const metadata = {
  title: "stmVSimulator — STM32F103 Blue Pill",
  description: "In-browser STM32 Blue Pill simulator: write bare-metal C, run it on QEMU, watch the pins.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
