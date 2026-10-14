import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const atkinson = localFont({
  src: "./fonts/atkinson-next.woff2",
  variable: "--font-atkinson",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BLR Detour: skip the jam, not just the signal",
  description:
    "Route options across Bengaluru that avoid chokepoints like Silk Board and Hebbal, with a plain reason for each.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#101a16" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
