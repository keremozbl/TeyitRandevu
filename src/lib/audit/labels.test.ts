import assert from "node:assert/strict";
import { test } from "node:test";

import { detailText, fieldLabel, summarize } from "./labels.ts";

test("eylem ve varlık çifti Türkçe cümleye çevrilir", () => {
  assert.equal(summarize("read", "customer"), "hasta kartını açtı");
  assert.equal(summarize("read", "customer_medical_note"), "tıbbi notları okudu");
  assert.equal(summarize("export", "report"), "raporu dosya olarak indirdi");
});

test("bilinmeyen çift gizlenmez, teknik hâliyle gösterilir", () => {
  assert.equal(summarize("read", "appointment"), "read · appointment");
});

test("esnek alan anahtarı ön ekinden arındırılır", () => {
  assert.equal(fieldLabel("phone"), "telefon");
  assert.equal(fieldLabel("alan:kan_grubu"), "kan_grubu");
  assert.equal(fieldLabel("bilinmeyen_sutun"), "bilinmeyen_sutun");
});

test("değişen alanlar ayrıntı satırında Türkçeleşir", () => {
  assert.equal(
    detailText({ fields: ["phone", "birth_date", "alan:kan_grubu"] }),
    "telefon, doğum tarihi, kan_grubu",
  );
});

test("dışa aktarım ayrıntısı hangi rapor, hangi gün ve kaç satır olduğunu söyler", () => {
  assert.equal(
    detailText({ report: "program", date: "2026-09-01", branch: "Merkez", rows: 12, revenue: true }),
    "günün programı · 2026-09-01 · Merkez · 12 satır · ücret sütunuyla",
  );
});

test("ayrıntı yoksa satır ikinci satır çizmez", () => {
  assert.equal(detailText(null), null);
  assert.equal(detailText({}), null);
  assert.equal(detailText({ fields: [] }), null);
});
