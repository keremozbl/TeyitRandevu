import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_BOOKING_RULES, parseBookingRules } from "./booking-rules.ts";

test("veritabanı varsayılanı olduğu gibi okunur", () => {
  // tenant_settings.booking_rules sütununun jsonb_build_object varsayılanı
  const fromDb = {
    min_lead_minutes: 120,
    max_advance_days: 60,
    cancel_window_minutes: 240,
    hold_minutes: 10,
  };
  assert.deepEqual(parseBookingRules(fromDb), DEFAULT_BOOKING_RULES);
});

test("kurumun kendi değerleri korunur", () => {
  const rules = parseBookingRules({ min_lead_minutes: 30, slot_step_minutes: 20 });
  assert.equal(rules.min_lead_minutes, 30);
  assert.equal(rules.slot_step_minutes, 20);
  assert.equal(rules.max_advance_days, DEFAULT_BOOKING_RULES.max_advance_days);
});

test("bozuk değer randevu sayfasını çökertmez, varsayılana düşer", () => {
  const rules = parseBookingRules({
    min_lead_minutes: "iki saat",
    max_advance_days: -3,
    hold_minutes: 10,
  });
  assert.equal(rules.min_lead_minutes, DEFAULT_BOOKING_RULES.min_lead_minutes);
  assert.equal(rules.max_advance_days, DEFAULT_BOOKING_RULES.max_advance_days);
  assert.equal(rules.hold_minutes, 10);
});

test("boş, eksik ya da hiç olmayan jsonb varsayılanı verir", () => {
  assert.deepEqual(parseBookingRules({}), DEFAULT_BOOKING_RULES);
  assert.deepEqual(parseBookingRules(null), DEFAULT_BOOKING_RULES);
  assert.deepEqual(parseBookingRules(undefined), DEFAULT_BOOKING_RULES);
  assert.deepEqual(parseBookingRules("bozuk"), DEFAULT_BOOKING_RULES);
});
