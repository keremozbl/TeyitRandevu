import Link from "next/link";

import type { Interval } from "@/lib/domain";
import type { DaySchedule, ResourceDay } from "@/lib/scheduling/queries";
import { RESOURCE_KIND_LABELS } from "@/lib/scheduling/status";

import { AppointmentBlock } from "./appointment-block";
import { GridSurface } from "./grid-surface";
import { NowLine } from "./now-line";

/**
 * Gün ızgarası: solda zaman ekseni, sağda kaynak sütunları.
 *
 * Yükseklik `--slot-h` token'ıyla aynı ölçekte: 30 dakika = 44px. Konumlar
 * sunucuda hesaplanmış `Date` değerlerinden çıkar, tarayıcının saat dilimi
 * hiçbir şeyi kaydırmaz.
 *
 * Randevu blokları istemci bileşeni (`appointment-block.tsx`): sürüklenirken
 * ve sunucu onayı beklenirken geçici bir konumda durabilmeleri gerekiyor.
 * Sütunlar, boş slotlar ve zaman ekseni sunucuda kalır.
 */
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 44; // globals.css → --slot-h
const PX_PER_MIN = SLOT_HEIGHT / SLOT_MINUTES;

/** style özniteliğine 442.99999999999994 yazılmasın. */
const px = (value: number) => Math.round(value * 100) / 100;

/** Saat ve yarım saat çizgileri: DOM yerine arka plan katmanı. */
const gridLines = {
  backgroundImage: [
    `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${60 * PX_PER_MIN}px)`,
    `repeating-linear-gradient(to bottom, var(--surface-2) 0 1px, transparent 1px ${SLOT_HEIGHT}px)`,
  ].join(", "),
};

/** İzin alanı: renk değil desen — siyah-beyaz çıktıda da ayırt edilir. */
const timeOffPattern = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--border) 0 1px, transparent 1px 7px)",
};

export function DayGrid({
  schedule,
  isToday,
  label,
  highlightId,
}: {
  schedule: DaySchedule;
  isToday: boolean;
  /** Okunur gün adı — ızgaranın ekran okuyucudaki adı ham tarih olmasın */
  label: string;
  /** Az önce oluşturulan randevu; ızgarada halkayla işaretlenir */
  highlightId?: string;
}) {
  const { timeZone, dayStartsAt, gridFromMinutes, gridToMinutes, resources } = schedule;
  const totalMinutes = gridToMinutes - gridFromMinutes;
  const bodyHeight = totalMinutes * PX_PER_MIN;

  const time = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const minutesFromDayStart = (instant: Date) =>
    (instant.getTime() - dayStartsAt.getTime()) / 60_000;

  const offsetOf = (instant: Date) => px((minutesFromDayStart(instant) - gridFromMinutes) * PX_PER_MIN);

  /** Izgara dışına taşan aralıklar kırpılır; taşan blok sütunu bozar. */
  const bandOf = (interval: Interval) => {
    const top = Math.max(0, offsetOf(interval.start));
    const bottom = Math.min(bodyHeight, offsetOf(interval.end));
    return { top, height: px(Math.max(bottom - top, 0)) };
  };

  const hours: number[] = [];
  for (let minute = gridFromMinutes; minute <= gridToMinutes; minute += 60) hours.push(minute);

  return (
    <GridSurface
      label={label}
      timeZone={timeZone}
      dayStartsAtMs={dayStartsAt.getTime()}
      pxPerMinute={PX_PER_MIN}
      gridFromMinutes={gridFromMinutes}
      gridToMinutes={gridToMinutes}
      stepMinutes={schedule.rules.slot_step_minutes}
    >
      <div className="flex w-full min-w-max pb-4">
        {/* zaman ekseni */}
        <div className="sticky left-0 z-30 w-14 shrink-0 bg-bg">
          <div className="sticky top-0 z-40 h-10 border-b border-border bg-bg" />
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((minute) => (
              <span
                key={minute}
                className="absolute right-2 font-mono text-[11px] leading-none text-ink-3"
                style={{ top: px((minute - gridFromMinutes) * PX_PER_MIN) + 3 }}
              >
                {time.format(new Date(dayStartsAt.getTime() + minute * 60_000))}
              </span>
            ))}
          </div>
        </div>

        {resources.map((day, index) => (
          <ResourceColumn
            key={day.resource.id}
            day={day}
            bodyHeight={bodyHeight}
            bandOf={bandOf}
            offsetOf={offsetOf}
            time={time}
            date={schedule.date}
            branchId={schedule.branch?.id ?? null}
            highlightId={highlightId}
            now={
              isToday ? (
                <NowLine
                  dayStartsAt={dayStartsAt}
                  gridFromMinutes={gridFromMinutes}
                  gridToMinutes={gridToMinutes}
                  pxPerMinute={PX_PER_MIN}
                  showMarker={index === 0}
                />
              ) : null
            }
          />
        ))}
      </div>
    </GridSurface>
  );
}

