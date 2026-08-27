"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { ResourceFormState } from "@/lib/team/actions";
import {
  hasExtraRanges,
  RANGES_PER_DAY,
  WEEKDAY_LABELS,
  WEEKDAY_ORDER,
  type DayHours,
} from "@/lib/team/hours";

const EMPTY: ResourceFormState = {};

const KIND_LABELS = [
  { value: "staff", label: "Personel (hekim, usta)" },
  { value: "room", label: "Oda" },
  { value: "device", label: "Cihaz / ünit" },
] as const;

export type ResourceDefaults = {
  id?: string;
  name: string;
  title: string;
  kind: string;
  color: string;
  branchId: string;
  isBookable: boolean;
  isActive: boolean;
  sortOrder: number;
  hours: DayHours[];
};

/**
 * Kaynak formu — yeni ekleme ve düzenleme aynı bileşen.
 *
 * Çalışma saatleri gün başına iki aralık: öğle arası ayrı bir alan değil,
 * iki aralık arasındaki boşluk. Veritabanı da böyle tutuyor, o yüzden
 * kaydederken çeviri ve veri kaybı yok.
 */
export function ResourceForm({
  action,
  defaults,
  branches,
  submitLabel,
  pendingLabel,
  cancelHref,
}: {
  action: (state: ResourceFormState, formData: FormData) => Promise<ResourceFormState>;
  defaults: ResourceDefaults;
  branches: { id: string; name: string }[];
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY);
  const gridRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    const firstField = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (firstField && firstField !== "hours") document.getElementById(firstField)?.focus();
  }, [state]);

  const rangesOf = (weekday: number) =>
    defaults.hours.find((day) => day.weekday === weekday)?.ranges ?? [];

  /** Pazartesiyi diğer açık günlere kopyalar: kurulum sırasında en sık yapılan iş. */
  const copyMonday = () => {
    const body = gridRef.current;
    if (!body) return;
    const value = (weekday: number, index: number, part: "bas" | "bit") =>
      body.querySelector<HTMLInputElement>(`[name="gun_${weekday}_${index}_${part}"]`);

    for (let index = 0; index < RANGES_PER_DAY; index += 1) {
      const start = value(1, index, "bas")?.value ?? "";
      const end = value(1, index, "bit")?.value ?? "";
      for (const weekday of [2, 3, 4, 5]) {
        const startInput = value(weekday, index, "bas");
        const endInput = value(weekday, index, "bit");
        if (startInput) startInput.value = start;
        if (endInput) endInput.value = end;
      }
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="flex flex-col gap-4">
        {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
        {branches.length <= 1 && (
          <input type="hidden" name="branch_id" value={defaults.branchId || branches[0]?.id || ""} />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Ad" required error={state.fieldErrors?.name}>
            <Input
              id="name"
              name="name"
              defaultValue={defaults.name}
              autoComplete="off"
              required
              maxLength={120}
              error={Boolean(state.fieldErrors?.name)}
            />
          </Field>

          <Field id="title" label="Unvan" hint="Dt., Uzm. Dr., Usta — boş bırakılabilir.">
            <Input
              id="title"
              name="title"
              defaultValue={defaults.title}
              autoComplete="off"
              maxLength={40}
            />
          </Field>

          <Field id="kind" label="Tür">
            <Select id="kind" name="kind" defaultValue={defaults.kind}>
              {KIND_LABELS.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            id="color"
            label="Renk"
            hint="Takvim sütununun noktası. Renk tek başına anlam taşımaz."
            error={state.fieldErrors?.color}
          >
            <Input
              id="color"
              name="color"
              type="color"
              defaultValue={defaults.color || "#0E5F6E"}
              className="h-9 px-1"
            />
          </Field>

          {branches.length > 1 && (
            <Field id="branch_id" label="Şube">
              <Select id="branch_id" name="branch_id" defaultValue={defaults.branchId}>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field id="sort_order" label="Sıra" hint="Takvimde küçük olan solda.">
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <input
              id="is_bookable"
              name="is_bookable"
              type="checkbox"
              defaultChecked={defaults.isBookable}
              className="size-4 rounded border-border"
            />
            <label htmlFor="is_bookable" className="text-[13px] text-ink">
              Randevu alınabilir — kapalıysa takvimde görünür ama randevu yazılamaz
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
              Aktif — pasif kaynak takvimde sütun açmaz, geçmiş randevuları durur
            </label>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <legend className="text-[13px] font-medium text-ink">Çalışma saatleri</legend>
            <p className="text-[13px] text-ink-2">
              Boş bırakılan gün kapalıdır. Öğle arası ayrı bir alan değil: günü iki aralığa bölün.
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={copyMonday} className="ml-auto">
              Pazartesiyi Cumaya Kopyala
            </Button>
          </div>

          {state.fieldErrors?.hours && <Alert tone="error">{state.fieldErrors.hours}</Alert>}
          {hasExtraRanges(defaults.hours) && (
            <Alert tone="info">
              Bu kaynağın bazı günlerinde ikiden fazla aralık var. Form iki aralık gösteriyor;
              kaydederseniz fazlası silinir.
            </Alert>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-separate border-spacing-y-1 text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-3">
                  <th scope="col" className="w-28 font-normal">
                    Gün
                  </th>
                  <th scope="col" colSpan={2} className="font-normal">
                    1. aralık
                  </th>
                  <th scope="col" colSpan={2} className="font-normal">
                    2. aralık
                  </th>
                </tr>
              </thead>
              <tbody ref={gridRef}>
                {WEEKDAY_ORDER.map((weekday) => {
                  const ranges = rangesOf(weekday);
                  return (
                    <tr key={weekday}>
                      <th scope="row" className="pr-2 text-left font-normal text-ink">
                        {WEEKDAY_LABELS[weekday]}
                      </th>
                      {Array.from({ length: RANGES_PER_DAY }, (_, index) => (
                        <TimePair
                          key={index}
                          weekday={weekday}
                          index={index}
                          startsAt={ranges[index]?.startsAt ?? ""}
                          endsAt={ranges[index]?.endsAt ?? ""}
                        />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </fieldset>

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

function TimePair({
  weekday,
  index,
  startsAt,
  endsAt,
}: {
  weekday: number;
  index: number;
  startsAt: string;
  endsAt: string;
}) {
  const day = WEEKDAY_LABELS[weekday];
  const ordinal = index + 1;
  return (
    <>
      <td className="pr-1">
        <input
          type="time"
          name={`gun_${weekday}_${index}_bas`}
          defaultValue={startsAt}
          aria-label={`${day} ${ordinal}. aralık başlangıç`}
          className="h-8 w-full rounded border border-border bg-surface px-2 font-mono text-[13px] text-ink"
        />
      </td>
      <td className="pr-3">
        <input
          type="time"
          name={`gun_${weekday}_${index}_bit`}
          defaultValue={endsAt}
          aria-label={`${day} ${ordinal}. aralık bitiş`}
          className="h-8 w-full rounded border border-border bg-surface px-2 font-mono text-[13px] text-ink"
        />
      </td>
    </>
  );
}
