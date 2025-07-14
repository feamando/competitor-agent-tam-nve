import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import AuthProvider from "./providers/AuthProvider";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Competitor Research Agent",
  description: "AI-powered competitor research and analysis",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  themeColor: "#067A46",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Polyfill.io automatically detects the user's browser and sends only the polyfills needed */}
        <Script
          src="https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver,ResizeObserver,Object.fromEntries,Array.prototype.flat"
          strategy="beforeInteractive"
        />
      </head>
      <body>
        <AuthProvider>
          <Navigation />
          <main className="min-h-screen" style={{ backgroundColor: '#EFE9DE' }}>
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
