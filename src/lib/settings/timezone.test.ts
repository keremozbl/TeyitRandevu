import assert from "node:assert/strict";
import { test } from "node:test";

import { describeTimeZone, isValidTimeZone, timeZoneOptions } from "./timezone.ts";

test("tanınan zaman dilimi kabul edilir", () => {
  assert.equal(isValidTimeZone("Europe/Istanbul"), true);
  assert.equal(isValidTimeZone("UTC"), true);
  assert.equal(isValidTimeZone("  Europe/Berlin  "), true);
});

test("tanınmayan değer reddedilir — sessizce kaymasın", () => {
  assert.equal(isValidTimeZone(""), false);
  assert.equal(isValidTimeZone("   "), false);
  assert.equal(isValidTimeZone("Türkiye"), false);
  assert.equal(isValidTimeZone("Europe/Istanbulll"), false);
  // Intl ham ofseti kabul ediyor ama biz etmiyoruz: sabit ofset yaz saatini bilmez
  assert.equal(isValidTimeZone("+03:00"), false);
  assert.equal(isValidTimeZone("GMT+3"), false);
});

test("kayıtlı değer listede yoksa başa eklenir", () => {
  const options = timeZoneOptions("Asia/Tokyo");
  assert.equal(options[0], "Asia/Tokyo");
  assert.ok(options.includes("Europe/Istanbul"));
});

test("kayıtlı değer zaten listedeyse tekrarlanmaz", () => {
  const options = timeZoneOptions("Europe/Istanbul");
  assert.equal(options.filter((zone) => zone === "Europe/Istanbul").length, 1);
});

test("boş değer listeyi bozmaz", () => {
  assert.deepEqual(timeZoneOptions(""), timeZoneOptions("   "));
  assert.equal(timeZoneOptions("")[0], "Europe/Istanbul");
});

test("gösterimde ofset yazar", () => {
  const yaz = new Date("2026-07-01T12:00:00Z");
  assert.match(describeTimeZone("Europe/Istanbul", yaz), /^Europe\/Istanbul \(GMT\+03:00\)$/);
  // Yaz saati uygulayan bir dilimde ofset mevsime göre değişir
  assert.match(describeTimeZone("Europe/London", yaz), /GMT\+01:00/);
  assert.match(describeTimeZone("Europe/London", new Date("2026-01-01T12:00:00Z")), /GMT([+-]00:00)?/);
});

test("bozuk dilim gösterimde de çökmez", () => {
  assert.equal(describeTimeZone("Türkiye"), "Türkiye");
});
