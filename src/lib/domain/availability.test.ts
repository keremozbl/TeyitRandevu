import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkBookingWindow,
  computeAvailability,
  computeOpenWindows,
  mergeResourceAvailability,
  nearestSlot,
  type ResourceSchedule,
  type WorkingHour,
} from "./availability.ts";
import { DEFAULT_BOOKING_RULES } from "./booking-rules.ts";
import type { Interval } from "./intervals.ts";
import { zonedTimeToUtc } from "./time.ts";

const IST = "Europe/Istanbul";
const MONDAY = "2026-08-24";
const SUNDAY = "2026-08-23";

/** Pazartesi–cuma 09:00–12:00 ve 13:00–18:00 */
const WEEKDAY_HOURS: WorkingHour[] = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, startsAt: "09:00:00", endsAt: "12:00:00" },
  { weekday, startsAt: "13:00:00", endsAt: "18:00:00" },
]);

const ist = (date: string, time: string) => zonedTimeToUtc(date, time, IST);
const span = (date: string, from: string, to: string): Interval => ({
  start: ist(date, from),
  end: ist(date, to),
});

const clock = new Intl.DateTimeFormat("tr-TR", {
  timeZone: IST,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function slotTimes(schedule: ResourceSchedule, options: Partial<Parameters<typeof computeAvailability>[0]> = {}) {
  const [day] = computeAvailability({
    timeZone: IST,
    from: MONDAY,
    to: MONDAY,
    schedule,
    service: { durationMin: 30 },
    stepMinutes: 30,
    ...options,
  });
  return day.slots.map((slot) => clock.format(slot.startsAt));
}

test("çalışma penceresi ızgaraya bölünür, son slot pencereye sığar", () => {
  const times = slotTimes({ workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }] });
  assert.deepEqual(times, ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
});

test("günün iki penceresi ayrı ayrı ızgaralanır, öğle arası boş kalır", () => {
  const times = slotTimes({ workingHours: WEEKDAY_HOURS }, { service: { durationMin: 60 }, stepMinutes: 60 });
  assert.deepEqual(times, ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
});

test("çalışma saati olmayan gün kapalıdır ama sonuçtan düşmez", () => {
  const [day] = computeAvailability({
    timeZone: IST,
    from: SUNDAY,
    to: SUNDAY,
    schedule: { workingHours: WEEKDAY_HOURS },
    service: { durationMin: 30 },
  });
  assert.deepEqual(day, { date: SUNDAY, slots: [] });
});

test("mevcut randevu kendi tamponu kadar yer kaplar", () => {
  // 10:00–10:30 randevu, 15 dk sonrası tamponla 10:45'e kadar bloke
  const times = slotTimes(
    {
      workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }],
      busy: [span(MONDAY, "10:00", "10:45")],
    },
    { stepMinutes: 15 },
  );
  assert.equal(times.includes("09:30"), true);
  assert.deepEqual(times.filter((t) => t >= "09:45" && t <= "10:30"), []);
  assert.equal(times.includes("10:45"), true);
});

test("uç uca gelen randevu çakışma sayılmaz", () => {
  const times = slotTimes({
    workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "11:00" }],
    busy: [span(MONDAY, "09:30", "10:00")],
  });
  assert.deepEqual(times, ["09:00", "10:00", "10:30"]);
});

test("adayın kendi tamponu bir sonraki randevuya değerse slot düşer", () => {
  const schedule: ResourceSchedule = {
    workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }],
    busy: [span(MONDAY, "11:00", "11:30")],
  };
  assert.equal(slotTimes(schedule).includes("10:30"), true);
  // 10:30–11:00 işlemin 15 dk temizliği 11:15'e sarkar, randevuya değer
  const withBuffer = slotTimes(schedule, { service: { durationMin: 30, bufferAfterMin: 15 } });
  assert.equal(withBuffer.includes("10:30"), false);
  assert.deepEqual(withBuffer, ["09:00", "09:30", "10:00", "11:30"]);
});

test("aday randevunun tamponu kapanışın üstüne taşabilir", () => {
  // Kural: randevunun kendisi çalışma saatinde olmalı, sterilizasyonu sarkabilir
  const times = slotTimes(
    { workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "10:00" }] },
    { service: { durationMin: 30, bufferAfterMin: 15 } },
  );
  assert.deepEqual(times, ["09:00", "09:30"]);
});

test("izin çalışma penceresini keser", () => {
  const times = slotTimes(
    {
      workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }],
      timeOff: [span(MONDAY, "10:00", "11:00")],
    },
    { stepMinutes: 15 },
  );
  assert.equal(times.includes("09:30"), true);
  assert.equal(times.includes("09:45"), false); // 10:15'te biterdi, izne taşıyor
  assert.equal(times.includes("11:00"), true);
});

test("slotun bloke aralığı randevu satırıyla aynı hesaplanır", () => {
  const [day] = computeAvailability({
    timeZone: IST,
    from: MONDAY,
    to: MONDAY,
    schedule: { workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "10:00" }] },
    service: { durationMin: 30, bufferBeforeMin: 10, bufferAfterMin: 15 },
    stepMinutes: 30,
  });
  assert.deepEqual(day.slots[0], {
    startsAt: ist(MONDAY, "09:00"),
    endsAt: ist(MONDAY, "09:30"),
    blockedFrom: ist(MONDAY, "08:50"),
    blockedTo: ist(MONDAY, "09:45"),
  });
});

test("minimum ön süre geçmiş ve çok yakın slotları eler", () => {
  const times = slotTimes(
    { workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }] },
    {
      rules: { ...DEFAULT_BOOKING_RULES, min_lead_minutes: 120 },
      now: ist(MONDAY, "08:15"), // en erken 10:15 -> ilk ızgara noktası 10:30
    },
  );
  assert.deepEqual(times, ["10:30", "11:00", "11:30"]);
});

