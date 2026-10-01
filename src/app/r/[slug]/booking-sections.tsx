import Link from "next/link";

/**
 * Tek sayfalık randevu akışının ortak parçaları.
 *
 * Sayfanın tamamı bir anda görünüyor; bölümler birbirinin yerini almıyor,
 * yan yana duruyor. Bu yüzden her bölümün durumu gözle ayırt edilebilmeli:
 * sırası, başlığı, yapılmışsa seçilen şey, yapılamıyorsa niçin.
 *
 * Bölüm numarası süs değil. "Önce neyi seçeceğim" sorusunu yazıyla
 * açıklamak yerine sırayı göstermek, teknolojiyle arası iyi olmayan biri
 * için en ucuz yol — numaralar olmadan sayfa düz bir düğme yığını oluyor.
 */

export function Section({
  step,
  title,
  /** Bu bölümde yapılmış seçim; başlığın yanında özet olarak durur. */
  chosen,
  /** Henüz sıra gelmediyse sebebi; bölüm soluk çizilir. */
  waiting,
  id,
  children,
}: {
  step: number;
  title: string;
  chosen?: string | null;
  waiting?: string | null;
  id?: string;
  children?: React.ReactNode;
}) {
  const locked = Boolean(waiting);

  return (
    <section
      id={id}
      aria-labelledby={`${id ?? `adim-${step}`}-baslik`}
      // scroll-margin: tutma sonrası forma çapa ile iniliyor, başlık
      // ekranın en üstüne yapışmasın.
      className="flex scroll-mt-4 flex-col gap-2.5"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2
          id={`${id ?? `adim-${step}`}-baslik`}
          className={`flex items-baseline gap-2 text-[15px] font-semibold ${
            locked ? "text-ink-3" : "text-ink"
          }`}
        >
          <span
            data-numeric
            aria-hidden="true"
            className={`font-mono text-[12px] ${locked ? "text-ink-3" : "text-ink-2"}`}
          >
            {step}.
          </span>
          {title}
        </h2>
        {chosen && (
          <span className="min-w-0 truncate text-[13px] text-ink-2">{chosen}</span>
        )}
      </div>

      {locked ? (
        <p className="rounded border border-dashed border-border px-3 py-2.5 text-[13px] text-ink-3">
          {waiting}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Seçenek düğmesi — gezinme olduğu için `<a>`, eylem değil.
 *
 * Seçili olan yalnızca renkle değil, `aria-current` ile de işaretleniyor:
 * renk körü ya da ekran okuyucu kullanan biri de hangisinin seçili olduğunu
 * bilmeli. Dokunma hedefi 44 piksel — bu sayfa telefondan parmakla
 * kullanılıyor, panelin yoğunluğu burada geçerli değil.
 */
export function Choice({
  href,
  selected,
  label,
  hint,
}: {
  href: string;
  selected: boolean;
  label: string;
  hint?: string | null;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={[
        "flex min-h-11 min-w-0 flex-col justify-center rounded border px-3 py-1.5 no-underline",
        "transition-[background-color,border-color,color] duration-150",
        selected
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface text-ink hover:border-accent hover:bg-accent-soft",
      ].join(" ")}
    >
      <span className="min-w-0 truncate text-[14px] font-medium">{label}</span>
      {hint && (
        <span
          className={`min-w-0 truncate text-[12px] ${
            selected ? "text-accent-ink/80" : "text-ink-2"
          }`}
        >
          {hint}
        </span>
      )}
    </Link>
  );
}
