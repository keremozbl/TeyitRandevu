import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ageFrom,
  customDataFrom,
  formatFieldValue,
  parseOptions,
  visibleFields,
  type FieldDefinition,
} from "./fields.ts";

const field = (over: Partial<FieldDefinition> = {}): FieldDefinition => ({
  key: "tckn",
  label: "T.C. Kimlik No",
  kind: "text",
  isRequired: false,
  isMedical: false,
  options: [],
  ...over,
});

const kanGrubu = field({
  key: "kan_grubu",
  label: "Kan Grubu",
  kind: "select",
  isMedical: true,
  options: [
    { value: "A Rh+", label: "A Rh+" },
    { value: "0 Rh-", label: "0 Rh-" },
  ],
});

test("seçenekler hem düz metin hem nesne dizisinden okunur", () => {
  assert.deepEqual(parseOptions(["A Rh+", "0 Rh-"]), [
    { value: "A Rh+", label: "A Rh+" },
    { value: "0 Rh-", label: "0 Rh-" },
  ]);
  assert.deepEqual(parseOptions([{ value: "a", label: "A tipi" }]), [
    { value: "a", label: "A tipi" },
  ]);
  // Etiketsiz nesne değerin kendisiyle etiketlenir
  assert.deepEqual(parseOptions([{ value: "a" }]), [{ value: "a", label: "a" }]);
});

test("bozuk seçenek listesi kartı çökertmez", () => {
  assert.deepEqual(parseOptions(null), []);
  assert.deepEqual(parseOptions("A Rh+"), []);
  assert.deepEqual(parseOptions([" ", 42, {}, { label: "etiket" }]), []);
});

test("tıbbi alanlar yetkisi olmayana hiç gösterilmez", () => {
  const definitions = [field(), kanGrubu];
  assert.deepEqual(
    visibleFields(definitions, false).map((f) => f.key),
    ["tckn"],
  );
  assert.deepEqual(
    visibleFields(definitions, true).map((f) => f.key),
    ["tckn", "kan_grubu"],
  );
});

test("değerler türüne göre okunur metne döner", () => {
  assert.equal(formatFieldValue(kanGrubu, "A Rh+"), "A Rh+");
  assert.equal(formatFieldValue(field({ kind: "boolean" }), true), "Evet");
  assert.equal(formatFieldValue(field({ kind: "boolean" }), false), "Hayır");
  assert.equal(formatFieldValue(field({ kind: "number" }), 3), "3");
  assert.equal(
    formatFieldValue(field({ kind: "multiselect" }), ["A Rh+", "0 Rh-"]),
    "A Rh+, 0 Rh-",
  );
});

test("boş değer null döner; kart '—' basar, 'undefined' değil", () => {
  assert.equal(formatFieldValue(field(), null), null);
  assert.equal(formatFieldValue(field(), ""), null);
  assert.equal(formatFieldValue(field(), undefined), null);
  assert.equal(formatFieldValue(field({ kind: "multiselect" }), []), null);
});

test("seçenek etiketi değerin yerine geçer, tanınmayan değer ham kalır", () => {
  const kod = field({
    kind: "select",
    options: [{ value: "a", label: "A tipi" }],
  });
  assert.equal(formatFieldValue(kod, "a"), "A tipi");
  assert.equal(formatFieldValue(kod, "eskiden_kalma"), "eskiden_kalma");
});

test("tarih tr-TR biçimine döner, bozuksa olduğu gibi kalır", () => {
  assert.equal(formatFieldValue(field({ kind: "date" }), "1990-04-05"), "5 Nis 1990");
  assert.equal(formatFieldValue(field({ kind: "date" }), "bozuk"), "bozuk");
});

test("form gönderisi yalnızca tanımlı alanları yazar", () => {
  const gonderi: Record<string, string> = {
    tckn: "12345678901",
    kan_grubu: "A Rh+",
    tanimsiz_alan: "sızmasın",
  };
  assert.deepEqual(
    customDataFrom([field(), kanGrubu], (key) => gonderi[key] ?? null),
    { tckn: "12345678901", kan_grubu: "A Rh+" },
  );
});

test("boş bırakılan alan anahtar bile açmaz", () => {
  assert.deepEqual(customDataFrom([field(), kanGrubu], () => ""), {});
  assert.deepEqual(customDataFrom([field()], () => null), {});
});

test("seçenek listesi dışındaki değer kabul edilmez", () => {
  assert.deepEqual(customDataFrom([kanGrubu], () => "C Rh+"), {});
  assert.deepEqual(customDataFrom([kanGrubu], () => "0 Rh-"), { kan_grubu: "0 Rh-" });
});

test("işaretlenmemiş kutu yazılmaz: 'hayır' ile 'cevaplanmadı' aynı değil", () => {
  const hamilelik = field({ key: "hamilelik", kind: "boolean", isMedical: true });
  assert.deepEqual(customDataFrom([hamilelik], () => null), {});
  assert.deepEqual(customDataFrom([hamilelik], () => "on"), { hamilelik: true });
});

test("sayı virgüllü de yazılsa sayıya döner, harf yazılırsa yazılmaz", () => {
  const doz = field({ key: "doz", kind: "number" });
  assert.deepEqual(customDataFrom([doz], () => "2,5"), { doz: 2.5 });
  assert.deepEqual(customDataFrom([doz], () => "iki"), {});
});

test("çoklu seçim dizi olarak yazılır, boşlar atılır", () => {
  const alerji = field({
    key: "alerji",
    kind: "multiselect",
    options: [
      { value: "penisilin", label: "Penisilin" },
      { value: "lateks", label: "Lateks" },
    ],
  });
  assert.deepEqual(customDataFrom([alerji], () => ["penisilin", "", "lateks"]), {
    alerji: ["penisilin", "lateks"],
  });
  assert.deepEqual(customDataFrom([alerji], () => []), {});
});

test("yaş doğum gününden önce bir eksiktir", () => {
  const bugun = new Date("2026-08-27T09:00:00Z");
  assert.equal(ageFrom("1990-08-26", bugun), 36);
  assert.equal(ageFrom("1990-08-27", bugun), 36);
  assert.equal(ageFrom("1990-08-28", bugun), 35);
});

test("bozuk ya da imkânsız doğum tarihi yaş üretmez", () => {
  const bugun = new Date("2026-08-27T09:00:00Z");
  assert.equal(ageFrom("", bugun), null);
  assert.equal(ageFrom("27.08.1990", bugun), null);
  assert.equal(ageFrom("2030-01-01", bugun), null);
  assert.equal(ageFrom("1800-01-01", bugun), null);
});
