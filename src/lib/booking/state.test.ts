import assert from "node:assert/strict";
import { test } from "node:test";

import { cancelState, isHoldExpired } from "./state.ts";

const at = (iso: string) => new Date(iso);

test("pencere açıkken iptal edilebilir", () => {
  const state = cancelState(
    { status: "confirmed", startsAt: at("2026-09-01T12:00:00Z"), cancelWindowMinutes: 240 },
    at("2026-09-01T06:00:00Z"),
  );
  assert.equal(state, "open");
});

test("pencere kapandıysa iptal edilemez", () => {
  const state = cancelState(
    { status: "confirmed", startsAt: at("2026-09-01T12:00:00Z"), cancelWindowMinutes: 240 },
    at("2026-09-01T09:00:00Z"),
  );
  assert.equal(state, "too_late");
});

test("pencerenin tam sınırı iptale kapalıdır", () => {
  const state = cancelState(
    { status: "pending", startsAt: at("2026-09-01T12:00:00Z"), cancelWindowMinutes: 240 },
    at("2026-09-01T08:00:00Z"),
  );
  assert.equal(state, "too_late", "eşitlik hastanın değil kliniğin lehine yorumlanır");
});

test("gelinmiş, tamamlanmış ya da iptal edilmiş randevu iptal edilmez", () => {
  for (const status of ["arrived", "completed", "no_show", "cancelled"]) {
    const state = cancelState(
      { status, startsAt: at("2026-09-05T12:00:00Z"), cancelWindowMinutes: 240 },
      at("2026-09-01T06:00:00Z"),
    );
    assert.equal(state, "closed", status);
  }
});

test("geçmiş randevu iptal penceresinin dışındadır", () => {
  const state = cancelState(
    { status: "confirmed", startsAt: at("2026-08-01T12:00:00Z"), cancelWindowMinutes: 0 },
    at("2026-09-01T06:00:00Z"),
  );
  assert.equal(state, "too_late");
});

test("tutma süresi dolduğunda saat serbesttir", () => {
  assert.equal(isHoldExpired(at("2026-09-01T12:00:00Z"), at("2026-09-01T11:59:59Z")), false);
  assert.equal(isHoldExpired(at("2026-09-01T12:00:00Z"), at("2026-09-01T12:00:00Z")), true);
  assert.equal(isHoldExpired(at("2026-09-01T12:00:00Z"), at("2026-09-01T12:00:01Z")), true);
});
