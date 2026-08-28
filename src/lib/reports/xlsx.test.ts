import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateRawSync } from "node:zlib";

import { buildXlsx, columnName, escapeXml, sheetName } from "./xlsx.ts";

/** Ürettiğimiz ZIP'i merkezî dizininden okur — dosya gerçekten açılabiliyor mu. */
function readZip(buffer: Buffer): Map<string, string> {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.notEqual(end, -1, "EOCD kaydı yok");

  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const files = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, "merkezî dizin imzası bozuk");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    assert.equal(buffer.readUInt32LE(localOffset), 0x04034b50, `${name}: yerel başlık bozuk`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    files.set(name, method === 8 ? inflateRawSync(data).toString("utf8") : data.toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

const sheet = {
  name: "Program",
  columnWidths: [8, 24],
  rows: [
    ["Saat", "Hasta", "Ücret"],
    ["09:00", "Ayşe Yılmaz & kızı", 1250.5],
    ["09:30", "<script>", null],
  ],
};

test("üretilen dosya geçerli bir ZIP ve beş parça içeriyor", () => {
  const files = readZip(buildXlsx(sheet));
  assert.deepEqual(
    [...files.keys()].sort(),
    [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ],
  );
});

test("hücreler doğru referansla yazılıyor", () => {
  const sheetXml = readZip(buildXlsx(sheet)).get("xl/worksheets/sheet1.xml") ?? "";
  assert.match(sheetXml, /<row r="1">/);
  assert.match(sheetXml, /<c r="A1" t="inlineStr">/);
  assert.match(sheetXml, /<c r="B2" t="inlineStr">/);
  // Sayı metin olarak değil sayı olarak yazılır, yoksa Excel toplayamaz
  assert.match(sheetXml, /<c r="C2"><v>1250\.5<\/v><\/c>/);
});

test("boş hücre hiç yazılmaz", () => {
  const sheetXml = readZip(buildXlsx(sheet)).get("xl/worksheets/sheet1.xml") ?? "";
  assert.ok(!sheetXml.includes('r="C3"'));
});

test("XML'i bozacak karakterler kaçırılıyor", () => {
  const sheetXml = readZip(buildXlsx(sheet)).get("xl/worksheets/sheet1.xml") ?? "";
  assert.match(sheetXml, /Ayşe Yılmaz &amp; kızı/);
  assert.match(sheetXml, /&lt;script&gt;/);
  assert.ok(!sheetXml.includes("<script>"));
});

test("Türkçe karakterler UTF-8 olarak korunuyor", () => {
  const files = readZip(buildXlsx({ name: "Şubat", rows: [["Öğle arası", "İzin"]] }));
  assert.match(files.get("xl/worksheets/sheet1.xml") ?? "", /Öğle arası/);
  assert.match(files.get("xl/workbook.xml") ?? "", /name="Şubat"/);
});

test("sayfa adı Excel kurallarına uydurulur", () => {
  assert.equal(sheetName("Program: 28/08"), "Program  28 08");
  assert.equal(sheetName(""), "Sayfa1");
  assert.equal(sheetName("x".repeat(40)).length, 31);
});

test("sütun harfleri Z'den sonra devam eder", () => {
  assert.equal(columnName(0), "A");
  assert.equal(columnName(25), "Z");
  assert.equal(columnName(26), "AA");
  assert.equal(columnName(27), "AB");
  assert.equal(columnName(51), "AZ");
  assert.equal(columnName(52), "BA");
});

test("kontrol karakteri dosyayı bozmadan atılır", () => {
  const kirli = "Not" + String.fromCharCode(7) + "satırı";
  assert.equal(escapeXml(kirli), "Notsatırı");
  // Sekme ve satır sonu korunur: hekimin notu çok satırlı olabilir
  assert.equal(escapeXml("a\tb\nc"), "a\tb\nc");
});

test("aynı veriden aynı bayt dizisi çıkar", () => {
  assert.ok(buildXlsx(sheet).equals(buildXlsx(sheet)));
});

test("sütun genişlikleri yazılıyor", () => {
  const sheetXml = readZip(buildXlsx(sheet)).get("xl/worksheets/sheet1.xml") ?? "";
  assert.match(sheetXml, /<col min="1" max="1" width="8" customWidth="1"\/>/);
});