function ResourceColumn({
  day,
  bodyHeight,
  bandOf,
  offsetOf,
  time,
  date,
  branchId,
  highlightId,
  now,
}: {
  day: ResourceDay;
  bodyHeight: number;
  bandOf: (interval: Interval) => { top: number; height: number };
  offsetOf: (instant: Date) => number;
  time: Intl.DateTimeFormat;
  date: string;
  branchId: string | null;
  highlightId?: string;
  now: React.ReactNode;
}) {
  const { resource, freeSlots, openWindows, timeOff, appointments } = day;
  const closedAllDay = openWindows.length === 0;

  const newAppointmentHref = (startsAt: Date) => {
    const params = new URLSearchParams({
      tarih: date,
      saat: time.format(startsAt),
      kaynak: resource.id,
    });
    if (branchId) params.set("sube", branchId);
    return `/app/randevu/yeni?${params.toString()}`;
  };

  return (
    <div className="flex w-56 shrink-0 grow flex-col border-l border-border">
      <div className="sticky top-0 z-30 flex h-10 items-center gap-2 border-b border-border bg-bg px-2">
        {resource.color && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: resource.color }}
          />
        )}
        <span className="min-w-0 truncate font-medium text-ink">
          {resource.title ? `${resource.title} ` : ""}
          {resource.name}
        </span>
        {resource.kind !== "staff" && (
          <span className="shrink-0 font-mono text-[10px] uppercase text-ink-3">
            {RESOURCE_KIND_LABELS[resource.kind]}
          </span>
        )}
      </div>

      {/* Sürükleme hedefi: bırakılan sütun bu öznitelikten okunur */}
      <div
        data-column
        data-resource-id={resource.id}
        className="relative bg-surface-2 outline-accent data-[drop=true]:outline-2 data-[drop=true]:-outline-offset-2"
        style={{ height: bodyHeight }}
      >
        {openWindows.map((window) => {
          const band = bandOf(window);
          return (
            <div
              key={window.start.toISOString()}
              className="absolute inset-x-0 bg-surface"
              style={{ top: band.top, height: band.height }}
            />
          );
        })}

        {timeOff.map((leave) => {
          const band = bandOf(leave);
          if (band.height <= 0) return null;
          return (
            <div
              key={leave.start.toISOString()}
              className="absolute inset-x-0 overflow-hidden"
              style={{ ...timeOffPattern, top: band.top, height: band.height }}
            >
              <span className="absolute left-1.5 top-0.5 rounded-sm bg-bg px-1 text-[10px] text-ink-2">
                İzin
              </span>
            </div>
          );
        })}

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={gridLines}
        />

        {closedAllDay && (
          <p className="absolute inset-x-0 top-3 text-center text-[12px] text-ink-3">Kapalı</p>
        )}

        {freeSlots.map((startsAt) => (
          <Link
            key={startsAt.toISOString()}
            href={newAppointmentHref(startsAt)}
            aria-label={`${time.format(startsAt)} · ${resource.name} · yeni randevu`}
            className="group absolute inset-x-0.5 rounded-sm no-underline transition-colors duration-150 hover:bg-accent-soft"
            style={{ top: offsetOf(startsAt), height: SLOT_HEIGHT - 1 }}
          >
            <span
              aria-hidden="true"
              className="flex h-full items-center justify-center text-[11px] text-accent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              + randevu
            </span>
          </Link>
        ))}

        {appointments.map((appointment) => (
          <AppointmentBlock
            key={appointment.id}
            id={appointment.id}
            resourceId={appointment.resourceId}
            startsAtMs={appointment.startsAt.getTime()}
            durationMinutes={Math.round(
              (appointment.endsAt.getTime() - appointment.startsAt.getTime()) / 60_000,
            )}
            bufferBeforeMin={Math.round(
              (appointment.startsAt.getTime() - appointment.blockedFrom.getTime()) / 60_000,
            )}
            bufferAfterMin={Math.round(
              (appointment.blockedTo.getTime() - appointment.endsAt.getTime()) / 60_000,
            )}
            status={appointment.status}
            customerName={
              appointment.isHold
                ? "Slot tutuluyor — online"
                : (appointment.customerName ?? "İsimsiz kayıt")
            }
            serviceName={appointment.serviceName}
            href={`/app/randevu/${appointment.id}${branchId ? `?sube=${branchId}` : ""}`}
            highlighted={appointment.id === highlightId}
            date={date}
            branchId={branchId}
            isHold={appointment.isHold}
          />
        ))}

        {now}
      </div>
    </div>
  );
}
