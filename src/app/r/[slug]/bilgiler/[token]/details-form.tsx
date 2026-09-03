"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { confirmBookingAction, type ConfirmState } from "@/lib/booking/actions";
import type { ConsentBox } from "@/lib/legal/consent-texts";

const EMPTY: ConfirmState = {};

/**
 * Bilgiler ve rıza formu.
 *
 * Rıza kutuları TEK TEK duruyor ve hiçbiri önceden işaretli değil: önceden
 * işaretli kutu KVKK'da geçerli rıza sayılmaz. Zorunlu iki kutu ile isteğe
 * bağlı ticari ileti kutusu görsel olarak da ayrılıyor — hasta hangisinin
 * zorunlu olduğunu okumadan da görebilmeli.
 */
export function DetailsForm({
  slug,
  token,
  consents,
  disclosureHref,
}: {
  slug: string;
  token: string;
  consents: ConsentBox[];
  disclosureHref: string;
}) {
  const [state, formAction, pending] = useActionState(confirmBookingAction, EMPTY);

  // Hata dönünce ilk hatalı alana odaklan; hasta formu yukarı aşağı taramasın.
  useEffect(() => {
    const first = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (first) document.getElementById(first)?.focus();
  }, [state]);

  const required = consents.filter((consent) => consent.required);
  const optional = consents.filter((consent) => !consent.required);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="token" value={token} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field id="ad" label="Ad Soyad" required>
        <Input
          size="lg"
          id="ad"
          name="ad"
          autoComplete="name"
          autoCapitalize="words"
          placeholder="Ayşe Yılmaz"
          required
          error={Boolean(state.fieldErrors?.ad)}
        />
      </Field>

      <Field
        id="telefon"
        label="Telefon"
        hint="Randevu teyidi ve hatırlatma bu numaraya gönderilir."
        required
        error={state.fieldErrors?.telefon}
      >
        <Input
          size="lg"
          id="telefon"
          name="telefon"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          spellCheck={false}
          placeholder="0555 123 45 67"
          required
          error={Boolean(state.fieldErrors?.telefon)}
        />
      </Field>

      <Field
        id="eposta"
        label="E-posta"
        hint="İsteğe bağlı."
        error={state.fieldErrors?.eposta}
      >
        <Input
          size="lg"
          id="eposta"
          name="eposta"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="ad@ornek.com"
          error={Boolean(state.fieldErrors?.eposta)}
        />
      </Field>

      <Field id="not" label="Eklemek istediğiniz not" hint="İsteğe bağlı.">
        <Textarea size="lg" id="not" name="not" rows={2} maxLength={1000} />
      </Field>

      <fieldset className="flex flex-col gap-3 border-t border-border pt-4">
        <legend className="sr-only">Kişisel verilerin işlenmesi</legend>

        {state.fieldErrors?.onaylar && (
          <p className="text-xs text-st-noshow" role="alert">
            {state.fieldErrors.onaylar}
          </p>
        )}

        {required.map((consent) => (
          /* Bağlantı etiketin DIŞINDA: içinde olsaydı metni açmak için
             tıklamak kutuyu da işaretlerdi — rıza kazara verilemez. */
          <div key={consent.kind} className="flex flex-col gap-1">
            <label
              className="flex cursor-pointer items-start gap-2.5 text-[13px]"
              htmlFor={consent.field}
            >
              <input
                id={consent.field}
                name={consent.field}
                type="checkbox"
                className="mt-0.5 size-4 shrink-0"
                required
              />
              <span className="min-w-0">
                <span className="block text-ink">{consent.label}</span>
                <span className="mt-0.5 block text-ink-3">{consent.hint}</span>
              </span>
            </label>
            {consent.kind === "kvkk_aydinlatma" && (
              <Link
                href={disclosureHref}
                target="_blank"
                rel="noreferrer"
                className="ml-6.5 self-start text-[13px] text-ink-2 underline underline-offset-2"
              >
                Aydınlatma metnini okuyun
              </Link>
            )}
          </div>
        ))}

        {optional.map((consent) => (
          <label
            key={consent.kind}
            htmlFor={consent.field}
            className="flex cursor-pointer items-start gap-2.5 rounded border border-border bg-surface-2 px-3 py-2.5 text-[13px]"
          >
            <input
              id={consent.field}
              name={consent.field}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-ink">{consent.label}</span>
              <span className="mt-0.5 block text-ink-3">{consent.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? "Gönderiliyor…" : "Randevuyu Oluştur"}
      </Button>
    </form>
  );
}
