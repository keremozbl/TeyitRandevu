import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";

import { qrPng } from "./qr-png.ts";
import { qrMatrix } from "./qr.ts";

const URL = "https://teyitrandevu.com/r/ozel-dis-klinigi";

/** PNG parçalarını sırayla okur: [tip, veri] çiftleri. */
function chunks(png: Uint8Array): [string, Uint8Array][] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: [string, Uint8Array][] = [];

  let at = 8; // imza
  while (at < png.length) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    out.push([type, png.subarray(at + 8, at + 8 + length)]);
    at += length + 12;
  }
  return out;
}

test("PNG imzası ve parça sırası doğru", () => {
  const png = qrPng(URL);

  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual(
    chunks(png).map(([type]) => type),
    ["IHDR", "IDAT", "IEND"],
  );
});

test("başlık gri tonlamalı, sıkıştırılmış, interlace'siz", () => {
  const [, ihdr] = chunks(qrPng(URL))[0];
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength);

  const width = view.getUint32(0);
  assert.equal(width, view.getUint32(4), "kare olmalı");
  assert.equal(ihdr[8], 8, "bit derinliği");
  assert.equal(ihdr[9], 0, "renk tipi: gri tonlama");
  assert.equal(ihdr[12], 0, "interlace");
});

test("kenar modül sayısının tam katı — kesirli ölçek yok", () => {
  const extent = qrMatrix(URL).length + 8;

  for (const target of [256, 512, 1024, 300]) {
    const [, ihdr] = chunks(qrPng(URL, { target }))[0];
    const width = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(0);

    assert.equal(width % extent, 0, `${target} için ölçek tam sayı değil`);
    assert.ok(width <= target && width > target - extent, `${target} için en yakın kat değil`);
  }
});

test("piksel verisi matrisle birebir örtüşüyor", () => {
  const modules = qrMatrix(URL);
  const margin = 4;
  const extent = modules.length + margin * 2;

  const png = qrPng(URL, { target: extent * 3 }); // ölçek 3
  const [, ihdr] = chunks(png)[0];
  const side = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.byteLength).getUint32(0);
  const raw = new Uint8Array(inflateSync(chunks(png)[1][1]));

  assert.equal(raw.length, (side + 1) * side);

  const pixel = (x: number, y: number) => raw[y * (side + 1) + 1 + x];

  for (let y = 0; y < side; y++) {
    assert.equal(raw[y * (side + 1)], 0, `satır ${y} süzgeci sıfır olmalı`);
  }

  // Sessiz alan tamamen beyaz: tarayıcı kodu ancak bu çerçeveyle buluyor.
  for (let x = 0; x < side; x++) {
    assert.equal(pixel(x, 0), 0xff, "üst kenar");
    assert.equal(pixel(x, side - 1), 0xff, "alt kenar");
    assert.equal(pixel(0, x), 0xff, "sol kenar");
    assert.equal(pixel(side - 1, x), 0xff, "sağ kenar");
  }

  // Her modülün ortasındaki piksel matristeki değerini taşımalı.
  for (let row = 0; row < modules.length; row++) {
    for (let col = 0; col < modules.length; col++) {
      const x = (col + margin) * 3 + 1;
      const y = (row + margin) * 3 + 1;
      assert.equal(pixel(x, y), modules[row][col] ? 0x00 : 0xff, `modül ${row},${col}`);
    }
  }
});
