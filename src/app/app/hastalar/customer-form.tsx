"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { CustomerFormState } from "@/lib/customers/actions";
import { formatFieldValue, type FieldDefinition } from "@/lib/customers/fields";

const EMPTY: CustomerFormState = {};

export type CustomerDefaults = {
  id?: string;
  fullName: string;
  phone: string;
  email: string;
  birthDate: string;
  notes: string;
  tags: string[];
  customData: Record<string, unknown>;
};

/**
 * Hasta kaydı formu — yeni kayıt ve düzenleme aynı bileşen.
 *
 * Esnek alanlar (`field_definitions`) kurumun verisi: diş kliniğinde TCKN ve
 * kan grubu çıkar, berberde hiçbiri. Tıbbi işaretli alanlar buraya yalnızca
 * yetkisi olan kullanıcı için gönderilir; gizli alanların değerleri kaydederken
 * korunur, silinmez.
 */
export function CustomerForm({
  action,
  defaults,
  fields,
  branches,
  branchId,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (state: CustomerFormState, formData: FormData) => Promise<CustomerFormState>;
  defaults: CustomerDefaults;
  fields: FieldDefinition[];
  /** Zincirde şube seçilir; tek şubeli kurumda kavram arayüzde hiç görünmez */
  branches: { id: string; name: string }[];
  branchId: string | null;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  // Hata dönünce ilk hatalı alana odaklan: kullanıcı formu taramak zorunda
  // kalmasın (Web Interface Guidelines).
  useEffect(() => {
    const firstField = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (firstField) document.getElementById(firstField)?.focus();
  }, [state]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="flex flex-col gap-4">
        {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
        {branches.length <= 1 && branchId && (
          <input type="hidden" name="branch_id" value={branchId} />
        )}

        {branches.length > 1 && (
          <Field id="branch_id" label="Şube" hint="Şube kapsamlı yetkiler bu seçime bakar.">
            <Select id="branch_id" name="branch_id" defaultValue={branchId ?? ""}>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field id="full_name" label="Ad soyad" required error={state.fieldErrors?.full_name}>
          <Input
            id="full_name"
            name="full_name"
            defaultValue={defaults.fullName}
            autoComplete="name"
            required
            minLength={2}
            maxLength={160}
            error={Boolean(state.fieldErrors?.full_name)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="phone"
            label="Telefon"
            hint="0555 123 45 67 — nasıl yazarsanız yazın, aynı biçime çevrilir."
            error={state.fieldErrors?.phone}
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              defaultValue={defaults.phone}
              autoComplete="tel"
              spellCheck={false}
              maxLength={32}
              error={Boolean(state.fieldErrors?.phone)}
            />
          </Field>

          <Field id="email" label="E-posta" error={state.fieldErrors?.email}>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              defaultValue={defaults.email}
              autoComplete="email"
              spellCheck={false}
              maxLength={160}
              error={Boolean(state.fieldErrors?.email)}
            />
          </Field>

          <Field id="birth_date" label="Doğum tarihi" error={state.fieldErrors?.birth_date}>
            <Input
              id="birth_date"
              name="birth_date"
              type="date"
              defaultValue={defaults.birthDate}
              autoComplete="off"
              error={Boolean(state.fieldErrors?.birth_date)}
            />
          </Field>

          <Field id="tags" label="Etiketler" hint="Virgülle ayırın: implant, sigortalı">
            <Input
              id="tags"
              name="tags"
              defaultValue={defaults.tags.join(", ")}
              autoComplete="off"
              maxLength={400}
            />
          </Field>
        </div>

        {fields.length > 0 && (
          <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
            <legend className="sr-only">Kuruma özel alanlar</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <CustomField key={field.key} field={field} value={defaults.customData[field.key]} />
              ))}
            </div>
          </fieldset>
        )}

        <Field
          id="notes"
          label="İdari not"
          hint="Tedavi notu değil. Tıbbi notlar kartta ayrı bölümde ve ayrı izinde."
        >
          <Textarea id="notes" name="notes" rows={3} defaultValue={defaults.notes} maxLength={4000} />
        </Field>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
          <Link href={cancelHref} className="text-[13px] text-ink-2 underline underline-offset-2">
            Vazgeç
          </Link>
        </div>
      </form>
    </div>
  );
}

/** Tek bir esnek alan. Adı `alan_<key>` — sunucu tanımlı anahtarları buradan okur. */
function CustomField({ field, value }: { field: FieldDefinition; value: unknown }) {
  const name = `alan_${field.key}`;
  const id = `alan_${field.key}`;
  const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);

  if (field.kind === "boolean") {
    return (
      <div className="flex items-center gap-2 self-end pb-1.5">
        <input
          id={id}
          name={name}
          type="checkbox"
          defaultChecked={value === true}
          className="size-4 rounded border-border"
        />
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
          {field.label}
        </label>
      </div>
    );
  }

  if (field.kind === "multiselect") {
    const selected = new Set(Array.isArray(value) ? value.map(String) : []);
    return (
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[13px] font-medium text-ink">{field.label}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {field.options.map((option) => (
            <div key={option.value} className="flex items-center gap-1.5">
              <input
                id={`${id}_${option.value}`}
                name={name}
                type="checkbox"
                value={option.value}
                defaultChecked={selected.has(option.value)}
                className="size-4 rounded border-border"
              />
              <label htmlFor={`${id}_${option.value}`} className="text-[13px] text-ink-2">
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.kind === "select") {
    return (
      <Field id={id} label={field.label} required={field.isRequired}>
        <Select id={id} name={name} defaultValue={text}>
          <option value="">Seçilmedi</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (field.kind === "textarea") {
    return (
      <div className="sm:col-span-2">
        <Field id={id} label={field.label} required={field.isRequired}>
          <Textarea id={id} name={name} rows={2} defaultValue={text} maxLength={2000} />
        </Field>
      </div>
    );
  }

  return (
    <Field
      id={id}
      label={field.label}
      required={field.isRequired}
      hint={field.kind === "date" && text ? (formatFieldValue(field, text) ?? undefined) : undefined}
    >
      <Input
        id={id}
        name={name}
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : field.kind === "phone" ? "tel" : "text"}
        inputMode={field.kind === "number" ? "numeric" : field.kind === "phone" ? "tel" : undefined}
        defaultValue={text}
        autoComplete="off"
        spellCheck={false}
        maxLength={field.kind === "number" || field.kind === "date" ? undefined : 200}
      />
    </Field>
  );
}
