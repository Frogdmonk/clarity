import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Providers } from "@/components/providers";
import { RegisterSW } from "@/components/shell/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Clarity", template: "%s · Clarity" },
  description: "Ask without the awkwardness. Real-time classroom clarity.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};
export const viewport: Viewport = { themeColor: "#2f5d50", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection(); // dynamic rendering so the per-request CSP nonce reaches Next's scripts
  return (
    <html lang="en">
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <RegisterSW />
      </body>
    </html>
  );
}
