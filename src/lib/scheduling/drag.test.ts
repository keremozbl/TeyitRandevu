import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blockBand,
  draggedStart,
  isMoved,
  pixelsToMinutes,
  resizedDuration,
  snapToStep,
  type GridBounds,
} from "./drag.ts";

/** 08:00–20:00 arası bir gün, 15 dakikalık adım. */
const bounds: GridBounds = { fromMinutes: 8 * 60, toMinutes: 20 * 60, stepMinutes: 15 };

test("adıma oturtma en yakına gider, yarıda yukarı yuvarlar", () => {
  assert.equal(snapToStep(547, 15), 540); // 09:07 → 09:00
  assert.equal(snapToStep(553, 15), 555); // 09:13 → 09:15
  assert.equal(snapToStep(547.5, 15), 555);
  assert.equal(snapToStep(540, 15), 540);
});

test("piksel dakikaya ölçekle çevrilir", () => {
  // 30 dakika = 44px → dakika başına 44/30. Kayan nokta tam eşitlik vermez;
  // ölçek zaten adıma oturtulmadan önce kullanılıyor.
  const pxPerMinute = 44 / 30;
  assert.ok(Math.abs(pixelsToMinutes(44, pxPerMinute) - 30) < 1e-9);
  assert.ok(Math.abs(pixelsToMinutes(-22, pxPerMinute) + 15) < 1e-9);
});

test("taşıma adıma oturur", () => {
  const start = draggedStart({
    startMinutes: 9 * 60,
    durationMinutes: 30,
    deltaMinutes: 7,
    bounds,
  });
  assert.equal(start, 9 * 60); // 7 dakikalık titreme randevuyu kaydırmaz

  assert.equal(
    draggedStart({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: 20, bounds }),
    9 * 60 + 15,
  );
});

test("taşıma ızgaranın dışına çıkmaz", () => {
  assert.equal(
    draggedStart({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: -600, bounds }),
    bounds.fromMinutes,
  );
  // Aşağı sürüklenirse randevu kuyruğundan tutulur: bitiş ızgaranın altına taşmaz
  assert.equal(
    draggedStart({ startMinutes: 19 * 60, durationMinutes: 45, deltaMinutes: 600, bounds }),
    bounds.toMinutes - 45,
  );
});

test("ızgaradan uzun randevu üst sınıra yapışır, sıfır yüksekliğe düşmez", () => {
  const start = draggedStart({
    startMinutes: 8 * 60,
    durationMinutes: 24 * 60,
    deltaMinutes: 120,
    bounds,
  });
  assert.equal(start, bounds.fromMinutes);
});

test("kenardan uzatma bitişi oturtur, başlangıcı yerinde bırakır", () => {
  assert.equal(
    resizedDuration({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: 18, bounds }),
    45,
  );
  // Yarım adımdan küçük geri çekme bitişi oynatmaz
  assert.equal(
    resizedDuration({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: -5, bounds }),
    30,
  );
  assert.equal(
    resizedDuration({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: -10, bounds }),
    15,
  );
});

test("uzatma bir adımın altına inemez", () => {
  assert.equal(
    resizedDuration({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: -600, bounds }),
    15,
  );
});

test("uzatma ızgaranın alt sınırında durur", () => {
  assert.equal(
    resizedDuration({ startMinutes: 19 * 60, durationMinutes: 30, deltaMinutes: 600, bounds }),
    60,
  );
});

test("beş dakikalık adımda alt sınır beş dakikadır", () => {
  const fine: GridBounds = { ...bounds, stepMinutes: 5 };
  assert.equal(
    resizedDuration({ startMinutes: 9 * 60, durationMinutes: 30, deltaMinutes: -600, bounds: fine }),
    5,
  );
});

test("yerinde bırakılan randevu değişmemiş sayılır", () => {
  const before = { startMinutes: 540, durationMinutes: 30, resourceId: "a" };
  assert.equal(isMoved(before, { ...before }), false);
  assert.equal(isMoved(before, { ...before, startMinutes: 555 }), true);
  assert.equal(isMoved(before, { ...before, durationMinutes: 45 }), true);
  assert.equal(isMoved(before, { ...before, resourceId: "b" }), true);
});

test("blok bandı ızgaranın üstünden ve altından kırpılır", () => {
  const pxPerMinute = 44 / 30;
  assert.deepEqual(
    blockBand({ startMinutes: 9 * 60, durationMinutes: 30, bounds, pxPerMinute }),
    { top: 88, height: 44 },
  );
  // Izgaradan önce başlayan randevu üstten kırpılır, yüksekliği kısalır
  assert.deepEqual(
    blockBand({ startMinutes: 7 * 60 + 30, durationMinutes: 60, bounds, pxPerMinute }),
    { top: 0, height: 44 },
  );
  // Izgaradan sonra biten randevu alttan kırpılır
  assert.deepEqual(
    blockBand({ startMinutes: 19 * 60 + 30, durationMinutes: 120, bounds, pxPerMinute }),
    { top: 1012, height: 44 },
  );
  // Tamamen dışarıda kalan randevu yer kaplamaz
  assert.equal(
    blockBand({ startMinutes: 22 * 60, durationMinutes: 30, bounds, pxPerMinute }).height,
    0,
  );
});
