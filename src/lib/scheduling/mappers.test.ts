import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blocksTime,
  buildResourceSchedules,
  resolveTimeZone,
  toBlockedInterval,
  toDate,
  toInterval,
  toServiceDuration,
  toWorkingHour,
  type BlockingAppointmentRow,
} from "./mappers.ts";

const HEKIM = "11111111-1111-1111-1111-111111111111";
const UNIT = "22222222-2222-2222-2222-222222222222";
const BASKA_SUBE = "33333333-3333-3333-3333-333333333333";

const appointment = (
  resource_id: string,
  status: BlockingAppointmentRow["status"],
  from: string,
  to: string,
): BlockingAppointmentRow => ({
  resource_id,
  status,
  blocked_from: from,
  blocked_to: to,
});

test("çalışma saati satırı motorun beklediği şekle döner", () => {
  assert.deepEqual(
    toWorkingHour({
      resource_id: HEKIM,
      weekday: 1,
      starts_at: "09:00:00",
      ends_at: "18:00:00",
    }),
    { weekday: 1, startsAt: "09:00:00", endsAt: "18:00:00" },
  );
});

test("timestamptz string'i UTC anına çevrilir", () => {
  assert.equal(toDate("2026-08-24T06:00:00+00:00").toISOString(), "2026-08-24T06:00:00.000Z");
  // Supabase sunucu saatini kaymayla da verebilir; sonuç aynı an olmalı
  assert.equal(toDate("2026-08-24T09:00:00+03:00").toISOString(), "2026-08-24T06:00:00.000Z");
});

test("bozuk zaman değeri sessizce geçmez", () => {
  assert.throws(() => toDate("dün", "starts_at"), /Geçersiz starts_at/);
});

test("randevunun meşgul aralığı tamponlu bloke sütunlarından okunur", () => {
  const interval = toBlockedInterval({
    blocked_from: "2026-08-24T06:50:00+00:00",
    blocked_to: "2026-08-24T07:45:00+00:00",
  });
  assert.equal(interval.start.toISOString(), "2026-08-24T06:50:00.000Z");
  assert.equal(interval.end.toISOString(), "2026-08-24T07:45:00.000Z");
});

test("izin satırı aralığa döner", () => {
  const interval = toInterval({
    starts_at: "2026-08-24T09:00:00+00:00",
    ends_at: "2026-08-24T10:00:00+00:00",
  });
  assert.equal(interval.end.getTime() - interval.start.getTime(), 3_600_000);
});

test("hizmet süresi ve tamponları birlikte taşınır", () => {
  assert.deepEqual(
    toServiceDuration({ duration_min: 30, buffer_before_min: 5, buffer_after_min: 15 }),
    { durationMin: 30, bufferBeforeMin: 5, bufferAfterMin: 15 },
  );
});

test("yer kaplayan durumlar çakışma kısıtının where'iyle aynı", () => {
  assert.equal(blocksTime("pending"), true);
  assert.equal(blocksTime("confirmed"), true);
  assert.equal(blocksTime("arrived"), true);
  assert.equal(blocksTime("completed"), true);
  assert.equal(blocksTime("cancelled"), false);
  assert.equal(blocksTime("no_show"), false);
});

test("şube kendi zaman dilimini kuruma tercih ettirir", () => {
  assert.equal(resolveTimeZone("Europe/Berlin", "Europe/Istanbul"), "Europe/Berlin");
  assert.equal(resolveTimeZone(null, "Europe/Istanbul"), "Europe/Istanbul");
  assert.equal(resolveTimeZone("   ", "Europe/Istanbul"), "Europe/Istanbul");
  assert.equal(resolveTimeZone(undefined, "Europe/Istanbul"), "Europe/Istanbul");
});

test("satırlar kaynak bazında motor girdisine dağıtılır", () => {
  const schedules = buildResourceSchedules({
    resourceIds: [HEKIM, UNIT],
    workingHours: [
      { resource_id: HEKIM, weekday: 1, starts_at: "09:00:00", ends_at: "12:00:00" },
      { resource_id: HEKIM, weekday: 1, starts_at: "13:00:00", ends_at: "18:00:00" },
      { resource_id: UNIT, weekday: 1, starts_at: "09:00:00", ends_at: "18:00:00" },
    ],
    timeOff: [
      {
        resource_id: HEKIM,
        starts_at: "2026-08-24T12:00:00+00:00",
        ends_at: "2026-08-24T13:00:00+00:00",
      },
    ],
    appointments: [
      appointment(HEKIM, "confirmed", "2026-08-24T07:00:00+00:00", "2026-08-24T07:30:00+00:00"),
    ],
  });

  assert.deepEqual(schedules.get(HEKIM)?.workingHours, [
    { weekday: 1, startsAt: "09:00:00", endsAt: "12:00:00" },
    { weekday: 1, startsAt: "13:00:00", endsAt: "18:00:00" },
  ]);
  assert.equal(schedules.get(HEKIM)?.timeOff?.length, 1);
  assert.equal(schedules.get(HEKIM)?.busy?.length, 1);
  assert.equal(schedules.get(UNIT)?.workingHours.length, 1);
  assert.equal(schedules.get(UNIT)?.busy?.length, 0);
});

test("iptal ve gelmedi randevuları yer kaplamaz", () => {
  const schedules = buildResourceSchedules({
    resourceIds: [HEKIM],
    workingHours: [],
    appointments: [
      appointment(HEKIM, "cancelled", "2026-08-24T07:00:00+00:00", "2026-08-24T07:30:00+00:00"),
      appointment(HEKIM, "no_show", "2026-08-24T08:00:00+00:00", "2026-08-24T08:30:00+00:00"),
      appointment(HEKIM, "arrived", "2026-08-24T09:00:00+00:00", "2026-08-24T09:30:00+00:00"),
    ],
  });

  assert.deepEqual(
    schedules.get(HEKIM)?.busy?.map((i) => i.start.toISOString()),
    ["2026-08-24T09:00:00.000Z"],
  );
});

test("istenmeyen kaynağın satırları ızgaraya sızmaz", () => {
  const schedules = buildResourceSchedules({
    resourceIds: [HEKIM],
    workingHours: [{ resource_id: BASKA_SUBE, weekday: 1, starts_at: "09:00:00", ends_at: "18:00:00" }],
    appointments: [
      appointment(BASKA_SUBE, "confirmed", "2026-08-24T07:00:00+00:00", "2026-08-24T07:30:00+00:00"),
    ],
  });

  assert.equal(schedules.size, 1);
  assert.deepEqual(schedules.get(HEKIM), { workingHours: [], timeOff: [], busy: [] });
});

test("çalışma saati olmayan kaynak da haritada yer alır", () => {
  const schedules = buildResourceSchedules({ resourceIds: [HEKIM, UNIT], workingHours: [] });
  assert.deepEqual([...schedules.keys()], [HEKIM, UNIT]);
});
