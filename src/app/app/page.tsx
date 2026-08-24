import type { Metadata } from "next";

import { requireTenant } from "@/lib/auth/session";
import { addDays, utcToPlainDate, zonedTimeToUtc } from "@/lib/domain";
import { loadDaySchedule, type CalendarAppointment } from "@/lib/scheduling/queries";
import { GRID_STATUSES, STATUS_STYLES } from "@/lib/scheduling/status";

import { DayGrid } from "./day-grid";
import { DayNav } from "./day-nav";

export const metadata: Metadata = { title: "Takvim" };

export default async function TakvimPage({
  searchParams,
}: {
  searchParams: Promise<{ tarih?: string; sube?: string }>;
}) {
  const { active } = await requireTenant();
  const { tarih, sube } = await searchParams;

  const schedule = await loadDaySchedule({
    tenantId: active.tenant.id,
    tenantTimeZone: active.tenant.timezone,
    date: tarih,
    branchId: sube,
  });

  const today = utcToPlainDate(new Date(), schedule.timeZone);
  const isToday = schedule.date === today;

  const hrefFor = (date: string) => {
    const params = new URLSearchParams({ tarih: date });
    if (schedule.branch && schedule.branches.length > 1) params.set("sube", schedule.branch.id);
    return `/app?${params.toString()}`;
  };

  // Gün adı öğle vaktinden okunur: yaz saati geçişlerinde gün kaymaz.
  const heading = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: schedule.timeZone,
  }).format(zonedTimeToUtc(schedule.date, "12:00", schedule.timeZone));

  const time = new Intl.DateTimeFormat("tr-TR", {
    timeZone: schedule.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // Izgarada yalnız yer kaplayan randevular çizilir; iptal ve gelmedi kayıtları
  // aynı saati paylaşabildiği için üst üste binerdi. Onlar aşağıdaki listede.
  const gridSchedule = {
    ...schedule,
    resources: schedule.resources.map((day) => ({
      ...day,
      appointments: day.appointments.filter((a) => GRID_STATUSES.includes(a.status)),
    })),
  };

  const booked = gridSchedule.resources.flatMap((day) => day.appointments);
  const pending = booked.filter((a) => a.status === "pending").length;

  const dropped = schedule.resources.flatMap((day) =>
    day.appointments
      .filter((a) => !GRID_STATUSES.includes(a.status))
      .map((appointment) => ({ appointment, resourceName: day.resource.name })),
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Takvim</h1>
        <p className="font-mono text-[13px] text-ink-3">{heading}</p>
        <p className="text-[13px] text-ink-2" data-numeric>
          {booked.length} randevu
          {pending > 0 && <> · {pending} onay bekliyor</>}
          {schedule.branch && schedule.branches.length > 1 && <> · {schedule.branch.name}</>}
        </p>
      </div>

      <DayNav
        date={schedule.date}
        prevHref={hrefFor(addDays(schedule.date, -1))}
        nextHref={hrefFor(addDays(schedule.date, 1))}
        todayHref={hrefFor(today)}
        isToday={isToday}
        branches={schedule.branches}
        branchId={schedule.branch?.id ?? null}
      />

      {!schedule.branch ? (
        <EmptyState
          title="Şube bulunamadı"
          detail="Takvim bir şubenin kaynakları üzerinde çalışır. Kurulum sihirbazı ilk şubeyi oluşturur; kurum bu adımdan geçmemiş görünüyor."
        />
      ) : schedule.resources.length === 0 ? (
        <EmptyState
          title="Bu şubede kaynak yok"
          detail="Randevular hekim, ünit ya da oda gibi kaynakların üzerine düşer. Ekip ekranından en az bir kaynak eklendiğinde sütunlar burada belirir."
        />
      ) : (
        <>
          <DayGrid schedule={gridSchedule} isToday={isToday} label={heading} />
          <Legend />
        </>
      )}

      {dropped.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="text-[13px] font-medium text-ink-2">İptal edilen ve gelmeyen</h2>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
            {dropped.map(({ appointment, resourceName }) => (
              <DroppedRow
                key={appointment.id}
                appointment={appointment}
                resourceName={resourceName}
                time={time}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DroppedRow({
  appointment,
  resourceName,
  time,
}: {
  appointment: CalendarAppointment;
  resourceName: string;
  time: Intl.DateTimeFormat;
}) {
  const status = STATUS_STYLES[appointment.status];

  return (
    <li className="flex min-w-0 items-center gap-3 px-3 py-1.5 text-[13px]">
      <time
        dateTime={appointment.startsAt.toISOString()}
        className="shrink-0 font-mono text-[12px] text-ink-2"
      >
        {time.format(appointment.startsAt)}
      </time>
      <span className="min-w-0 flex-1 truncate text-ink">
        {appointment.customerName ?? "İsimsiz kayıt"}
        {appointment.serviceName && <span className="text-ink-3"> · {appointment.serviceName}</span>}
      </span>
      <span className="hidden min-w-0 max-w-[10rem] shrink-0 truncate text-ink-3 sm:inline">
        {resourceName}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-ink-2">
        <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>
    </li>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
      {GRID_STATUSES.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${STATUS_STYLES[key].dot}`} />
          {STATUS_STYLES[key].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-2.5 w-4 rounded-sm border border-border"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 7px)",
          }}
        />
        İzin
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-4 rounded-sm bg-ink-3/15" />
        Tampon süre
      </li>
    </ul>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded border border-dashed border-border p-8">
      <h2 className="text-ink">{title}</h2>
      <p className="max-w-md text-[13px] text-ink-2">{detail}</p>
    </div>
  );
}
