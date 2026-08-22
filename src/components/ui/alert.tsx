import type { ReactNode } from "react";

type Tone = "error" | "info" | "success";

const TONES: Record<Tone, string> = {
  error: "border-st-noshow bg-st-noshow-soft text-ink",
  info: "border-border bg-surface-2 text-ink-2",
  success: "border-st-confirmed bg-st-confirmed-soft text-ink",
};

/**
 * Hata mesajı yalnızca sorunu değil çözümü de söyler:
 * "Bu saat dolu — en yakın uygun saat 14:30" gibi.
 */
export function Alert({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded border-l-2 px-3 py-2.5 text-[13px] ${TONES[tone]}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      {children}
    </div>
  );
}
