"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { updateTemplateAction, type TemplateFormState } from "@/lib/notifications/actions";
import { KIND_LABELS } from "@/lib/notifications/labels";
import type { TemplateRow } from "@/lib/notifications/queries";
import {
  buildVariables,
  renderTemplate,
  smsSegments,
  TEMPLATE_VARIABLES,
  type NotificationPayload,
} from "@/lib/notifications/render";

const EMPTY: TemplateFormState = {};

/**
 * Şablon düzenleme — önizlemeli.
 *
 * Önizleme gerçek gönderim kodunu kullanıyor (`renderTemplate`), ayrı bir
 * "yaklaşık" gösterim değil: ekranda görülen metin, hastanın alacağı metnin
 * aynısı. Yazım hatası yapılan değişken de burada yakalanıyor — hastaya giden
 * SMS'te `{{musteri_adi}}` görmek en kötü sonuç.
 *
 * SMS parça sayısı da canlı: Türkçe karakter mesajı 70 karakterlik parçalara
 * düşürüyor ve fatura ikiye katlanıyor. Bunu yazarken görmek, ay sonunda
 * görmekten iyi.
 */
export function TemplateForm({
  template,
  example,
  siteUrl,
}: {
  template: TemplateRow;
  example: NotificationPayload;
  siteUrl: string;
}) {
  const [state, formAction, pending] = useActionState(updateTemplateAction, EMPTY);
  const [body, setBody] = useState(template.body);
  const [kind, setKind] = useState(template.kind);

  const preview = useMemo(() => {
    const variables = buildVariables(example, { siteUrl });
    return renderTemplate(body, variables);
  }, [body, example, siteUrl]);

  const sms = useMemo(() => smsSegments(preview.text), [preview.text]);

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="id" value={template.id} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <Field id="name" label="Şablon adı" required error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={template.name}
          autoComplete="off"
          required
          error={Boolean(state.fieldErrors?.name)}
        />
      </Field>

      {template.channel === "email" && (
        <Field id="subject" label="E-posta konusu">
          <Input id="subject" name="subject" defaultValue={template.subject ?? ""} autoComplete="off" />
        </Field>
      )}

      <Field
        id="body"
        label="Mesaj metni"
        hint="Değişkenler iki süslü parantez içinde yazılır."
        required
        error={state.fieldErrors?.body}
      >
        <Textarea
          id="body"
          name="body"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={1600}
          required
        />
      </Field>

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-medium text-ink">Kullanılabilir değişkenler</h2>
        <ul className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((variable) => (
            <li key={variable.key}>
              <button
                type="button"
                onClick={() => setBody((current) => `${current}{{${variable.key}}}`)}
                title={`${variable.label} — örnek: ${variable.example}`}
                className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2 transition-colors duration-150 hover:border-accent hover:text-ink"
              >
                {variable.key}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2 rounded border border-border bg-surface-2 p-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[13px] font-medium text-ink">Önizleme</h2>
          {template.channel === "sms" && (
            <p className="font-mono text-[11px] text-ink-3" data-numeric>
              {preview.text.length} karakter · {sms.segments} SMS
              {sms.encoding === "ucs2" && " · Türkçe karakter (70/parça)"}
            </p>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[13px] text-ink">{preview.text || "—"}</p>
        {preview.missing.length > 0 && (
          <p className="text-[12px] text-st-noshow" role="alert">
            Karşılığı olmayan değişken: {preview.missing.join(", ")} — mesajda boş kalacak.
          </p>
        )}
      </div>

      <Field
        id="kind"
        label="İleti türü"
        hint="Ticari ileti, İYS onayı olmayan hastaya gönderilmez. Bu ayrım hukuki bir alandır."
      >
        <Select
          id="kind"
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as TemplateRow["kind"])}
        >
          <option value="service">{KIND_LABELS.service}</option>
          <option value="commercial">{KIND_LABELS.commercial}</option>
        </Select>
      </Field>

      {kind === "commercial" && (
        <Alert tone="info">
          Ticari iletiler yalnızca açık onay veren hastalara gider ve mesajda ret imkânı
          bulunmalıdır (örneğin “RET yazın”). Onayı olmayan hastalarda mesaj kuyruğa
          “gönderilmedi” olarak düşer.
        </Alert>
      )}

      <label className="flex cursor-pointer items-center gap-2.5 text-[13px]" htmlFor="is_active">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked={template.isActive}
          className="size-4 shrink-0"
        />
        <span className="text-ink">Bu şablon kullanılsın</span>
      </label>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        <Link
          href="/app/bildirimler/sablonlar"
          className="text-[13px] text-ink-2 underline underline-offset-2"
        >
          Vazgeç
        </Link>
      </div>
    </form>
  );
}
