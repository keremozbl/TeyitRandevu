import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "brand";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink border-accent hover:bg-accent-hover hover:border-accent-hover",
  secondary:
    "bg-surface text-ink border-border hover:bg-surface-2 hover:border-border-strong",
  ghost:
    "bg-transparent text-ink-2 border-transparent hover:bg-surface-2 hover:text-ink",
  danger:
    "bg-surface text-st-noshow border-border hover:bg-st-noshow-soft hover:border-st-noshow",
  // Yalnızca pazarlama sitesi: marka yeşili panelde "onaylandı" durumuyla
  // karışmasın diye orada kullanılmıyor (globals.css `--brand`).
  brand:
    "bg-brand text-brand-ink border-brand hover:bg-brand-strong hover:border-brand-strong",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 gap-2",
  // Public randevu sayfası için: parmakla dokunulacak, panel yoğunluğu geçerli değil
  lg: "h-11 px-4 text-[15px] gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      // Dokunmatik cihazda yükseklik CSS ile büyütülüyor (globals.css,
      // `pointer: coarse`): panel masaüstünde yoğun kalsın, parmakla
      // kullanılırken hedef 44px olsun.
      data-control={size}
      className={[
        "inline-flex items-center justify-center rounded border font-medium",
        // transition: all yasak — özellikler tek tek sayılır
        "transition-[background-color,border-color,color] duration-150",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
