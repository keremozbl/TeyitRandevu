import assert from "node:assert/strict";
import { test } from "node:test";

import { formatPhoneTr, toE164 } from "./phone.ts";

test("resepsiyonun yazdığı her biçim aynı numaraya çevrilir", () => {
  const expected = "+905551234567";
  for (const input of [
    "0555 123 45 67",
    "05551234567",
    "(0555) 123-45-67",
    "555 123 45 67",
    "5551234567",
    "+90 555 123 45 67",
    "+905551234567",
    "00905551234567",
    "  0555.123.45.67  ",
  ]) {
    assert.equal(toE164(input), expected, input);
  }
});

test("yabancı numara ülke kodunu korur", () => {
  assert.equal(toE164("+49 30 1234567"), "+49301234567");
  assert.equal(toE164("0049301234567"), "+49301234567");
});

test("çevrilemeyen değer null döner, uydurulmaz", () => {
  assert.equal(toE164(""), null);
  assert.equal(toE164("   "), null);
  assert.equal(toE164("telefon yok"), null);
  assert.equal(toE164("123"), null);
  assert.equal(toE164("+9012345678901234567"), null);
});

test("veritabanındaki phone_e164 kısıtıyla uyumlu üretir", () => {
  const pattern = /^\+[1-9][0-9]{7,14}$/;
  for (const input of ["0555 123 45 67", "+49 30 1234567", "02123334455"]) {
    const value = toE164(input);
    assert.ok(value && pattern.test(value), input);
  }
});

test("gösterimde okunur biçime döner", () => {
  assert.equal(formatPhoneTr("+905551234567"), "0555 123 45 67");
  // Türkiye dışındaki numara olduğu gibi kalır
  assert.equal(formatPhoneTr("+49301234567"), "+49301234567");
});
