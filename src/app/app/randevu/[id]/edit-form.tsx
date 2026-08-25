"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { AppointmentFormState } from "@/lib/appointments/actions";
import { updateAppointmentAction } from "@/lib/appointments/edit-actions";
import type { AppointmentDetail, BookingContext } from "@/lib/scheduling/queries";

const EMPTY: AppointmentFormState = {};

export function AppointmentEditForm({
  appointment,
  context,
  backHref,
}: {
  appointment: AppointmentDetail;
  context: BookingContext;
  backHref: string;
}) {
  const [state, formAction, pending] = useActionState(updateAppointmentAction, EMPTY);
  const [serviceId, setServiceId] = useState(appointment.serviceId ?? "");
  const [duration, setDuration] = useState(appointment.durationMin);

  useEffect(() => {
    const firstField = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (firstField) document.getElementById(firstField)?.focus();
  }, [state]);

  const selectService = (id: string) => {
    setServiceId(id);
    // Hizmet değişince süre de değişir; kullanıcı yine de elle düzeltebilir.
    const service = context.services.find((s) => s.id === id);
    if (service) setDuration(service.durationMin);
  };

  const editableStatus =
    appointment.status === "cancelled" || appointment.status === "no_show"
      ? "confirmed"
      : appointment.status;

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-5">
      <input type="hidden" name="id" value={appointment.id} />

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <Field id="resource_id" label="Kaynak" required>
            <Select id="resource_id" name="resource_id" defaultValue={appointment.resourceId} required>
              {context.resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title ? `${resource.title} ` : ""}
                  {resource.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex-1">
          <Field id="service_id" label="Hizmet" hint="Tampon süreler buradan gelir.">
            <Select
              id="service_id"
              name="service_id"
              value={serviceId}
              onChange={(event) => selectService(event.target.value)}
            >
              <option value="">Hizmet seçilmedi</option>
              {context.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {service.durationMin} dk
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <Field id="date" label="Tarih" required>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={appointment.date}
              autoComplete="off"
              required
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field id="time" label="Saat" error={state.fieldErrors?.time} required>
            <Input
              id="time"
              name="time"
              type="time"
              defaultValue={appointment.time}
              step={300}
              autoComplete="off"
              error={Boolean(state.fieldErrors?.time)}
              required
            />
          </Field>
        </div>
        <div className="flex-1">
          <Field id="duration_min" label="Süre (dk)" required>
            <Input
              id="duration_min"
              name="duration_min"
              type="number"
              inputMode="numeric"
              min={5}
              max={1440}
              step={5}
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              required
            />
          </Field>
        </div>
      </div>

      <Field id="status" label="Durum" hint="İptal ve gelmedi aşağıdaki hızlı işlemlerden.">
        <Select id="status" name="status" defaultValue={editableStatus}>
          <option value="confirmed">Onaylandı</option>
          <option value="pending">Onay bekliyor</option>
          <option value="arrived">Geldi</option>
          <option value="completed">Tamamlandı</option>
        </Select>
      </Field>

      <Field id="notes" label="Not" hint="İdari not. Tedavi notu hasta kartında ayrı tutulur.">
        <Textarea id="notes" name="notes" rows={2} defaultValue={appointment.notes ?? ""} />
      </Field>

      <div className="flex items-center gap-3 border-t border-border pt-4">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
        </Button>
        <Link href={backHref} className="text-[13px] text-ink-2 underline underline-offset-2">
          Vazgeç
        </Link>
      </div>
    </form>
  );
}
