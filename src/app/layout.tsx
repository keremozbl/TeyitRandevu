import type { Metadata, Viewport } from "next";
import { Schibsted_Grotesk, Geist_Mono } from "next/font/google";

import { siteUrl } from "@/lib/marketing/site-url";
import { THEME_COLOR, THEME_INIT_SCRIPT } from "@/lib/theme";

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

// Tek etiket: rengi tema anahtarı güncelliyor (bkz. `applyTheme`). Media
// koşullu iki etiket, kullanıcı işletim sisteminin tersini seçtiğinde
// tarayıcı çubuğunu sayfayla ters renkte bırakırdı.
export const viewport: Viewport = {
  themeColor: THEME_COLOR.light,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `data-theme="light"`: varsayılan açık tema. Betik, kayıtlı tercihi ilk
    // boyamadan önce yerine koyar; React bu özniteliği yönetmediği için
    // suppressHydrationWarning gerekiyor.
    <html
      lang="tr"
      data-theme="light"
      suppressHydrationWarning
      className={`${ui.variable} ${data.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
