/**
 * Pazarlama sitesinin ortak parçaları.
 *
 * Panelden ayrı bir ölçek: panel 14px ve sıkı, burası 16-17px ve ferah — sayfa
 * sekiz saat kullanılmıyor, bir kez okunuyor. Marka yeşili yalnızca burada
 * (bkz. globals.css `--brand`).
 */

import { LogoMark } from "@/components/logo-mark";
import { PRODUCT } from "@/lib/marketing/content";

/** Teyit = onay → tik, Randevu → R. İşaret `LogoMark`'ta; burada ad eşlik eder. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-6" />
      <span className="text-[16px] font-semibold tracking-[-0.01em] text-ink" translate="no">
        {PRODUCT.name}
      </span>
    </span>
  );
}

/** Sayfa genişliği: 72rem. Metin sütunları ayrıca `max-w-*` ile daraltılır. */
export function Container({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>;
}

/* Buton sınıfları — üç yerde tekrar etmesin diye tek yerde.
   Yükseklik 44px: dokunma hedefi. */
export const BTN_PRIMARY =
  "inline-flex h-11 items-center justify-center rounded border border-brand bg-brand px-5 text-[15px] font-medium text-brand-ink no-underline transition-colors duration-150 hover:border-brand-strong hover:bg-brand-strong";

export const BTN_SECONDARY =
  "inline-flex h-11 items-center justify-center rounded border border-border-strong bg-surface px-5 text-[15px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-surface-2";

export const BTN_SMALL =
  "inline-flex h-9 items-center justify-center rounded px-3.5 text-[14px] font-medium no-underline transition-colors duration-150";

/** Bölüm üstündeki sıralı etiket: emoji ikon yerine numara ve ince çizgi. */
export function Eyebrow({
  index,
  children,
}: {
  index?: string;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2.5 font-mono text-[12px] uppercase tracking-[0.16em] text-ink-3">
      {index && (
        <span data-numeric className="text-brand">
          {index}
        </span>
      )}
      <span aria-hidden="true" className="h-px w-6 bg-brand-line" />
      {children}
    </p>
  );
}

/* Başlık ölçeği. clamp: mobilde 30px, geniş ekranda 60px — ara adım yok,
   kırılma noktasında zıplamıyor. */
export const H1 =
  "text-pretty text-[clamp(2rem,1.25rem+3vw,3.5rem)] font-semibold leading-[1.06] tracking-[-0.022em]";

export const H2 =
  "text-pretty text-[clamp(1.5rem,1.1rem+1.5vw,2.125rem)] font-semibold leading-[1.14] tracking-[-0.018em]";

export const H3 = "text-[19px] font-semibold leading-snug tracking-[-0.01em] text-ink";

export const LEAD = "text-pretty text-[17px] leading-[1.65] text-ink-2";

export const BODY = "text-[15px] leading-[1.7] text-ink-2";

/**
 * Ürün ekranlarının arkasındaki zemin dokusu: 44px aralıklı ince çizgiler —
 * takvimdeki yarım saatlik slot yüksekliğinin ta kendisi. Degrade leke değil,
 * ürünün kendi ızgarası.
 */
export function GridTexture({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)] bg-[repeating-linear-gradient(to_bottom,var(--brand-line)_0_1px,transparent_1px_44px)] opacity-45 ${className}`}
    />
  );
}
