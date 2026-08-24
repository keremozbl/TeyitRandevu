import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addDays,
  datesBetween,
  minutesIntoDay,
  parsePlainTime,
  utcToPlainDate,
  weekdayOf,
  zonedTimeToUtc,
} from "./time.ts";

const IST = "Europe/Istanbul";
const BERLIN = "Europe/Berlin";

test("Türkiye sabit UTC+3: yaz ve kış aynı kaymayı verir", () => {
  assert.equal(zonedTimeToUtc("2026-08-24", "09:00", IST).toISOString(), "2026-08-24T06:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-01-15", "09:00", IST).toISOString(), "2026-01-15T06:00:00.000Z");
});

test("saniyeli Postgres time değeri okunur", () => {
  assert.equal(
    zonedTimeToUtc("2026-08-24", "18:30:00", IST).toISOString(),
    "2026-08-24T15:30:00.000Z",
  );
});

test("gün sonu 24:00 ertesi güne taşar", () => {
  assert.deepEqual(parsePlainTime("24:00:00"), { hour: 24, minute: 0, second: 0 });
  assert.equal(zonedTimeToUtc("2026-08-24", "24:00", IST).toISOString(), "2026-08-24T21:00:00.000Z");
});

test("yaz saati olan dilimde aynı duvar saati farklı UTC anıdır", () => {
  // Berlin kışın UTC+1, yazın UTC+2
  assert.equal(zonedTimeToUtc("2026-01-15", "09:00", BERLIN).toISOString(), "2026-01-15T08:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-07-15", "09:00", BERLIN).toISOString(), "2026-07-15T07:00:00.000Z");
});

test("saatin ileri alındığı gecede var olmayan saat boşluğun sonuna düşer", () => {
  // 29 Mart 2026, 02:00 -> 03:00. 02:30 yerel saati hiç yaşanmaz.
  assert.equal(zonedTimeToUtc("2026-03-29", "01:30", BERLIN).toISOString(), "2026-03-29T00:30:00.000Z");
  assert.equal(zonedTimeToUtc("2026-03-29", "03:30", BERLIN).toISOString(), "2026-03-29T01:30:00.000Z");
  assert.equal(zonedTimeToUtc("2026-03-29", "02:30", BERLIN).toISOString(), "2026-03-29T01:30:00.000Z");
});

test("saatin geri alındığı gecede iki kez yaşanan saat kış saatine denk gelir", () => {
  // 25 Ekim 2026, 03:00 -> 02:00. 02:30 iki kez yaşanır: 00:30Z ve 01:30Z.
  assert.equal(zonedTimeToUtc("2026-10-25", "02:30", BERLIN).toISOString(), "2026-10-25T01:30:00.000Z");
});

test("UTC anı kurumun takvim gününe çevrilir", () => {
  // İstanbul'da gece yarısını geçmiş, UTC'de hâlâ önceki gün
  assert.equal(utcToPlainDate(new Date("2026-08-23T21:30:00Z"), IST), "2026-08-24");
  assert.equal(utcToPlainDate(new Date("2026-08-23T20:30:00Z"), IST), "2026-08-23");
});

test("gün içi dakika kurumun saatine göre hesaplanır", () => {
  assert.equal(minutesIntoDay(new Date("2026-08-24T06:45:00Z"), IST), 9 * 60 + 45);
});

test("haftanın günü Postgres dow ile aynı: 0 = pazar", () => {
  assert.equal(weekdayOf("2026-08-23"), 0);
  assert.equal(weekdayOf("2026-08-24"), 1);
  assert.equal(weekdayOf("2026-08-29"), 6);
});

test("gün ekleme ay ve yıl sınırını geçer", () => {
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("tarih aralığı iki ucu da kapsar", () => {
  assert.deepEqual(datesBetween("2026-08-24", "2026-08-26"), [
    "2026-08-24",
    "2026-08-25",
    "2026-08-26",
  ]);
  assert.deepEqual(datesBetween("2026-08-24", "2026-08-24"), ["2026-08-24"]);
  assert.deepEqual(datesBetween("2026-08-25", "2026-08-24"), []);
});

test("geçersiz girdi sessizce geçmez", () => {
  assert.throws(() => zonedTimeToUtc("24.08.2026", "09:00", IST), /Geçersiz tarih/);
  assert.throws(() => zonedTimeToUtc("2026-08-24", "9", IST), /Geçersiz saat/);
  assert.throws(() => datesBetween("2020-01-01", "2026-01-01"), /fazla geniş/);
});
