import assert from "node:assert/strict";
import { test } from "node:test";

import { buildIcs, icsStamp } from "./ics.ts";

const base = {
  uid: "abc123",
  startsAt: new Date("2026-09-04T06:00:00.000Z"),
  endsAt: new Date("2026-09-04T06:30:00.000Z"),
  stamp: new Date("2026-09-03T09:15:00.000Z"),
  title: "Vitrin Diş Kliniği · Kontrol",
};

test("damga UTC ve saniye hassasiyetinde", () => {
  assert.equal(icsStamp(new Date("2026-09-04T06:00:00.000Z")), "20260904T060000Z");
});

test("zorunlu alanlar ve CRLF", () => {
  const ics = buildIcs(base);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /\r\nUID:abc123@teyitrandevu\r\n/);
  assert.match(ics, /\r\nDTSTART:20260904T060000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260904T063000Z\r\n/);
  assert.ok(!ics.includes("\n\n"));
});

test("virgül, noktalı virgül ve satır sonu kaçırılır", () => {
  const ics = buildIcs({
    ...base,
    title: "Dolgu, kontrol; ikinci seans",
    description: "İlk satır\nikinci satır",
  });
  assert.ok(ics.includes("SUMMARY:Dolgu\\, kontrol\\; ikinci seans"));
  assert.ok(ics.includes("DESCRIPTION:İlk satır\\nikinci satır"));
});

test("uzun satır 75 OKTETTE katlanır — Türkçe karakter iki bayt", () => {
  const ics = buildIcs({ ...base, title: "ğ".repeat(80) });
  const encoder = new TextEncoder();

  for (const line of ics.split("\r\n")) {
    assert.ok(
      encoder.encode(line).length <= 75,
      `satır 75 okteti aştı (${encoder.encode(line).length})`,
    );
  }

  // Katlanan satırın devamı boşlukla başlar; birleştirildiğinde metin bozulmaz.
  const unfolded = ics.replace(/\r\n /g, "");
  assert.ok(unfolded.includes(`SUMMARY:${"ğ".repeat(80)}`));
});
