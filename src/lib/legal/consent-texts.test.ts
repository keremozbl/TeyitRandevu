import assert from "node:assert/strict";
import { test } from "node:test";

import { buildConsentBoxes, buildDisclosureText, CONSENT_VERSION } from "./consent-texts.ts";

test("sürüm rıza kaydının sütununa sığar", () => {
  // consents.text_version 40 karakterde kesiliyor; sürüm kesilirse hangi
  // metne rıza verildiği bilinemez.
  assert.ok(CONSENT_VERSION.length > 0 && CONSENT_VERSION.length <= 40);
});

test("aydınlatma ve açık rıza AYRI kutulardır", () => {
  const boxes = buildConsentBoxes("Demo Diş Kliniği");
  const kinds = boxes.map((box) => box.kind);

  assert.ok(kinds.includes("kvkk_aydinlatma"));
  assert.ok(kinds.includes("acik_riza_saglik"));
  assert.notEqual(
    kinds.indexOf("kvkk_aydinlatma"),
    kinds.indexOf("acik_riza_saglik"),
    "tek kutuya sığdırılamaz (Plan 11.4)",
  );
});

test("ticari ileti onayı isteğe bağlıdır, diğer ikisi zorunlu", () => {
  const boxes = buildConsentBoxes("Demo Diş Kliniği");
  const byKind = Object.fromEntries(boxes.map((box) => [box.kind, box]));

  assert.equal(byKind.kvkk_aydinlatma.required, true);
  assert.equal(byKind.acik_riza_saglik.required, true);
  assert.equal(byKind.ticari_ileti.required, false);
});

test("ticari ileti metni hatırlatmadan ayrıldığını söyler", () => {
  const boxes = buildConsentBoxes("Demo Diş Kliniği");
  const commercial = boxes.find((box) => box.kind === "ticari_ileti");
  assert.match(commercial!.hint, /hatırlatma/i);
});

test("her kutunun sürümü ve form alanı vardır", () => {
  const fields = new Set<string>();
  for (const box of buildConsentBoxes("Demo Diş Kliniği")) {
    assert.equal(box.version, CONSENT_VERSION);
    assert.ok(box.field.length > 0);
    fields.add(box.field);
  }
  assert.equal(fields.size, 3, "iki kutu aynı form alanını paylaşamaz");
});

test("aydınlatma metni kurum adıyla üretilir", () => {
  const text = buildDisclosureText("Demo Diş Kliniği");
  const all = text.sections
    .flatMap((section) => [...(section.paragraphs ?? []), ...(section.items ?? [])])
    .join(" ");

  assert.match(all, /Demo Diş Kliniği/);
  assert.match(all, /veri sorumlusu/i);
});

test("metin yurt dışına aktarımı ve hakları anlatır", () => {
  const text = buildDisclosureText("Demo Diş Kliniği");
  const headings = text.sections.map((section) => section.heading);

  assert.ok(headings.includes("Aktarım"), "yurt dışı aktarım anlatılmadan olmaz");
  assert.ok(headings.includes("Haklarınız"));
  assert.ok(headings.includes("Saklama süresi"));

  const transfer = text.sections.find((section) => section.heading === "Aktarım");
  assert.match(transfer!.paragraphs!.join(" "), /Frankfurt/);
});

test("iletişim bilgisi verilirse metne girer", () => {
  const withContact = buildDisclosureText("Klinik", {
    address: "Bağdat Cad. No 1",
    phone: "+902161112233",
  });
  const controller = withContact.sections[0].paragraphs!.join(" ");
  assert.match(controller, /Bağdat Cad\. No 1/);

  const without = buildDisclosureText("Klinik");
  assert.match(without.sections[0].paragraphs!.join(" "), /randevu sayfasının alt bölümünden/);
});
