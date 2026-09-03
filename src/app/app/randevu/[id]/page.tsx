import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import {
  cancelAppointmentAction,
  setAppointmentStatusAction,
  undoCancelAction,
} from "@/lib/appointments/edit-actions";
import { requireTenant } from "@/lib/auth/session";
import { zonedTimeToUtc } from "@/lib/domain";
import { loadAppointment, loadBookingContext } from "@/lib/scheduling/queries";
import { STATUS_STYLES } from "@/lib/scheduling/status";
import { formatPhoneTr } from "@/lib/utils/phone";

import { AppointmentEditForm } from "./edit-form";

export const metadata: Metadata = { title: "Randevu" };

/** Hızlı işlem düğmelerinin sırası: günün akışıyla aynı. */
const QUICK_STATUSES = [
  { status: "arrived", label: "Geldi" },
  { status: "completed", label: "Tamamlandı" },
  { status: "no_show", label: "Gelmedi" },
] as const;

export default async function RandevuPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sube?: string }>;
}) {
  const { active } = await requireTenant();
  const { id } = await params;
  const { sube } = await searchParams;

  const appointment = await loadAppointment(id, active.tenant.timezone);
  if (!appointment) notFound();

  const context = await loadBookingContext({
    tenantId: active.tenant.id,
    tenantTimeZone: active.tenant.timezone,
    branchId: appointment.branchId,
    withCustomers: false,
  });
  if (!context) notFound();

  const status = STATUS_STYLES[appointment.status];
  const isCancelled = appointment.status === "cancelled";
  const backHref = `/app?tarih=${appointment.date}${sube ? `&sube=${sube}` : ""}`;

  const day = new Intl.DateTimeFormat("tr-TR", {
    timeZone: appointment.timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(zonedTimeToUtc(appointment.date, "12:00", appointment.timeZone));

  const clock = new Intl.DateTimeFormat("tr-TR", {
    timeZone: appointment.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  /** Hızlı işlem ve iptal formlarının ortak gizli alanları. */
  const hidden = (
    <>
      <input type="hidden" name="id" value={appointment.id} />
      <input type="hidden" name="tarih" value={appointment.date} />
      {sube && <input type="hidden" name="sube" value={sube} />}
    </>
  );

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href={backHref} className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Takvime dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">
            {appointment.customerId ? (
              <Link
                href={`/app/hastalar/${appointment.customerId}`}
                className="text-ink no-underline hover:underline"
              >
                {appointment.customerName ?? "İsimsiz kayıt"}
              </Link>
            ) : (
              (appointment.customerName ?? "İsimsiz kayıt")
            )}
          </h1>
          <span className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>
        <p className="font-mono text-[13px] text-ink-3">
          {day} · {clock.format(appointment.startsAt)}–{clock.format(appointment.endsAt)} ·{" "}
          {appointment.resourceName}
          {appointment.serviceName && ` · ${appointment.serviceName}`}
        </p>
        {appointment.customerPhone && (
          <p className="font-mono text-[13px] text-ink-2">
            {formatPhoneTr(appointment.customerPhone)}
          </p>
        )}
      </div>

      {isCancelled ? (
        <div className="flex max-w-2xl flex-col items-start gap-3 rounded border border-border bg-surface-2 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[13px] font-medium text-ink">Bu randevu iptal edildi</h2>
            <p className="text-[13px] text-ink-2">
              {appointment.cancelledReason
                ? `Sebep: ${appointment.cancelledReason}`
                : "Sebep yazılmamış."}{" "}
              Geri alındığında saat hâlâ boşsa randevu onaylı duruma döner.
            </p>
          </div>
          <form action={undoCancelAction}>
            {hidden}
            <input type="hidden" name="onceki" value="confirmed" />
            <Button type="submit" variant="secondary">
              İptali Geri Al
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_STATUSES.map((quick) => (
            <form key={quick.status} action={setAppointmentStatusAction}>
              {hidden}
              <input type="hidden" name="status" value={quick.status} />
              <Button
                type="submit"
                size="sm"
                variant={appointment.status === quick.status ? "primary" : "secondary"}
              >
                {quick.label}
              </Button>
            </form>
          ))}
        </div>
      )}

      <AppointmentEditForm appointment={appointment} context={context} backHref={backHref} />

      {!isCancelled && (
        <section className="flex max-w-2xl flex-col gap-3 border-t border-border pt-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-[13px] font-medium text-ink">Randevuyu iptal et</h2>
            <p className="text-[13px] text-ink-2">
              Kayıt silinmez, iptal olarak işaretlenir ve saat başkasına açılır. Takvimde geri alma
              şeridi çıkar.
            </p>
          </div>
          <form action={cancelAppointmentAction} className="flex flex-wrap items-end gap-2">
            {hidden}
            <input type="hidden" name="previous" value={appointment.status} />
            <div className="min-w-[16rem] flex-1">
              <Field id="reason" label="İptal sebebi" hint="Boş bırakılabilir.">
                <Input
                  id="reason"
                  name="reason"
                  autoComplete="off"
                  maxLength={500}
                  placeholder="Erteledi, tekrar arayacak…"
                />
              </Field>
            </div>
            <Button type="submit" variant="danger">
              Randevuyu İptal Et
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
