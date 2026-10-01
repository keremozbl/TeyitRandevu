import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_BOOKING_RULES, type BookingRules } from "../domain/booking-rules.ts";

import {
  ANY_RESOURCE,
  bookingHref,
  decodeSlotChoice,
  eligibleResources,
  encodeSlotChoice,
  isPlainDate,
  resolveDayWindow,
  resolveSelectedDay,
  WINDOW_DAYS,
} from "./steps.ts";
import type { PublicResource, PublicService } from "./queries.ts";

const rules: BookingRules = { ...DEFAULT_BOOKING_RULES };

const resource = (id: string, branchId = "b1"): PublicResource => ({
  id,
  branchId,
  name: `Kaynak ${id}`,
  title: "Dt.",
  color: null,
  kind: "staff",
  label: `Dt. Kaynak ${id}`,
});

const service = (resourceIds: string[]): PublicService => ({
  id: "s1",
  name: "Dolgu",
  category: null,
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  price: null,
  resourceIds,
});

// -----------------------------------------------------------------------------
// bookingHref
// -----------------------------------------------------------------------------

test("bookingHref boş değerleri adrese yazmaz", () => {
  assert.equal(bookingHref("klinik", {}), "/r/klinik");
  assert.equal(
    bookingHref("klinik", { hizmet: "s1", kaynak: undefined, tarih: "" }),
    "/r/klinik?hizmet=s1",
  );
});

test("bookingHref parametreleri kodlar", () => {
  assert.equal(bookingHref("klinik", { hata: "slot_taken" }), "/r/klinik?hata=slot_taken");
});

// -----------------------------------------------------------------------------
// eligibleResources
// -----------------------------------------------------------------------------

test("hizmet-kaynak eşlemesi yoksa her kaynak hizmeti verebilir", () => {
  const resources = [resource("r1"), resource("r2")];
  assert.deepEqual(
    eligibleResources(service([]), resources).map((r) => r.id),
    ["r1", "r2"],
  );
});

test("eşleme varsa yalnız eşleşen kaynaklar kalır", () => {
  const resources = [resource("r1"), resource("r2")];
  assert.deepEqual(
    eligibleResources(service(["r2"]), resources).map((r) => r.id),
    ["r2"],
  );
});

test("başka şubenin kaynağı listeye girmez", () => {
  const resources = [resource("r1", "b1"), resource("r2", "b2")];
  assert.deepEqual(
    eligibleResources(service([]), resources, "b2").map((r) => r.id),
    ["r2"],
  );
});

// -----------------------------------------------------------------------------
// resolveDayWindow
// -----------------------------------------------------------------------------

test("şerit bugünden başlar ve iki hafta sürer", () => {
  const window = resolveDayWindow("2026-09-01", rules);
  assert.equal(window.days.length, WINDOW_DAYS);
  assert.equal(window.days[0], "2026-09-01");
  assert.equal(window.days.at(-1), "2026-09-14");
  assert.equal(window.previousStart, null, "başlangıçta geri gidilemez");
  assert.equal(window.nextStart, "2026-09-15");
});

test("geçmiş bir başlangıç istenirse bugüne çekilir", () => {
  const window = resolveDayWindow("2026-09-01", rules, "2026-08-01");
  assert.equal(window.days[0], "2026-09-01");
});

test("ileri tarih sınırı şeridi kısaltır ve ileri oku kapatır", () => {
  const window = resolveDayWindow("2026-09-01", { ...rules, max_advance_days: 3 });
  assert.deepEqual(window.days, ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]);
  assert.equal(window.nextStart, null);
});

test("geri gidilirken bugünün öncesine düşülmez", () => {
  const window = resolveDayWindow("2026-09-01", rules, "2026-09-08");
  assert.equal(window.previousStart, "2026-09-01");
});

// -----------------------------------------------------------------------------
// resolveSelectedDay
// -----------------------------------------------------------------------------

test("istenen gün şerittiyse o seçilir", () => {
  const days = [
    { date: "2026-09-01", slots: [] },
    { date: "2026-09-02", slots: [1] },
  ];
  assert.equal(resolveSelectedDay(days, "2026-09-01"), "2026-09-01");
});

test("gün istenmediyse saati olan ilk gün seçilir", () => {
  const days = [
    { date: "2026-09-01", slots: [] },
    { date: "2026-09-02", slots: [1] },
  ];
  assert.equal(resolveSelectedDay(days), "2026-09-02");
});

test("hiç saat yoksa ilk gün seçilir, null dönmez", () => {
  const days = [
    { date: "2026-09-01", slots: [] },
    { date: "2026-09-02", slots: [] },
  ];
  assert.equal(resolveSelectedDay(days), "2026-09-01");
  assert.equal(resolveSelectedDay([]), null);
});

// -----------------------------------------------------------------------------
// Saat düğmesinin değeri
// -----------------------------------------------------------------------------

test("slot seçimi gidip geri dönebilir", () => {
  const startsAt = new Date("2026-09-01T11:30:00.000Z");
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];

  const decoded = decodeSlotChoice(encodeSlotChoice(startsAt, ids));
  assert.ok(decoded);
  assert.equal(decoded.startsAt.toISOString(), startsAt.toISOString());
  assert.deepEqual(decoded.resourceIds, ids);
});

test("bozuk seçim değeri reddedilir", () => {
  assert.equal(decodeSlotChoice("2026-09-01T11:30:00.000Z"), null, "kaynak yok");
  assert.equal(decodeSlotChoice("dun|11111111-1111-4111-8111-111111111111"), null, "tarih bozuk");
  assert.equal(decodeSlotChoice("2026-09-01T11:30:00.000Z|r1"), null, "uuid değil");
  assert.equal(decodeSlotChoice(""), null);
});

test("isPlainDate yalnız gerçek takvim gününü kabul eder", () => {
  assert.equal(isPlainDate("2026-09-01"), true);
  assert.equal(isPlainDate("2026-13-01"), false);
  assert.equal(isPlainDate("01.09.2026"), false);
  assert.equal(isPlainDate(undefined), false);
});

test("ANY_RESOURCE bir uuid ile karışmaz", () => {
  assert.equal(ANY_RESOURCE, "farketmez");
  assert.equal(decodeSlotChoice(`2026-09-01T11:30:00.000Z|${ANY_RESOURCE}`), null);
});
