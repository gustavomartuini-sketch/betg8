import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";

export const metadata: Metadata = {
  title: "Betg8 — Prediction Markets for India | Powered by Polymarket",
  description: "Trade on IPL, cricket, Indian politics & global events. Powered by Polymarket. Prices in INR.",
  keywords: ["prediction market", "IPL 2025", "cricket prediction", "Polymarket India", "betg8"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#020817" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
