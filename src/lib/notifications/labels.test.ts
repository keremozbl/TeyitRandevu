import assert from "node:assert/strict";
import { test } from "node:test";

import { describeFlowTiming, humanizeMinutes, KIND_LABELS, STATUS_LABELS } from "./labels.ts";

test("dakika insanın söylediği gibi yazılır", () => {
  assert.equal(humanizeMinutes(0), "0 dakika");
  assert.equal(humanizeMinutes(45), "45 dakika");
  assert.equal(humanizeMinutes(60), "1 saat");
  assert.equal(humanizeMinutes(90), "1 saat 30 dakika");
  assert.equal(humanizeMinutes(1440), "1 gün");
  assert.equal(humanizeMinutes(1500), "1 gün 1 saat");
});

test("negatif kayma da aynı süreyi verir", () => {
  assert.equal(humanizeMinutes(-1440), "1 gün", "yön ayrı bir kelimeyle anlatılır");
});

test("akışın zamanlaması cümleye çevrilir", () => {
  assert.equal(
    describeFlowTiming("before_start", -1440),
    "Randevudan 1 gün önce",
    "kuruma -1440 gösterilmez",
  );
  assert.equal(describeFlowTiming("before_start", -120), "Randevudan 2 saat önce");
  assert.equal(describeFlowTiming("after_end", 2880), "Randevu bitiminden 2 gün sonra");
  assert.equal(describeFlowTiming("appointment_created", 0), "Randevu oluşturulur oluşturulmaz");
  assert.equal(describeFlowTiming("no_show", 0), "Randevuya gelinmediğinde");
  assert.equal(describeFlowTiming("birthday", 0), "Hastanın doğum gününde");
});

test("her durumun bir metin etiketi var — renk tek başına anlam taşımaz", () => {
  for (const [key, value] of Object.entries(STATUS_LABELS)) {
    assert.ok(value.label.length > 0, `${key} etiketsiz`);
    assert.ok(value.tone.startsWith("text-"), `${key} rengi token değil`);
  }
});

test("hizmet bilgilendirmesi ile ticari ileti ayrı etiketlidir", () => {
  assert.notEqual(KIND_LABELS.service, KIND_LABELS.commercial);
  assert.match(KIND_LABELS.commercial, /ticari/i);
});
