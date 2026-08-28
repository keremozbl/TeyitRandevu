import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blockedMinutes,
  describeDuration,
  formatMoney,
  moneyToInput,
  parseMoney,
} from "./pricing.ts";

test("resepsiyonun yazdığı her biçim aynı tutara çevrilir", () => {
  assert.equal(parseMoney("1250"), 1250);
  assert.equal(parseMoney("1250,50"), 1250.5);
  assert.equal(parseMoney("1.250,50"), 1250.5);
  assert.equal(parseMoney("1 250,50"), 1250.5);
  assert.equal(parseMoney("1250.50"), 1250.5);
  assert.equal(parseMoney("0"), 0);
});

test("üç haneli nokta binlik ayırıcı sayılır", () => {
  // "1.250" bin iki yüz elli demek, bir tam iki yüz elli değil
  assert.equal(parseMoney("1.250"), 1250);
  assert.equal(parseMoney("12.500"), 12500);
  // İki hane ondalıktır
  assert.equal(parseMoney("12.50"), 12.5);
});

test("kuruş ikinci haneden sonra yuvarlanır", () => {
  assert.equal(parseMoney("10,555"), 10.56);
  assert.equal(parseMoney("10,554"), 10.55);
});

test("çevrilemeyen değer null döner, sıfır uydurulmaz", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("   "), null);
  assert.equal(parseMoney("bedava"), null);
  assert.equal(parseMoney("150 TL"), null);
  assert.equal(parseMoney("-50"), null);
  assert.equal(parseMoney("99999999"), null);
});

test("gösterim tr-TR biçiminde: nokta binlik, virgül kuruş", () => {
  // Simge tr-TR'de başta duruyor; biçimi Intl belirliyor, biz uydurmuyoruz
  assert.match(formatMoney(1250.5), /1\.250,50/);
  assert.match(formatMoney(1250.5), /₺/);
  assert.match(formatMoney(0), /0,00/);
});

test("forma geri yazarken virgül kullanılır", () => {
  assert.equal(moneyToInput(1250.5), "1250,50");
  assert.equal(moneyToInput(0), "0,00");
  assert.equal(moneyToInput(null), "");
});

test("gidiş dönüş tutarı bozmuyor", () => {
  for (const value of [0, 12.5, 1250.5, 99.99]) {
    assert.equal(parseMoney(moneyToInput(value)), value);
  }
});

test("takvimde kaplanan süre tamponlarla birlikte", () => {
  const service = { durationMin: 30, bufferBeforeMin: 15, bufferAfterMin: 10 };
  assert.equal(blockedMinutes(service), 55);
  assert.equal(blockedMinutes({ durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 }), 30);
});

test("süre özeti yalnızca dolu tamponları yazar", () => {
  assert.equal(
    describeDuration({ durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 0 }),
    "30 dk",
  );
  assert.equal(
    describeDuration({ durationMin: 120, bufferBeforeMin: 15, bufferAfterMin: 20 }),
    "120 dk + 15 dk önce, 20 dk sonra",
  );
  assert.equal(
    describeDuration({ durationMin: 30, bufferBeforeMin: 0, bufferAfterMin: 15 }),
    "30 dk + 15 dk sonra",
  );
});
