"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import type { BranchSummary } from "@/lib/scheduling/queries";

/**
 * Gün ve şube seçimi.
 *
 * Durum URL'de: `?tarih=2026-08-24&sube=<id>` (paylaşılabilir, geri tuşu
 * çalışır). Form `method="get"` — JavaScript kapalıyken de tarih değiştirilir;
 * açıkken seçim yapılır yapılmaz kendiliğinden gönderilir.
 *
 * Klavye: ← → gün değiştirir, `g d` bugüne döner. Resepsiyonistin eli fareye
 * gitmeden çalışabilmeli (Plan Bölüm 9).
 */
export function DayNav({
  date,
  prevHref,
  nextHref,
  todayHref,
  isToday,
  branches,
  branchId,
}: {
  date: string;
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isToday: boolean;
  branches: BranchSummary[];
  branchId: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let awaitingChord = false;
    let chordTimer: ReturnType<typeof setTimeout> | undefined;

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      // Form alanında yazarken ve ızgarayı ok tuşuyla kaydırırken karışmasın
      if (
        target?.isContentEditable ||
        (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) ||
        target?.closest("[data-arrow-scroll]")
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        router.push(prevHref);
      } else if (event.key === "ArrowRight") {
        router.push(nextHref);
      } else if (event.key === "g") {
        awaitingChord = true;
        clearTimeout(chordTimer);
        chordTimer = setTimeout(() => {
          awaitingChord = false;
        }, 1200);
      } else if (event.key === "d" && awaitingChord) {
        awaitingChord = false;
        router.push(todayHref);
      } else {
        awaitingChord = false;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(chordTimer);
    };
  }, [router, prevHref, nextHref, todayHref]);

  const arrow =
    "inline-flex h-7 w-7 items-center justify-center rounded border border-border bg-surface text-ink-2 no-underline transition-colors duration-150 hover:bg-surface-2 hover:text-ink";

  return (
    <form
      ref={formRef}
      method="get"
      action="/app"
      className="flex flex-wrap items-center gap-2"
    >
      <div className="flex items-center gap-1">
        <Link href={prevHref} aria-label="Önceki gün" className={arrow}>
          <span aria-hidden="true">‹</span>
        </Link>
        <Link href={nextHref} aria-label="Sonraki gün" className={arrow}>
          <span aria-hidden="true">›</span>
        </Link>
      </div>

      <div>
        <label htmlFor="tarih" className="sr-only">
          Tarih
        </label>
        <input
          key={date}
          id="tarih"
          name="tarih"
          type="date"
          defaultValue={date}
          autoComplete="off"
          onChange={() => formRef.current?.requestSubmit()}
          className="h-7 rounded border border-border bg-surface px-2 font-mono text-[13px] text-ink"
        />
      </div>

      <Link
        href={todayHref}
        aria-current={isToday ? "date" : undefined}
        className={`inline-flex h-7 items-center rounded border px-2.5 text-[13px] no-underline transition-colors duration-150 ${
          isToday
            ? "border-accent bg-accent-soft text-ink"
            : "border-border bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
        }`}
      >
        Bugün
      </Link>

      {branches.length > 1 && (
        <div>
          <label htmlFor="sube" className="sr-only">
            Şube
          </label>
          <select
            key={branchId ?? "ilk"}
            id="sube"
            name="sube"
            defaultValue={branchId ?? ""}
            onChange={() => formRef.current?.requestSubmit()}
            className="h-7 max-w-[12rem] truncate rounded border border-border bg-surface px-2 text-[13px] text-ink"
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* JavaScript kapalıyken tarihi uygulamanın yolu */}
      <button type="submit" className="sr-only">
        Tarihi Göster
      </button>

      <p className="ml-auto hidden font-mono text-[11px] text-ink-3 lg:block">
        ← → gün · g d bugün
      </p>
    </form>
  );
}
