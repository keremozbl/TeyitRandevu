"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import type { ServiceFormState } from "@/lib/services/actions";

const EMPTY: ServiceFormState = {};

export type ServiceDefaults = {
  id?: string;
  name: string;
  category: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** Forma yazılmış hâli: "1250,00" ya da boş */
  price: string;
  vatRate: number;
  color: string;
  isOnlineBookable: boolean;
  isActive: boolean;
  sortOrder: number;
  resourceIds: string[];
};

/**
 * Hizmet formu — ekleme ve düzenleme aynı bileşen.
 *
 * Tampon süreler burada duruyor çünkü takvimde yer kaplayan şey işlemin
 * kendisi değil, hazırlığıyla birlikte toplamı. Randevu formundaki süre
 * alanı bu değeri başlangıç olarak alıp gerektiğinde hasta bazında değiştirir.
 */
export function ServiceForm({
  action,
  defaults,
  resources,
  categories,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (state: ServiceFormState, formData: FormData) => Promise<ServiceFormState>;
  defaults: ServiceDefaults;
  resources: { id: string; name: string; title: string | null }[];
  /** Kurumun kullandığı kategoriler — öneri listesi */
  categories: string[];
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);

  useEffect(() => {
    const firstField = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (firstField) document.getElementById(firstField)?.focus();
  }, [state]);

  const selected = new Set(defaults.resourceIds);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="flex flex-col gap-4">
        {defaults.id && <input type="hidden" name="id" value={defaults.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Hizmet adı" required error={state.fieldErrors?.name}>
            <Input
              id="name"
              name="name"
              defaultValue={defaults.name}
              autoComplete="off"
              required
              maxLength={160}
              error={Boolean(state.fieldErrors?.name)}
            />
          </Field>

          <Field id="category" label="Kategori" hint="Cerrahi, Estetik, Ortodonti…">
            <Input
              id="category"
              name="category"
              defaultValue={defaults.category}
              autoComplete="off"
              maxLength={80}
              list="hizmet-kategorileri"
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-[13px] font-medium text-ink">Süre</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              id="duration_min"
              label="İşlem (dk)"
              required
              error={state.fieldErrors?.duration_min}
            >
              <Input
                id="duration_min"
                name="duration_min"
                type="number"
                inputMode="numeric"
                min={5}
                max={1440}
                step={5}
                defaultValue={defaults.durationMin}
                required
                error={Boolean(state.fieldErrors?.duration_min)}
              />
            </Field>

            <Field id="buffer_before_min" label="Hazırlık (dk)" hint="Randevudan önce bloke">
              <Input
                id="buffer_before_min"
                name="buffer_before_min"
                type="number"
                inputMode="numeric"
                min={0}
                max={240}
                step={5}
                defaultValue={defaults.bufferBeforeMin}
              />
            </Field>

            <Field id="buffer_after_min" label="Temizlik (dk)" hint="Randevudan sonra bloke">
              <Input
                id="buffer_after_min"
                name="buffer_after_min"
                type="number"
                inputMode="numeric"
                min={0}
                max={240}
                step={5}
                defaultValue={defaults.bufferAfterMin}
              />
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            id="price"
            label="Fiyat"
            hint="Boş bırakılabilir. 1.250,00"
            error={state.fieldErrors?.price}
          >
            <Input
              id="price"
              name="price"
              inputMode="decimal"
              defaultValue={defaults.price}
              autoComplete="off"
              spellCheck={false}
              maxLength={16}
              error={Boolean(state.fieldErrors?.price)}
            />
          </Field>

          <Field id="vat_rate" label="KDV (%)">
            <Input
              id="vat_rate"
              name="vat_rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step={1}
              defaultValue={defaults.vatRate}
            />
          </Field>

          <Field id="sort_order" label="Sıra" hint="Listede küçük olan üstte.">
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              inputMode="numeric"
              min={0}
              max={9999}
              defaultValue={defaults.sortOrder}
            />
          </Field>
        </div>

        <Field
          id="color"
          label="Renk"
          hint="Boş bırakılırsa hizmet rengi kullanılmaz."
          error={state.fieldErrors?.color}
        >
          <Input
            id="color"
            name="color"
            type="color"
            defaultValue={defaults.color || "#0E5F6E"}
            className="h-9 w-24 px-1"
          />
        </Field>

        <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
          <legend className="pb-1.5 text-[13px] font-medium text-ink">Bu hizmeti kim verebilir</legend>
          <p className="pb-1 text-[13px] text-ink-2">
            Hiçbiri seçilmezse kısıt yok: her kaynak verebilir.
          </p>
          {resources.length === 0 ? (
            <p className="text-[13px] text-ink-3">Aktif kaynak yok.</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {resources.map((resource) => (
                <div key={resource.id} className="flex items-center gap-1.5">
                  <input
                    id={`kaynak_${resource.id}`}
                    name="kaynak"
                    type="checkbox"
                    value={resource.id}
                    defaultChecked={selected.has(resource.id)}
                    className="size-4 rounded border-border"
                  />
                  <label htmlFor={`kaynak_${resource.id}`} className="text-[13px] text-ink">
                    {resource.title ? `${resource.title} ` : ""}
                    {resource.name}
                  </label>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <input
              id="is_online_bookable"
              name="is_online_bookable"
              type="checkbox"
              defaultChecked={defaults.isOnlineBookable}
              className="size-4 rounded border-border"
            />
            <label htmlFor="is_online_bookable" className="text-[13px] text-ink">
              Online randevu sayfasında görünsün
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="is_active"
              name="is_active"
              type="checkbox"
              defaultChecked={defaults.isActive}
              className="size-4 rounded border-border"
            />
            <label htmlFor="is_active" className="text-[13px] text-ink">
              Aktif — pasif hizmet yeni randevuda seçilemez, geçmişte kalır
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? pendingLabel : submitLabel}
          </Button>
          <Link href={cancelHref} className="text-[13px] text-ink-2 underline underline-offset-2">
            Vazgeç
          </Link>
        </div>
      </form>

      {/* Kategori serbest metin; kurumun hâlihazırda kullandıkları öneri olur */}
      <datalist id="hizmet-kategorileri">
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}
