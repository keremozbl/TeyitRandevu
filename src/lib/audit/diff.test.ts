import assert from "node:assert/strict";
import { test } from "node:test";

import { changedCustomFields, changedFields } from "./diff.ts";

test("yalnızca değişen alanların adı döner", () => {
  const before = { full_name: "Ayşe Yılmaz", phone: "+905321112233", notes: null };
  const after = { full_name: "Ayşe Yılmaz", phone: "+905329998877", notes: null };
  assert.deepEqual(changedFields(before, after), ["phone"]);
});

test("null ile undefined aynı sayılır: form boş alanı göndermeyince değişiklik yazılmaz", () => {
  assert.deepEqual(changedFields({ email: null }, { email: undefined }), []);
  assert.deepEqual(changedFields({ email: undefined }, { email: null }), []);
});

test("boş metne düşen bir alan değişiklik sayılır", () => {
  assert.deepEqual(changedFields({ email: "a@b.c" }, { email: null }), ["email"]);
});

test("etiket dizisi sıraya duyarlı karşılaştırılır", () => {
  assert.deepEqual(changedFields({ tags: ["vip"] }, { tags: ["vip"] }), []);
  assert.deepEqual(changedFields({ tags: ["vip"] }, { tags: ["vip", "borçlu"] }), ["tags"]);
});

test("sayı ile metin hâlindeki aynı değer değişiklik değildir", () => {
  // Form alanları metin döner; veritabanından sayı gelir. Aradaki tip farkı
  // "değişti" diye kaydedilirse denetim listesi gerçek değişikliği gizler.
  assert.deepEqual(changedFields({ age: 32 }, { age: "32" }), []);
});

test("değerin kendisi asla dönmez, yalnızca alan adı", () => {
  const changed = changedFields({ phone: "+905321112233" }, { phone: "+905329998877" });
  assert.deepEqual(changed, ["phone"]);
  assert.ok(!changed.join(" ").includes("905"));
});

test("esnek alanlar alan: ön ekiyle işaretlenir", () => {
  assert.deepEqual(
    changedCustomFields({ kan_grubu: "A Rh+" }, { kan_grubu: "0 Rh-", tckn: "" }),
    ["alan:kan_grubu"],
  );
});
