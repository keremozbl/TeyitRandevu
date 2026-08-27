import assert from "node:assert/strict";
import { test } from "node:test";

import {
  hasExtraRanges,
  normalizeTime,
  rowsToWeek,
  summarizeWeek,
  validateWeek,
  weekToRows,
  type DayHours,
} from "./hours.ts";

/** Pzt–Cum 09:00–12:30 ve 13:30–18:00 çalışan bir hekim. */
const weekdayRows = [1, 2, 3, 4, 5].flatMap((weekday) => [
  { weekday, starts_at: "09:00:00", ends_at: "12:30:00" },
  { weekday, starts_at: "13:30:00", ends_at: "18:00:00" },
]);

const day = (weekday: number, ...ranges: [string, string][]): DayHours => ({
  weekday,
  ranges: ranges.map(([startsAt, endsAt]) => ({ startsAt, endsAt })),
});

test("veritabanının saat biçimi forma uyar", () => {
  assert.equal(normalizeTime("09:00:00"), "09:00");
  assert.equal(normalizeTime("9:00"), "09:00");
  assert.equal(normalizeTime(""), "");
  assert.equal(normalizeTime(null), "");
  assert.equal(normalizeTime("25:00"), "");
  assert.equal(normalizeTime("öğlen"), "");
});

test("satırlar haftaya dönerken pazartesiden başlar ve sıraya girer", () => {
  const week = rowsToWeek([
    { weekday: 1, starts_at: "13:30:00", ends_at: "18:00:00" },
    { weekday: 1, starts_at: "09:00:00", ends_at: "12:30:00" },
    { weekday: 0, starts_at: "10:00:00", ends_at: "14:00:00" },
  ]);
  assert.deepEqual(
    week.map((d) => d.weekday),
    [1, 2, 3, 4, 5, 6, 0],
  );
  assert.deepEqual(week[0].ranges, [
    { startsAt: "09:00", endsAt: "12:30" },
    { startsAt: "13:30", endsAt: "18:00" },
  ]);
  assert.deepEqual(week[6].ranges, [{ startsAt: "10:00", endsAt: "14:00" }]);
  assert.deepEqual(week[1].ranges, []);
});

test("hafta satırlara dönerken boş günler satır üretmez", () => {
  const rows = weekToRows(rowsToWeek(weekdayRows));
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { weekday: 1, starts_at: "09:00", ends_at: "12:30" });
  assert.ok(rows.every((row) => row.weekday >= 1 && row.weekday <= 5));
});

test("gidiş dönüş veriyi bozmuyor", () => {
  const week = rowsToWeek(weekdayRows);
  assert.deepEqual(rowsToWeek(weekToRows(week).map((r) => ({ ...r }))), week);
});

test("geçerli hafta hata vermez, boş hafta da geçerlidir", () => {
  assert.equal(validateWeek(rowsToWeek(weekdayRows)), null);
  assert.equal(validateWeek(rowsToWeek([])), null);
});

test("yarım aralık reddedilir ve hangi gün olduğu söylenir", () => {
  const bad = validateWeek([day(3, ["09:00", ""])]);
  assert.match(bad ?? "", /Çarşamba/);
  assert.match(bad ?? "", /başlangıcı hem bitişi/);
});

test("bitiş başlangıçtan önce olamaz", () => {
  assert.match(validateWeek([day(1, ["18:00", "09:00"])]) ?? "", /bitiş saati/i);
  assert.match(validateWeek([day(1, ["09:00", "09:00"])]) ?? "", /bitiş saati/i);
});

test("aynı günün aralıkları çakışamaz", () => {
  const clash = validateWeek([day(5, ["09:00", "13:00"], ["12:00", "18:00"])]);
  assert.match(clash ?? "", /Cuma/);
  assert.match(clash ?? "", /çakışıyor/);
  // Uç uca değen aralıklar sorun değil
  assert.equal(validateWeek([day(5, ["09:00", "13:00"], ["13:00", "18:00"])]), null);
});

test("bozuk saat biçimi kaydedilmez", () => {
  assert.match(validateWeek([day(2, ["9", "18:00"])]) ?? "", /okunamadı/);
});

test("özet ardışık günleri birleştirir", () => {
  assert.equal(
    summarizeWeek(rowsToWeek(weekdayRows)),
    "Pzt–Cum 09:00–12:30, 13:30–18:00",
  );
});

test("özet farklı günü ayrı yazar", () => {
  const week = rowsToWeek([
    ...weekdayRows,
    { weekday: 6, starts_at: "10:00:00", ends_at: "14:00:00" },
  ]);
  assert.equal(
    summarizeWeek(week),
    "Pzt–Cum 09:00–12:30, 13:30–18:00 · Cts 10:00–14:00",
  );
});

test("iki günlük grup tire yerine virgülle yazılır", () => {
  const week = rowsToWeek([
    { weekday: 1, starts_at: "09:00:00", ends_at: "18:00:00" },
    { weekday: 2, starts_at: "09:00:00", ends_at: "18:00:00" },
  ]);
  assert.equal(summarizeWeek(week), "Pzt, Sal 09:00–18:00");
});

test("hiç saat yoksa özet bunu söyler", () => {
  assert.equal(summarizeWeek(rowsToWeek([])), "Çalışma saati girilmemiş");
});

test("formun gösteremeyeceği fazla aralık fark edilir", () => {
  const week = rowsToWeek([
    { weekday: 1, starts_at: "09:00:00", ends_at: "10:00:00" },
    { weekday: 1, starts_at: "11:00:00", ends_at: "12:00:00" },
    { weekday: 1, starts_at: "13:00:00", ends_at: "14:00:00" },
  ]);
  assert.equal(hasExtraRanges(week), true);
  assert.equal(hasExtraRanges(rowsToWeek(weekdayRows)), false);
});
