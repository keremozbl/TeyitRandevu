import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildVariables,
  isGsm7,
  renderTemplate,
  smsSegments,
  TEMPLATE_VARIABLES,
  type NotificationPayload,
} from "./render.ts";

const payload: NotificationPayload = {
  musteri_adi: "Ayşe Yılmaz",
  kurum_adi: "Demo Diş Kliniği",
  sube_adi: "Merkez",
  sube_telefon: "+902161112233",
  hekim_adi: "Dt. Ayla Demir",
  hizmet_adi: "Dolgu",
  baslangic: "2026-08-31T06:00:00.000Z",
  bitis: "2026-08-31T06:45:00.000Z",
  zaman_dilimi: "Europe/Istanbul",
  randevu_yolu: "/r/demo/randevu/abc",
};

// -----------------------------------------------------------------------------
// Değişkenler
// -----------------------------------------------------------------------------

test("tarih ve saat kurumun zaman diliminde üretilir", () => {
  const vars = buildVariables(payload);
  assert.equal(vars.saat, "09:00", "06:00 UTC, İstanbul'da 09:00");
  assert.equal(vars.tarih, "31 Ağustos 2026");
  assert.equal(vars.gun, "Pazartesi");
});

test("başka zaman dilimindeki şube kendi saatini gösterir", () => {
  const vars = buildVariables({ ...payload, zaman_dilimi: "Europe/London" });
  assert.equal(vars.saat, "07:00");
});

test("randevu bağlantısı site adresiyle birleşir", () => {
  const vars = buildVariables(payload, { siteUrl: "https://teyitrandevu.com/" });
  assert.equal(vars.randevu_baglantisi, "https://teyitrandevu.com/r/demo/randevu/abc");
});

test("site adresi yoksa bağlantı yolu olarak kalır, undefined olmaz", () => {
  const vars = buildVariables(payload);
  assert.equal(vars.randevu_baglantisi, "/r/demo/randevu/abc");
});

test("eksik alanlar boş string olur", () => {
  const vars = buildVariables({ musteri_adi: "Ali" });
  assert.equal(vars.hekim_adi, "");
  assert.equal(vars.saat, "");
  assert.equal(vars.randevu_baglantisi, "");
});

test("bozuk tarih mesajı çökertmez", () => {
  const vars = buildVariables({ ...payload, baslangic: "dün" });
  assert.equal(vars.tarih, "");
  assert.equal(vars.saat, "");
});

test("katalogdaki her değişkenin bir karşılığı vardır", () => {
  const vars = buildVariables(payload, { siteUrl: "https://x.test" });
  for (const variable of TEMPLATE_VARIABLES) {
    assert.ok(variable.key in vars, `${variable.key} üretilmiyor`);
  }
});

// -----------------------------------------------------------------------------
// Metin
// -----------------------------------------------------------------------------

test("şablon değişkenleri yerine değerleri konur", () => {
  const vars = buildVariables(payload);
  const result = renderTemplate(
    "Sayın {{musteri_adi}}, {{tarih}} {{saat}} randevunuz var. {{kurum_adi}}",
    vars,
  );
  assert.equal(result.text, "Sayın Ayşe Yılmaz, 31 Ağustos 2026 09:00 randevunuz var. Demo Diş Kliniği");
  assert.deepEqual(result.missing, []);
});

test("boşluklu yazım da tanınır", () => {
  const result = renderTemplate("{{ musteri_adi }}", { musteri_adi: "Ali" });
  assert.equal(result.text, "Ali");
});

test("tanınmayan değişken boş bırakılır ama bildirilir", () => {
  const result = renderTemplate("Sayın {{musterı_adi}}, hoş geldiniz", { musteri_adi: "Ali" });
  assert.equal(result.text, "Sayın, hoş geldiniz");
  assert.deepEqual(result.missing, ["musterı_adi"], "yazım hatası göndermeden önce görülmeli");
});

test("değeri boş olan değişken de eksik sayılır", () => {
  const result = renderTemplate("{{musteri_adi}} · {{hekim_adi}}", {
    musteri_adi: "Ali",
    hekim_adi: "",
  });
  assert.deepEqual(result.missing, ["hekim_adi"]);
});

test("aynı değişken iki kez geçse de bir kez bildirilir", () => {
  const result = renderTemplate("{{yok}} {{yok}}", {});
  assert.deepEqual(result.missing, ["yok"]);
});

test("şablonda değişken yoksa metin aynen kalır", () => {
  const result = renderTemplate("Randevunuzu hatırlatırız.", {});
  assert.equal(result.text, "Randevunuzu hatırlatırız.");
  assert.deepEqual(result.missing, []);
});

// -----------------------------------------------------------------------------
// SMS parçası — Türkçe karakter faturayı ikiye katlar
// -----------------------------------------------------------------------------

test("Türkçe harfler mesajı UCS-2'ye düşürür", () => {
  assert.equal(isGsm7("Randevunuz var"), true);
  assert.equal(isGsm7("Randevunuz yarın"), false, "ı GSM-7'de yok");
  assert.equal(isGsm7("Sağlık"), false, "ğ GSM-7'de yok");
  assert.equal(isGsm7("Öğün"), false);
  assert.equal(isGsm7("Çağrı merkezi"), false);
});

test("GSM-7 metin 160 karaktere kadar tek parça", () => {
  assert.deepEqual(smsSegments("A".repeat(160)), { segments: 1, encoding: "gsm7" });
  assert.deepEqual(smsSegments("A".repeat(161)), { segments: 2, encoding: "gsm7" });
});

test("Türkçe metin 70 karakterde parçalanır", () => {
  const short = "ı".repeat(70);
  const long = "ı".repeat(71);
  assert.deepEqual(smsSegments(short), { segments: 1, encoding: "ucs2" });
  assert.deepEqual(smsSegments(long), { segments: 2, encoding: "ucs2" });
});

test("boş metin parça saymaz", () => {
  assert.equal(smsSegments("").segments, 0);
});

test("genişletilmiş tablodaki karakter iki yer kaplar", () => {
  // 80 tane '€' = 160 birim → tam bir parça
  assert.equal(smsSegments("€".repeat(80)).segments, 1);
  assert.equal(smsSegments("€".repeat(81)).segments, 2);
});
