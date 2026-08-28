"use client";

import { useActionState, useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { updateSettingsAction, type SettingsFormState } from "@/lib/settings/actions";
import { describeTimeZone } from "@/lib/settings/timezone";

const EMPTY: SettingsFormState = {};

export type SettingsDefaults = {
  name: string;
  timezone: string;
  minLeadMinutes: number;
  maxAdvanceDays: number;
  cancelWindowMinutes: number;
  holdMinutes: number;
  slotStepMinutes: number;
};

/**
 * Kurum ayarları.
 *
 * Her alanın altındaki açıklama "ne işe yarar" değil "neyi değiştirir"
 * anlatıyor: bu ekrandaki bir sayı yanlış girilirse hata vermez, randevu
 * davranışı sessizce değişir.
 */
export function SettingsForm({
  defaults,
  timeZones,
}: {
  defaults: SettingsDefaults;
  timeZones: string[];
}) {
  const [state, formAction, pending] = useActionState(updateSettingsAction, EMPTY);

  useEffect(() => {
    const firstField = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (firstField) document.getElementById(firstField)?.focus();
  }, [state]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-4">
          <legend className="pb-1.5 text-[13px] font-medium text-ink">Kurum</legend>

          <Field id="name" label="Kurum adı" required error={state.fieldErrors?.name}>
            <Input
              id="name"
              name="name"
              defaultValue={defaults.name}
              autoComplete="organization"
              required
              minLength={2}
              maxLength={160}
              error={Boolean(state.fieldErrors?.name)}
            />
          </Field>

          <Field
            id="timezone"
            label="Zaman dilimi"
            hint="Takvimdeki bütün saatler bu dilimde gösterilir. Şube kendi dilimini ayrıca tutabilir."
            error={state.fieldErrors?.timezone}
          >
            <Select id="timezone" name="timezone" defaultValue={defaults.timezone}>
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {describeTimeZone(zone)}
                </option>
              ))}
            </Select>
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
          <legend className="pb-1.5 text-[13px] font-medium text-ink">Randevu kuralları</legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="slot_step_minutes"
              label="Slot adımı (dk)"
              hint="Izgarada sürüklerken randevunun oturduğu adım."
              error={state.fieldErrors?.slot_step_minutes}
            >
              <Input
                id="slot_step_minutes"
                name="slot_step_minutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={240}
                step={5}
                defaultValue={defaults.slotStepMinutes}
                required
                error={Boolean(state.fieldErrors?.slot_step_minutes)}
              />
            </Field>

            <Field
              id="min_lead_minutes"
              label="En erken (dk)"
              hint="Public sayfada bu kadar sonrasına randevu alınabilir. Panel bu kurala tabi değil."
            >
              <Input
                id="min_lead_minutes"
                name="min_lead_minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={43200}
                step={15}
                defaultValue={defaults.minLeadMinutes}
                required
              />
            </Field>

            <Field
              id="max_advance_days"
              label="En ileri (gün)"
              hint="Public sayfada kaç gün ilerisi açık."
            >
              <Input
                id="max_advance_days"
                name="max_advance_days"
                type="number"
                inputMode="numeric"
                min={1}
                max={365}
                defaultValue={defaults.maxAdvanceDays}
                required
              />
            </Field>

            <Field
              id="cancel_window_minutes"
              label="İptal penceresi (dk)"
              hint="Randevuya bu kadar kala hasta kendi iptal edemez; klinik yine edebilir."
            >
              <Input
                id="cancel_window_minutes"
                name="cancel_window_minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={43200}
                step={15}
                defaultValue={defaults.cancelWindowMinutes}
                required
              />
            </Field>

            <Field
              id="hold_minutes"
              label="Slot tutma (dk)"
              hint="Public sayfada form doldurulurken seçilen saat bu kadar tutulur."
            >
              <Input
                id="hold_minutes"
                name="hold_minutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={60}
                defaultValue={defaults.holdMinutes}
                required
              />
            </Field>
          </div>
        </fieldset>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Kaydediliyor…" : "Ayarları Kaydet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