test("kural verilmezse ön süre uygulanmaz — panelden randevu açan personel için", () => {
  const times = slotTimes(
    { workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }] },
    { now: ist(MONDAY, "08:15") },
  );
  assert.equal(times[0], "09:00");
});

test("en fazla ileri tarih o günün tamamını açık bırakır", () => {
  const days = computeAvailability({
    timeZone: IST,
    from: MONDAY,
    to: "2026-08-28",
    schedule: { workingHours: WEEKDAY_HOURS },
    service: { durationMin: 60 },
    stepMinutes: 60,
    rules: { ...DEFAULT_BOOKING_RULES, min_lead_minutes: 0, max_advance_days: 2 },
    now: ist(MONDAY, "08:00"),
  });
  assert.deepEqual(
    days.map((d) => d.slots.length > 0),
    [true, true, true, false, false],
  );
});

test("yaz saatine geçilen gün doğru UTC anlarını verir", () => {
  // Berlin 29 Mart 2026 pazar: 02:00'de saat ileri alınır, mesai CEST (UTC+2)
  const [day] = computeAvailability({
    timeZone: "Europe/Berlin",
    from: "2026-03-29",
    to: "2026-03-29",
    schedule: { workingHours: [{ weekday: 0, startsAt: "09:00", endsAt: "12:00" }] },
    service: { durationMin: 60 },
    stepMinutes: 60,
  });
  assert.deepEqual(
    day.slots.map((s) => s.startsAt.toISOString()),
    ["2026-03-29T07:00:00.000Z", "2026-03-29T08:00:00.000Z", "2026-03-29T09:00:00.000Z"],
  );
});

test("açık zaman penceresi randevuları içermez, izinleri çıkarır", () => {
  const windows = computeOpenWindows(MONDAY, IST, {
    workingHours: WEEKDAY_HOURS,
    timeOff: [span(MONDAY, "15:00", "16:00")],
    busy: [span(MONDAY, "10:00", "10:30")],
  });
  assert.deepEqual(
    windows.map((w) => `${clock.format(w.start)}-${clock.format(w.end)}`),
    ["09:00-12:00", "13:00-15:00", "16:00-18:00"],
  );
});

test("geçersiz süre ve adım sessizce geçmez", () => {
  const schedule = { workingHours: WEEKDAY_HOURS };
  const base = { timeZone: IST, from: MONDAY, to: MONDAY, schedule };
  assert.throws(() => computeAvailability({ ...base, service: { durationMin: 0 } }), /hizmet süresi/);
  assert.throws(
    () => computeAvailability({ ...base, service: { durationMin: 30, bufferAfterMin: -5 } }),
    /tampon/i,
  );
  assert.throws(
    () => computeAvailability({ ...base, service: { durationMin: 30 }, stepMinutes: 0 }),
    /ızgara adımı/,
  );
});

test("rezervasyon penceresi reddi sebebiyle birlikte döner", () => {
  const rules = { ...DEFAULT_BOOKING_RULES, min_lead_minutes: 120, max_advance_days: 60 };
  const now = ist(MONDAY, "08:00");
  assert.equal(checkBookingWindow(ist(MONDAY, "07:00"), rules, IST, now), "in_past");
  assert.equal(checkBookingWindow(ist(MONDAY, "09:00"), rules, IST, now), "too_soon");
  assert.equal(checkBookingWindow(ist("2026-11-01", "09:00"), rules, IST, now), "too_far");
  assert.equal(checkBookingWindow(ist("2026-10-23", "09:00"), rules, IST, now), null);
  assert.equal(checkBookingWindow(ist(MONDAY, "11:00"), rules, IST, now), null);
});

test("aynı saati veren kaynaklar tek slotta birleşir", () => {
  const service = { durationMin: 60 };
  const days = (hours: WorkingHour[]) =>
    computeAvailability({
      timeZone: IST,
      from: MONDAY,
      to: MONDAY,
      schedule: { workingHours: hours },
      service,
      stepMinutes: 60,
    });

  const merged = mergeResourceAvailability([
    { resourceId: "hekim-a", days: days([{ weekday: 1, startsAt: "09:00", endsAt: "11:00" }]) },
    { resourceId: "hekim-b", days: days([{ weekday: 1, startsAt: "10:00", endsAt: "12:00" }]) },
  ]);

  assert.equal(merged.length, 1);
  assert.deepEqual(
    merged[0].slots.map((s) => [clock.format(s.startsAt), s.resourceIds]),
    [
      ["09:00", ["hekim-a"]],
      ["10:00", ["hekim-a", "hekim-b"]],
      ["11:00", ["hekim-b"]],
    ],
  );
});

test("en yakın uygun slot hata mesajı için bulunur", () => {
  const days = computeAvailability({
    timeZone: IST,
    from: MONDAY,
    to: MONDAY,
    schedule: {
      workingHours: [{ weekday: 1, startsAt: "09:00", endsAt: "12:00" }],
      busy: [span(MONDAY, "10:00", "11:00")],
    },
    service: { durationMin: 30 },
    stepMinutes: 30,
  });

  // 10:15 dolu; en yakın açık saat 11:00 (45 dk sonra), 09:30 ise 45 dk önce
  assert.equal(clock.format(nearestSlot(days, ist(MONDAY, "10:15"))!.startsAt), "09:30");
  assert.equal(clock.format(nearestSlot(days, ist(MONDAY, "10:40"))!.startsAt), "11:00");
  assert.equal(clock.format(nearestSlot(days, ist(MONDAY, "07:00"))!.startsAt), "09:00");
  assert.equal(nearestSlot([{ date: MONDAY, slots: [] }], ist(MONDAY, "10:00")), null);
});
