import assert from "node:assert/strict";
import { test } from "node:test";

import { bookingErrorMessage, formatDayChip, formatDuration, formatTime } from "./messages.ts";

test("süre insanın söylediği gibi yazılır", () => {
  assert.equal(formatDuration(45), "45 dakika");
  assert.equal(formatDuration(60), "1 saat");
  assert.equal(formatDuration(120), "2 saat");
  assert.equal(formatDuration(90), "1 saat 30 dakika");
  assert.equal(formatDuration(0), "0 dakika");
});

test("hata mesajı çıkışı da söyler", () => {
  assert.match(bookingErrorMessage("slot_taken"), /başka bir saat/i);
  assert.match(bookingErrorMessage("too_soon", { minLeadMinutes: 120 }), /2 saat/);
  assert.match(bookingErrorMessage("too_far", { maxAdvanceDays: 60 }), /60 gün/);
  const cancelWindow = bookingErrorMessage("cancel_window", { cancelWindowMinutes: 240 });
  assert.match(cancelWindow, /4 saat/);
  assert.match(cancelWindow, /arayın/i);
});

test("ayrıntı verilmezse mesaj yine anlamlı kalır", () => {
  assert.match(bookingErrorMessage("too_soon"), /ileri bir saat/i);
});

test("tanınmayan kod uygulamayı kilitlemez", () => {
  assert.match(bookingErrorMessage("kimbilir"), /beklenmeyen/i);
  assert.match(bookingErrorMessage(undefined), /beklenmeyen/i);
});

test("saat kurumun zaman diliminde gösterilir", () => {
  const instant = new Date("2026-09-01T06:30:00Z");
  assert.equal(formatTime(instant, "Europe/Istanbul"), "09:30");
  assert.equal(formatTime(instant, "UTC"), "06:30");
});

test("gün etiketi zaman dilimi yüzünden kaymaz", () => {
  // Gece yarısına yakın bir gün: PlainDate zaten yerel takvimde.
  const chip = formatDayChip("2026-09-01");
  assert.match(chip.weekday, /Sal/i);
  assert.match(chip.day, /1 Eyl/);
});
