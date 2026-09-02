"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  DEMO_MARKETING_HINT,
  DEMO_MARKETING_LINE,
  DEMO_NOTICE_LINE,
} from "@/lib/legal/site-texts";
import { submitDemoRequestAction, type DemoFormState } from "@/lib/marketing/actions";

const EMPTY: DemoFormState = {};

/**
 * Demo talebi formu.
 *
 * Ticari ileti kutusu ayrı ve önceden işaretli DEĞİL — hasta rıza formundaki
 * kuralın aynısı: önceden işaretli kutu geçerli onay sayılmaz. "Demo
 * istiyorum" demek kampanya maili almayı kabul etmek değildir; talebe dönüş
 * bu onaya bağlı olmadığı için kutunun altında bu da yazıyor.
 */
export function DemoForm({ source }: { source: string }) {
  const [state, formAction, pending] = useActionState(submitDemoRequestAction, EMPTY);

  useEffect(() => {
    const first = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (first) document.getElementById(first)?.focus();
  }, [state]);

  if (state.ok) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-st-confirmed bg-st-confirmed-soft p-5">
        <h2 className="text-[17px] font-semibold text-ink">Talebiniz alındı</h2>
        <p className="text-[15px] leading-relaxed text-ink-2">
          En kısa sürede dönüş yapacağız. Bu arada{" "}
          <Link href="/#urun" className="underline underline-offset-2">
            ürünün ne yaptığına
          </Link>{" "}
          bakabilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="kaynak" value={source} />

      {state.error && !state.fieldErrors && <Alert tone="error">{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ad" label="Ad Soyad" required error={state.fieldErrors?.ad}>
          <Input
            id="ad"
            name="ad"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="Ayşe Yılmaz"
            required
            error={Boolean(state.fieldErrors?.ad)}
          />
        </Field>

        <Field id="kurum" label="Kurum">
          <Input
            id="kurum"
            name="kurum"
            autoComplete="organization"
            placeholder="Örnek Diş Kliniği"
          />
        </Field>

        <Field id="eposta" label="E-posta" required error={state.fieldErrors?.eposta}>
          <Input
            id="eposta"
            name="eposta"
            type="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="ad@klinik.com"
            required
            error={Boolean(state.fieldErrors?.eposta)}
          />
        </Field>

        <Field id="telefon" label="Telefon" hint="İsteğe bağlı — arayarak da dönebiliriz.">
          <Input
            id="telefon"
            name="telefon"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0532 000 00 00"
          />
        </Field>
      </div>

      <Field id="sektor" label="İş kolu">
        <Select id="sektor" name="sektor" defaultValue="dis_klinigi">
          <option value="dis_klinigi">Diş kliniği</option>
          <option value="saglik_diger">Diğer sağlık kuruluşu</option>
          <option value="kisisel_bakim">Kuaför, güzellik, kişisel bakım</option>
          <option value="diger">Diğer</option>
        </Select>
      </Field>

      <Field
        id="mesaj"
        label="Kliniğinizden kısaca bahsedin"
        hint="Kaç hekim çalışıyor, randevuları şu an nasıl tutuyorsunuz — görüşmeyi buna göre hazırlıyoruz."
      >
        <Textarea id="mesaj" name="mesaj" rows={4} maxLength={4000} />
      </Field>

      <div className="flex flex-col gap-2 rounded border border-border bg-surface-2 p-3">
        <p className="text-[13px] text-ink-2">
          {DEMO_NOTICE_LINE}{" "}
          <Link href="/kvkk" className="text-ink underline underline-offset-2">
            Aydınlatma metni
          </Link>
        </p>

        <label className="flex cursor-pointer items-start gap-2.5 pt-1">
          <input
            type="checkbox"
            name="onay_ticari"
            className="mt-[3px] size-4 shrink-0 accent-[var(--brand)]"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] text-ink">{DEMO_MARKETING_LINE}</span>
            <span className="text-[12px] text-ink-3">{DEMO_MARKETING_HINT}</span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="brand" size="lg" disabled={pending}>
          {pending ? "Gönderiliyor…" : "Talebi Gönder"}
        </Button>
        <p aria-live="polite" className="text-[12px] text-ink-3">
          {pending ? "Talebiniz kaydediliyor…" : ""}
        </p>
      </div>
    </form>
  );
}
