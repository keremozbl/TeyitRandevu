import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * Hangi sektörde tıbbi not tutulacağı bir ürün tercihi değil, hukuki bir
 * sınır: tıbbi veri KVKK md. 6'da özel nitelikli kişisel veri. Berberin müşteri
 * kartında "Tıbbi notlar" bölümü açmak, toplaması için dayanağı olmayan bir
 * veriyi davet etmektir.
 *
 * Karar `sector.ts` içinde değil şablonda yazılı (`modules: ["medical_notes"]`),
 * çünkü yeni sektör eklemek kod değiştirmeden bir JSON dosyası koymaktır. Bu
 * dosya da o kuralın şablonlarda tutarlı kalmasını sınıyor: yeni bir sağlık
 * sektörü modülü unutulursa ya da berbere yanlışlıkla eklenirse test düşer.
 *
 * Şablonlar `templates.test.ts` gibi diskten okunuyor: `index.ts` JSON import
 * ettiği için düz `node --test` altında çözülemiyor.
 */

const DIR = path.join(import.meta.dirname, "..", "templates");

type Sablon = { key: string; family: string; modules: string[] };

const sablonlar: Sablon[] = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Sablon);

test("şablonlar okundu", () => {
  assert.ok(sablonlar.length >= 6, `şablon bulunamadı (${sablonlar.length})`);
});

test("sağlık ailesindeki her sektör tıbbi not tutar", () => {
  for (const s of sablonlar.filter((s) => s.family === "saglik")) {
    assert.ok(
      s.modules.includes("medical_notes"),
      `${s.key}: sağlık sektörü ama medical_notes modülü yok`,
    );
  }
});

test("sağlık dışındaki hiçbir sektörde tıbbi not yok", () => {
  for (const s of sablonlar.filter((s) => s.family !== "saglik")) {
    assert.ok(
      !s.modules.includes("medical_notes"),
      `${s.key}: sağlık sektörü değil ama medical_notes modülü var`,
    );
  }
});

test("modül anahtarları tekrarsız ve boş değil", () => {
  for (const s of sablonlar) {
    assert.equal(new Set(s.modules).size, s.modules.length, `${s.key}: modül tekrarı`);
    for (const m of s.modules) {
      assert.match(m, /^[a-z][a-z0-9_]*$/, `${s.key}: geçersiz modül anahtarı "${m}"`);
    }
  }
});
