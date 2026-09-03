"use client";

import Image from "next/image";
import { useActionState, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { ACCENTS, type Branding } from "@/lib/domain";
import { updateBrandingAction, type BrandingFormState } from "@/lib/settings/branding-actions";

const EMPTY: BrandingFormState = {};

/**
 * Randevu sayfasının görünüşü.
 *
 * Renk serbest değil, listeden: kurum açık bir ton seçtiğinde üzerindeki
 * beyaz yazı kayboluyor ve bunu fark eden biz değil hastası oluyor. Listedeki
 * tonların hepsi beyaz metinle okunur.
 */
export function BrandingForm({
  branding,
  logoUrl,
  publicHref,
}: {
  branding: Branding;
  logoUrl: string | null;
  publicHref: string;
}) {
  const [state, formAction, pending] = useActionState(updateBrandingAction, EMPTY);
  const [accent, setAccent] = useState(branding.accent);
  const [removeLogo, setRemoveLogo] = useState(false);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}
      {state.ok && <Alert tone="success">Randevu sayfası güncellendi.</Alert>}

      <div className="flex flex-col gap-4 rounded border border-border bg-surface p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">Randevu sayfası</h2>
          <p className="text-[13px] text-ink-2">
            Hastanızın gördüğü tek ekran burası:{" "}
            <a href={publicHref} className="text-accent underline underline-offset-2">
              {publicHref.replace(/^https?:\/\//, "")}
            </a>
          </p>
        </div>

        {/* --- logo --- */}
        <div className="flex flex-wrap items-start gap-4 border-t border-border pt-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-2">
            {logoUrl && !removeLogo ? (
              <Image
                src={logoUrl}
                alt="Kurum logosu"
                width={80}
                height={80}
                className="size-full object-contain"
              />
            ) : (
              <span className="px-2 text-center font-mono text-[10px] uppercase tracking-wide text-ink-3">
                logo yok
              </span>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label htmlFor="logo" className="text-[13px] font-medium text-ink">
              Logo
            </label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-[13px] text-ink-2 file:mr-3 file:rounded file:border file:border-border file:bg-surface-2 file:px-2.5 file:py-1.5 file:text-[13px] file:text-ink hover:file:bg-surface"
            />
            <p className="text-[12px] text-ink-3">
              PNG, JPEG ya da WebP · en fazla 512 KB. Kare ya da yatay bir logo en iyi durur.
            </p>

            {logoUrl && (
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-[13px] text-ink-2">
                <input
                  type="checkbox"
                  name="logo_sil"
                  value="1"
                  checked={removeLogo}
                  onChange={(event) => setRemoveLogo(event.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                Logoyu kaldır
              </label>
            )}
          </div>
        </div>

        {/* --- renk --- */}
        <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
          <legend className="pb-1 text-[13px] font-medium text-ink">Sayfa rengi</legend>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((option) => (
              <label
                key={option.key}
                className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-[13px] transition-colors duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${
                  accent === option.value
                    ? "border-ink-3 bg-surface-2 text-ink"
                    : "border-border bg-surface text-ink-2 hover:border-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="accent"
                  value={option.value}
                  checked={accent === option.value}
                  onChange={() => setAccent(option.value)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="size-4 shrink-0 rounded-sm"
                  style={{ background: option.value }}
                />
                {option.label}
              </label>
            ))}
          </div>
          <p className="text-[12px] text-ink-3">
            Randevu sayfasındaki düğmeler ve seçili saat bu rengi kullanır. Panel etkilenmez.
          </p>
        </fieldset>

        {/* --- fiyat --- */}
        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              name="show_prices"
              defaultChecked={branding.show_prices}
              className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-ink">
                Hizmet ücretleri randevu sayfasında görünsün
              </span>
              <span className="text-[12px] text-ink-2">
                Kapalıyken hasta yalnızca hizmet adını ve süresini görür. Ücreti girilmemiş
                hizmetler her hâlükârda ücretsiz değil, ücretsiz görünmez — hiç yazılmaz.
              </span>
            </span>
          </label>
        </div>

        {/* --- tanıtım --- */}
        <div className="border-t border-border pt-4">
          <Field
            id="about"
            label="Kısa tanıtım"
            hint="Sayfanın başında görünür. Boş bırakılırsa hiç çizilmez."
          >
            <Textarea
              id="about"
              name="about"
              rows={3}
              maxLength={400}
              defaultValue={branding.about}
              placeholder="Bağdat Caddesi'ndeki kliniğimizde hafta içi 09.00-18.00 arası hizmet veriyoruz."
            />
          </Field>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Kaydediliyor…" : "Sayfayı Kaydet"}
          </Button>
          <p aria-live="polite" className="text-[12px] text-ink-3">
            {pending ? "Yükleniyor…" : ""}
          </p>
        </div>
      </div>
    </form>
  );
}
