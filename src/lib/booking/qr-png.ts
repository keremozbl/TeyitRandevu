import { deflateSync } from "node:zlib";

import { qrMatrix } from "./qr.ts";

/**
 * QR kodunun PNG hâli — indirilip basılan dosya.
 *
 * Sayfadaki kod zaten SVG; bu modül yalnızca "indir" düğmesi için var.
 * Neden SVG indirtmiyoruz: matbaa, tabela yapan esnaf ve Instagram'ın tamamı
 * PNG istiyor; SVG indiren klinik dosyayı açamayıp geri geliyor.
 *
 * Node'un `zlib`'i dışında bağımlılık yok. PNG'nin gri tonlamalı biçimi
 * (renk tipi 0) bu iş için yeterli: her piksel tek bayt, palet yok, satır
 * süzgeci yok. Çıktı birkaç kilobayt.
 *
 * `node:zlib` içe aktardığı için bu modül yalnızca sunucuda çalışır —
 * istemci bileşenlerinden import edilmemeli.
 */

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Uzunluk + tip + veri + CRC: PNG'nin tek parça biçimi. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes);
  body.set(data, typeBytes.length);

  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

export type QrPngOptions = {
  /** Hedeflenen kenar uzunluğu (piksel). Modül sayısına tam bölünecek şekilde yuvarlanır. */
  target?: number;
  /** Kenardaki boş alan, modül cinsinden. Standart en az 4 ister. */
  margin?: number;
};

/**
 * QR kodunu PNG baytlarına çevirir.
 *
 * Ölçek tam sayıya yuvarlanıyor: kesirli ölçek modül kenarlarını iki piksele
 * yayar, gri bir sınır oluşur ve okuma mesafesi düşer. Bu yüzden çıktı
 * `target`'a eşit değil, ona en yakın tam katı.
 */
export function qrPng(text: string, options: QrPngOptions = {}): Uint8Array {
  const { target = 1024, margin = 4 } = options;

  const modules = qrMatrix(text);
  const extent = modules.length + margin * 2;
  const scale = Math.max(1, Math.floor(target / extent));
  const side = extent * scale;

  // Gri tonlamalı ham satırlar; her satır bir süzgeç baytıyla başlar (0 = yok).
  const raw = new Uint8Array((side + 1) * side);
  raw.fill(0xff);

  for (let y = 0; y < side; y++) {
    const rowStart = y * (side + 1);
    raw[rowStart] = 0;

    const row = Math.floor(y / scale) - margin;
    if (row < 0 || row >= modules.length) continue;

    for (let x = 0; x < side; x++) {
      const col = Math.floor(x / scale) - margin;
      if (col >= 0 && col < modules.length && modules[row][col]) {
        raw[rowStart + 1 + x] = 0x00;
      }
    }
  }

  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, side);
  header.setUint32(4, side);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = 0; // renk tipi: gri tonlama
  ihdr[10] = 0; // sıkıştırma: deflate
  ihdr[11] = 0; // süzgeç yöntemi
  ihdr[12] = 0; // interlace yok

  const parts = [
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
