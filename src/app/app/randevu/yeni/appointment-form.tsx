"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createAppointmentAction, type AppointmentFormState } from "@/lib/appointments/actions";
import type { BookingContext } from "@/lib/scheduling/queries";
import { formatPhoneTr } from "@/lib/utils/phone";

const EMPTY: AppointmentFormState = {};
const NEW_CUSTOMER = "new";

export function AppointmentForm({
  context,
  date,
  time,
  resourceId,
  search,
  backHref,
}: {
  context: BookingContext;
  date: string;
  time: string;
  resourceId: string;
  search: string;
  backHref: string;
}) {
  const [state, formAction, pending] = useActionState(createAppointmentAction, EMPTY);
  const [serviceId, setServiceId] = useState("");
  const [duration, setDuration] = useState(30);
  const [customer, setCustomer] = useState(context.customers.length === 0 ? NEW_CUSTOMER : "");

  // Hata dönünce ilk hatalı alana odaklan: kullanıcı formu yukarı aşağı
  // taramak zorunda kalmasın (Web Interface Guidelines).
  useEffect(() => {
    const firstField = state.fieldErrors && Object.keys(state.fieldErrors)[0];
    if (firstField) document.getElementById(firstField)?.focus();
  }, [state]);

  const selectService = (id: string) => {
    setServiceId(id);
    const service = context.services.find((s) => s.id === id);
    if (service) setDuration(service.durationMin);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {/* Hasta arama ayrı bir GET formu: iç içe form olamaz ve JavaScript
          kapalıyken de çalışması gerekiyor. */}
      <form method="get" className="flex items-end gap-2">
        <input type="hidden" name="tarih" value={date} />
        <input type="hidden" name="saat" value={time} />
        <input type="hidden" name="kaynak" value={resourceId} />
        <input type="hidden" name="sube" value={context.branch.id} />
        <div className="flex-1">
          <Field id="q" label="Hasta ara" hint="Ad ya da telefonun bir parçası yeter.">
            <Input
              id="q"
              name="q"
              type="search"
              defaultValue={search}
              autoComplete="off"
              spellCheck={false}
              placeholder="Ayşe, 0555…"
            />
          </Field>
        </div>
        <Button type="submit">Ara</Button>
      </form>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="branch_id" value={context.branch.id} />

        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-[13px] font-medium text-ink">Hasta</legend>

          {context.customers.length === 0 && search && (
            <p className="text-[13px] text-ink-2">
              “{search}” için kayıt bulunamadı. Aşağıdan yeni hasta olarak ekleyebilirsiniz.
            </p>
          )}

          <div className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border">
            {context.customers.map((person) => (
              <label
                key={person.id}
                className="flex min-w-0 cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="customer"
                  value={person.id}
                  checked={customer === person.id}
                  onChange={() => setCustomer(person.id)}
                  className="shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-ink">{person.fullName}</span>
                {person.phone && (
                  <span className="shrink-0 font-mono text-[12px] text-ink-3">
                    {formatPhoneTr(person.phone)}
                  </span>
                )}
              </label>
            ))}

            <div className="flex flex-col gap-3 px-3 py-2.5">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px]">
                <input
                  type="radio"
                  name="customer"
                  value={NEW_CUSTOMER}
                  checked={customer === NEW_CUSTOMER}
                  onChange={() => setCustomer(NEW_CUSTOMER)}
                  className="shrink-0"
                />
                <span className="font-medium text-ink">Yeni hasta</span>
              </label>

              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Field
                    id="customer_name"
                    label="Ad soyad"
                    error={state.fieldErrors?.customer_name}
                  >
                    <Input
                      id="customer_name"
                      name="customer_name"
                      autoComplete="off"
                      onFocus={() => setCustomer(NEW_CUSTOMER)}
                      error={Boolean(state.fieldErrors?.customer_name)}
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field
                    id="customer_phone"
                    label="Telefon"
                    hint="Aynı numara kayıtlıysa yeni kart açılmaz."
                    error={state.fieldErrors?.customer_phone}
                  >
                    <Input
                      id="customer_phone"
                      name="customer_phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      placeholder="0555 123 45 67"
                      onFocus={() => setCustomer(NEW_CUSTOMER)}
                      error={Boolean(state.fieldErrors?.customer_phone)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <Field id="resource_id" label="Kaynak" required>
              <Select id="resource_id" name="resource_id" defaultValue={resourceId} required>
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
            <Field id="service_id" label="Hizmet" hint="Süre ve tampon buradan gelir.">
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
              <Input id="date" name="date" type="date" defaultValue={date} autoComplete="off" required />
            </Field>
          </div>
          <div className="flex-1">
            <Field id="time" label="Saat" error={state.fieldErrors?.time} required>
              <Input
                id="time"
                name="time"
                type="time"
                defaultValue={time}
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

        <Field id="status" label="Durum">
          <Select id="status" name="status" defaultValue="confirmed">
            <option value="confirmed">Onaylandı</option>
            <option value="pending">Onay bekliyor</option>
          </Select>
        </Field>

        <Field id="notes" label="Not" hint="İdari not. Tedavi notu hasta kartında ayrı tutulur.">
          <Textarea id="notes" name="notes" rows={2} />
        </Field>

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Oluşturuluyor…" : "Randevuyu Oluştur"}
          </Button>
          <Link href={backHref} className="text-[13px] text-ink-2 underline underline-offset-2">
            Vazgeç
          </Link>
        </div>
      </form>
    </div>
  );
}
