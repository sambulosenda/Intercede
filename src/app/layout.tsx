import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intercede",
  description: "No prayer request forgotten. Prayer request management for church prayer teams.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3d4f8a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
