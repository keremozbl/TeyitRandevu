import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fileNameFor,
  programTotals,
  sheetColumnWidths,
  toSheetRows,
  type ProgramReport,
} from "./program.ts";

const report: ProgramReport = {
  date: "2026-08-28",
  tenantName: "Demo Diş Kliniği",
  branchName: "Merkez",
  cancelledCount: 2,
  noShowCount: 1,
  groups: [
    {
      resourceId: "r1",
      resourceName: "Dt. Ayla Demir",
      entries: [
        {
          id: "a1",
          startsAt: "09:00",
          endsAt: "09:45",
          customerName: "Ayşe Yılmaz",
          customerPhone: "0555 111 22 33",
          serviceName: "Dolgu",
          status: "confirmed",
          notes: "Sol üst azı",
          price: 1250.5,
        },
        {
          id: "a2",
          startsAt: "10:00",
          endsAt: "10:30",
          customerName: null,
          customerPhone: null,
          serviceName: null,
          status: "pending",
          notes: null,
          price: null,
        },
      ],
    },
    { resourceId: "r2", resourceName: "1 No'lu Ünit", entries: [] },
  ],
};

test("toplamlar programdaki randevuları sayar", () => {
  assert.deepEqual(programTotals(report), { total: 2, pending: 1 });
});

test("boş program sıfır döner", () => {
  assert.deepEqual(programTotals({ ...report, groups: [] }), { total: 0, pending: 0 });
});

test("başlık satırı kâğıttaki sırayla", () => {
  const rows = toSheetRows(report, { withRevenue: false });
  assert.deepEqual(rows[0], [
    "Kaynak",
    "Saat",
    "Bitiş",
    "Hasta",
    "Telefon",
    "Tedavi",
    "Durum",
    "Not",
  ]);
});

test("ücret sütunu yalnızca yetkisi olana çıkar", () => {
  const withoutRevenue = toSheetRows(report, { withRevenue: false });
  const withRevenue = toSheetRows(report, { withRevenue: true });

  assert.ok(!withoutRevenue[0].includes("Ücret"));
  assert.ok(!withoutRevenue[1].includes(1250.5));

  assert.ok(withRevenue[0].includes("Ücret"));
  assert.equal(withRevenue[1][7], 1250.5);
  assert.equal(withRevenue[0].length, withoutRevenue[0].length + 1);
});

test("son sütun bilerek boş: hekim üzerine yazıyor", () => {
  const rows = toSheetRows(report, { withRevenue: false });
  // "Not" başlığı var ama değeri olmayan satırda hücre boş kalıyor
  assert.equal(rows[0].at(-1), "Not");
  assert.equal(rows[1].at(-1), "Sol üst azı");
  assert.equal(rows[2].at(-1), "");
});

test("isimsiz kayıt ve boş alanlar okunur karşılık alır", () => {
  const rows = toSheetRows(report, { withRevenue: true });
  assert.equal(rows[2][3], "İsimsiz kayıt");
  assert.equal(rows[2][4], "");
  assert.equal(rows[2][5], "");
  assert.equal(rows[2][6], "Onay bekliyor");
  assert.equal(rows[2][7], null);
});

test("randevusu olmayan kaynak satır üretmez", () => {
  const rows = toSheetRows(report, { withRevenue: false });
  assert.equal(rows.length, 3); // başlık + iki randevu
  assert.ok(!rows.some((row) => row[0] === "1 No'lu Ünit"));
});

test("sütun genişlikleri başlık sayısıyla uyuşuyor", () => {
  for (const withRevenue of [true, false]) {
    assert.equal(
      sheetColumnWidths({ withRevenue }).length,
      toSheetRows(report, { withRevenue })[0].length,
    );
  }
});

test("dosya adı okunur ve Türkçe karakter taşımıyor", () => {
  assert.equal(fileNameFor(report), "program-28-08-2026-merkez.xlsx");
  assert.equal(fileNameFor({ ...report, branchName: null }), "program-28-08-2026.xlsx");
  assert.equal(
    fileNameFor({ ...report, branchName: "Şişli Şubesi" }),
    "program-28-08-2026-sisli-subesi.xlsx",
  );
});
