"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { Alert } from "@/components/ui/alert";
import { startDemoAction } from "@/lib/demo/actions";

import { BTN_PRIMARY, H3 } from "./ui";

/**
 * Canlı demoyu başlatan bölüm.
 *
 * Ayrı `/demo` sayfası kaldırılıp bu bölüm ana sayfaya indirildi. İki şey
 * istemci tarafını zorunlu kılıyor, ikisi de adres çubuğu:
 *
 * 1. Server action hata dönerken adrese `?durum=` yazıyor. Bunu sayfa
 *    bileşeninde `searchParams` ile okumak ANA SAYFAYI dinamiğe çevirirdi —
 *    her ziyaretçi için sunucuda render. Statik kalsın diye istemci okuyor.
 * 2. Sektör çarkı seçimi zaten `?sektor=` olarak adrese yazıyor. Aynı
 *    parametreyi buradaki radyo da okuyunca "bu sektörle demoyu başlat"
 *    bağlantısı sayfa içi bir kancaya (`#demo`) dönüşüyor: tur atmıyor, ama
 *    kullanıcı aşağı indiğinde kendi sektörü seçili duruyor.
 *
 * Adres çubuğu bir dış kaynak: `useSyncExternalStore` ile okunuyor.
 * `useEffect` içinde `setState` zincirleme render üretir ve lint kuralı
 * (react-hooks/set-state-in-effect) buna haklı olarak izin vermiyor. Sunucu
 * anlık görüntüsü `null` döndüğü için ilk HTML her zaman ilk sektörle
 * çiziliyor; hidrasyon uyuşmazlığı olmuyor.
 *
 * Şablon JSON'ları istemci paketine girmesin diye sunucu yalnızca aşağıdaki
 * dar alan kümesini geçiriyor (bkz. `lib/marketing/sectors.ts` aynı gerekçe).
 */

export type DemoSector = {
  key: string;
  label: string;
  familyLabel: string;
  customerPlural: string;
  resourcePlural: string;
  serviceCount: number;
};

const DURUM: Record<string, string> = {
  hata: "Demo başlatılamadı. Birkaç dakika sonra tekrar deneyin.",
  sektor: "Önce bir sektör seçin.",
  yogun: "Bu adresten kısa sürede çok fazla demo açıldı. Biraz sonra tekrar deneyin.",
  kapali: "Canlı demo şu an kapalı.",
};

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  return () => window.removeEventListener("popstate", onChange);
}

function readParams(): string | null {
  const params = new URLSearchParams(window.location.search);
  return `${params.get("durum") ?? ""}|${params.get("sektor") ?? ""}`;
}

export function DemoStart({
  sectors,
  acik,
}: {
  sectors: DemoSector[];
  /** `DEMO_KAPALI` ile kapatıldıysa form yerine bir yönlendirme gösterilir */
  acik: boolean;
}) {
  // Tek bir dize olarak okunuyor: `useSyncExternalStore` her çağrıda aynı
  // referansı döndürmek zorunda, iki alanlı bir nesne sonsuz döngü yapardı.
  const raw = useSyncExternalStore(subscribe, readParams, () => null);
  const [durum, fromUrl] = (raw ?? "|").split("|");

  const [picked, setPicked] = useState<string | null>(null);
  const selected =
    picked ?? (sectors.some((s) => s.key === fromUrl) ? fromUrl : sectors[0]?.key) ?? "";

  const mesaj = durum ? DURUM[durum] : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* aria-live her zaman DOM'da: uyarı sonradan belirdiğinde ekran
          okuyucu onu duyurabilsin. Boşken hiçbir şey çizilmiyor. */}
      <div aria-live="polite">
        {mesaj && (
          <Alert tone={durum === "kapali" ? "info" : "error"}>
            {mesaj}{" "}
            <Link href="#iletisim" className="underline underline-offset-2">
              Bize yazın
            </Link>
            , işletmenizi birlikte kuralım.
          </Alert>
        )}
      </div>

      {acik ? (
        <form action={startDemoAction} className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2.5">
            <legend className={`${H3} pb-2`}>Hangi işi yapıyorsunuz?</legend>

            <div className="grid gap-2 sm:grid-cols-2">
              {sectors.map((sector) => (
                <label
                  key={sector.key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors duration-150 hover:border-border-strong has-[:checked]:border-brand has-[:checked]:bg-brand-tint"
                >
                  <input
                    type="radio"
                    name="sektor"
                    value={sector.key}
                    checked={sector.key === selected}
                    onChange={() => setPicked(sector.key)}
                    className="mt-1 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[15px] font-medium text-ink">{sector.label}</span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                      {sector.familyLabel}
                    </span>
                    <span className="text-[13px] leading-relaxed text-ink-2">
                      {sector.customerPlural} · {sector.resourcePlural} ·{" "}
                      <span data-numeric>{sector.serviceCount}</span> hazır hizmet
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" className={BTN_PRIMARY}>
              Demoyu Başlatın
            </button>
            <p className="text-[13px] text-ink-3">Kurulum iki adım, yaklaşık bir dakika.</p>
          </div>
        </form>
      ) : (
        <Alert tone="info">
          <strong className="font-medium">Canlı demo şu an kapalı.</strong> Bunun yerine
          işletmenizi anlatın, sistemi birlikte gezelim:{" "}
          <Link href="#iletisim" className="underline underline-offset-2">
            demo talebi
          </Link>
          .
        </Alert>
      )}
    </div>
  );
}
