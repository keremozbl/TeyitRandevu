import type { ComponentProps, ReactNode } from "react";

const CONTROL =
  "w-full rounded border border-border bg-surface px-2.5 text-ink " +
  "placeholder:text-ink-3 transition-[border-color] duration-150 " +
  "hover:border-border-strong disabled:opacity-50";

/**
 * İki ölçek. `md` panel içindir: yoğun ekranda 36px satır.
 *
 * `lg` public sayfa içindir ve yüksekliği kadar YAZI BOYUTU da önemli:
 * iOS, 16px'ten küçük yazılı bir alana odaklanınca sayfayı otomatik
 * yakınlaştırıyor ve hasta formun ortasında kaydırmak zorunda kalıyor.
 * 16px bunu tamamen kapatıyor.
 */
const SIZES = {
  md: "h-9",
  lg: "h-11 text-[16px]",
} as const;

export type ControlSize = keyof typeof SIZES;

/**
 * Etiket + kontrol + hata. Etiket her zaman gerçek bir <label> ve htmlFor ile
 * bağlı — placeholder etiket yerine geçmez.
 */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {required && (
          <span className="ml-1 text-st-noshow" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-xs text-st-noshow" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  className = "",
  error,
  size = "md",
  ...props
}: Omit<ComponentProps<"input">, "size"> & { error?: boolean; size?: ControlSize }) {
  return (
    <input
      data-control={size}
      className={[
        CONTROL,
        SIZES[size],
        error ? "border-st-noshow" : "",
        className,
      ].join(" ")}
      aria-invalid={error || undefined}
      aria-describedby={error && props.id ? `${props.id}-error` : undefined}
      {...props}
    />
  );
}

export function Select({
  className = "",
  size = "md",
  ...props
}: Omit<ComponentProps<"select">, "size"> & { size?: ControlSize }) {
  return (
    // Windows koyu modunda native select'in kendi arka planını almaması için
    // renkler açıkça veriliyor.
    <select
      data-control={size}
      className={[CONTROL, SIZES[size], "appearance-none pr-8", className].join(" ")}
      style={{ backgroundColor: "var(--surface)", color: "var(--ink)" }}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  size = "md",
  ...props
}: ComponentProps<"textarea"> & { size?: ControlSize }) {
  return (
    <textarea
      data-control={size}
      className={[CONTROL, size === "lg" ? "text-[16px]" : "", "py-2", className].join(" ")}
      {...props}
    />
  );
}
