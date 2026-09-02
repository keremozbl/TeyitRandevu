import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Geist_Mono } from "next/font/google";

import { siteUrl } from "@/lib/marketing/site-url";

import "./globals.css";

// latin-ext olmadan ğ ş ı İ ç ö ü eksik kalır — Türkçe için zorunlu.
const ui = Schibsted_Grotesk({
  variable: "--font-ui",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Saat, fiyat, TCKN gibi sayısal alanlar için
const data = Geist_Mono({
  variable: "--font-data",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  // Paylaşım kartındaki ve sitemap'teki adres aynı yerden gelir (site-url.ts).
  metadataBase: new URL(siteUrl()),
  title: {
    default: "TeyitRandevu",
    template: "%s · TeyitRandevu",
  },
  description:
    "Klinik ve işletmeler için randevu, hasta takibi ve otomatik hatırlatma sistemi.",
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "TeyitRandevu",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F7F5" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1416" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="tr"
      className={`${ui.variable} ${data.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
