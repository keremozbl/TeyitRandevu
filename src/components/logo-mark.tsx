/**
 * Marka işareti: ✓R monogramı.
 *
 * "Teyit" = onay → bir tik; "Randevu" → R. İkisi tek işarette birleşir.
 * Degrade leke ya da soyut şekil yok; tek renk, `currentColor` üzerinden
 * marka token'ını alır (bkz. globals.css `--brand`), böylece koyu/açık temaya
 * kendiliğinden uyar. Favicon aynı değil: 16 pikselde bu monogram okunmuyor,
 * o yüzden sekme ikonu sade tik olarak kalıyor (bkz. `src/app/icon.svg`).
 *
 * Boyut dışarıdan `className` ile verilir; renk ezilmek istenirse yine
 * `className` ile (ör. `text-brand-ink`).
 */
export function LogoMark({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 46"
      className={`shrink-0 text-brand ${className}`}
      fill="none"
      aria-hidden="true"
    >
      <g
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* üst çubuk */}
        <path d="M4 15H23" />
        {/* tik */}
        <path d="M5 24l10.5 14L36 3" />
        {/* R: gövde + kase + bacak */}
        <path d="M30 17v23" />
        <path d="M30 17h7.5c5 0 5 8 0 8H30" />
        <path d="M31.5 25 41 40" />
      </g>
    </svg>
  );
}
