import assert from "node:assert/strict";
import { test } from "node:test";

import { QR_MAX_BYTES, QrTooLongError, qrMatrix, qrSvg } from "./qr.ts";

/**
 * QR üreticisinin testi iki koldan gidiyor.
 *
 * **Yapı:** matrisin standarda göre olması gereken sabit noktaları — boyut,
 * göz desenleri, zamanlama, her zaman siyah modül. Bunlar yanlışsa hiçbir
 * tarayıcı kodu bulamaz.
 *
 * **İçerik:** matristen veriyi geri okuyan bağımsız bir çözücü (`decode`
 * altta). Kodlayıcıyı tersine çalıştırmıyor; biçim bilgisini kodun kendi
 * içinden okuyup maskeyi oradan öğreniyor ve zikzağı kendi yürüyor. Bir
 * tarayıcının yapacağı şeyin aynısı, hata düzeltme kısmı hariç.
 *
 * Reed-Solomon kelimeleri ayrıca sendrom sınamasıyla doğrulanıyor: geçerli
 * bir kod sözcüğünün α^1…α^ec köklerindeki değeri sıfırdır. Bu, kodlayıcının
 * kullandığından bambaşka bir aritmetik yol.
 */

// ------------------------------------------------------------------ yapı

test("sürüm veriye göre seçilir, kenar 17 + 4v olur", () => {
  assert.equal(qrMatrix("a").length, 21); // sürüm 1
  assert.equal(qrMatrix("x".repeat(40)).length, 29); // sürüm 3
  assert.equal(qrMatrix("x".repeat(200)).length, 57); // sürüm 10
});

test("üç köşede göz deseni var, dördüncüde yok", () => {
  const m = qrMatrix("https://teyitrandevu.com/r/ornek-klinik");
  const size = m.length;

  const isFinder = (top: number, left: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (m[top + r][left + c] !== (edge || core)) return false;
      }
    }
    return true;
  };

  assert.ok(isFinder(0, 0), "sol üst");
  assert.ok(isFinder(0, size - 7), "sağ üst");
  assert.ok(isFinder(size - 7, 0), "sol alt");
  assert.ok(!isFinder(size - 7, size - 7), "sağ altta göz deseni olmamalı");
});

test("zamanlama desenleri ve sabit siyah modül yerinde", () => {
  const m = qrMatrix("https://teyitrandevu.com/r/ornek-klinik");
  const size = m.length;

  for (let i = 8; i < size - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, `yatay zamanlama ${i}`);
    assert.equal(m[i][6], i % 2 === 0, `dikey zamanlama ${i}`);
  }

  assert.equal(m[size - 8][8], true, "her zaman siyah olan modül");
});

test("aynı girdi aynı matrisi verir", () => {
  const url = "https://teyitrandevu.com/r/ozel-dis-klinigi";
  assert.deepEqual(qrMatrix(url), qrMatrix(url));
});

test("kapasiteyi aşan veri sessizce kırpılmaz, reddedilir", () => {
  assert.equal(QR_MAX_BYTES, 213);
  assert.doesNotThrow(() => qrMatrix("x".repeat(QR_MAX_BYTES)));
  assert.throws(() => qrMatrix("x".repeat(QR_MAX_BYTES + 1)), QrTooLongError);
});

// --------------------------------------------------------------- içerik

test("matristen okunan veri girdiyle aynı", () => {
  for (const text of [
    "a",
    "https://teyitrandevu.com/r/ornek",
    "https://teyitrandevu.com/r/ozel-dis-klinigi-kadikoy",
    "https://teyitrandevu.com/r/" + "u".repeat(120), // sürüm 8-9 bandı
    "x".repeat(QR_MAX_BYTES), // tam kapasite, sürüm 10
  ]) {
    assert.equal(decode(qrMatrix(text)), text, text.slice(0, 32));
  }
});

test("Türkçe karakterler UTF-8 olarak taşınır", () => {
  const text = "https://teyitrandevu.com/r/guzellik — Şişli Güzellik Salonu";
  assert.equal(decode(qrMatrix(text)), text);
});

test("düzeltme kelimeleri geçerli Reed-Solomon kod sözcüğü üretir", () => {
  // Sürüm 1-M: tek blok, 16 veri + 10 düzeltme kelimesi. QR'ın üreteç
  // polinomu α^0'dan başlar, dolayısıyla geçerli bir kod sözcüğü α^0…α^9
  // köklerinin hepsinde sıfırlanır.
  const words = codewords(qrMatrix("teyit"), 1);
  assert.equal(words.length, 26);

  for (let root = 0; root <= 9; root++) {
    let value = 0;
    for (const word of words) value = gfMul(value, EXP[root]) ^ word;
    assert.equal(value, 0, `α^${root} kökünde sıfır değil`);
  }
});

// ------------------------------------------------------- bağımsız çözücü

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** Kodun içine yazılmış biçim bilgisinden maske numarasını okur. */
function readMask(m: boolean[][]): number {
  let raw = 0;
  // Birinci kopyanın okunuşu: bit 0..5 sol sütun, 6..8 köşe, 9..14 üst satır.
  const bits: boolean[] = [];
  for (let i = 0; i <= 5; i++) bits.push(m[i][8]);
  bits.push(m[7][8], m[8][8], m[8][7]);
  for (let i = 9; i < 15; i++) bits.push(m[8][14 - i]);
  for (let i = 14; i >= 0; i--) raw = (raw << 1) | (bits[i] ? 1 : 0);

  const unmasked = raw ^ 0x5412;
  const data = unmasked >>> 10;
  assert.equal(data >>> 3, 0b00, "düzeltme seviyesi M olmalı");
  return data & 0b111;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

const SPECS = [
  { total: 26, ec: 10, blocks: 1 },
  { total: 44, ec: 16, blocks: 1 },
  { total: 70, ec: 26, blocks: 1 },
  { total: 100, ec: 18, blocks: 2 },
  { total: 134, ec: 24, blocks: 2 },
  { total: 172, ec: 16, blocks: 4 },
  { total: 196, ec: 18, blocks: 4 },
  { total: 242, ec: 22, blocks: 4 },
  { total: 292, ec: 22, blocks: 5 },
  { total: 346, ec: 26, blocks: 5 },
];

const ALIGNMENT = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Veri taşımayan (işlev) modülleri işaretler — kodlayıcıdan bağımsız kurulur. */
function functionMap(version: number): boolean[][] {
  const size = 17 + 4 * version;
  const map = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && r < size && c < size) map[r][c] = true;
  };

  for (const [top, left] of [
    [0, 0],
    [0, size - 8],
    [size - 8, 0],
  ]) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) mark(top + r, left + c);
  }

  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }

  const centers = ALIGNMENT[version - 1];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (corner) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) mark(centers[i] + dr, centers[j] + dc);
      }
    }
  }

  for (let i = 0; i < 9; i++) {
    mark(8, i);
    mark(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      mark(b, a);
      mark(a, b);
    }
  }

  return map;
}

/** Zikzağı yürüyüp maskeyi kaldırarak serpiştirilmiş kelimeleri çıkarır. */
function codewords(m: boolean[][], version: number): Uint8Array {
  const size = m.length;
  const fn = functionMap(version);
  const mask = MASKS[readMask(m)];
  const out = new Uint8Array(SPECS[version - 1].total);

  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (fn[row][col] || index >= out.length * 8) continue;
        const bit = m[row][col] !== mask(row, col);
        if (bit) out[index >>> 3] |= 1 << (7 - (index & 7));
        index++;
      }
    }
  }

  return out;
}

/** Serpiştirmeyi çözer, bayt kipini okur ve metni döndürür. */
function decode(m: boolean[][]): string {
  const version = (m.length - 17) / 4;
  const spec = SPECS[version - 1];
  const raw = codewords(m, version);

  const dataTotal = spec.total - spec.ec * spec.blocks;
  const short = Math.floor(dataTotal / spec.blocks);
  const longBlocks = dataTotal % spec.blocks;
  const lengths = Array.from({ length: spec.blocks }, (_, i) =>
    short + (i >= spec.blocks - longBlocks ? 1 : 0),
  );

  const blocks: number[][] = lengths.map(() => []);
  let at = 0;
  for (let i = 0; i < short + 1; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      if (i < lengths[b]) blocks[b].push(raw[at++]);
    }
  }

  const data = blocks.flat();
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
  }

  const read = (count: number) => {
    let value = 0;
    for (let i = 0; i < count; i++) value = (value << 1) | bits.shift()!;
    return value;
  };

  assert.equal(read(4), 0b0100, "bayt kipi bekleniyordu");
  const length = read(version < 10 ? 8 : 16);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = read(8);

  return new TextDecoder().decode(bytes);
}

// ------------------------------------------------------------------ SVG

test("SVG tek yol çizer ve modül sayısı kadar kutu kaplar", () => {
  const svg = qrSvg("https://teyitrandevu.com/r/ornek", { title: "Randevu sayfası" });
  const size = qrMatrix("https://teyitrandevu.com/r/ornek").length;

  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
  assert.equal(svg.match(/<path/g)?.length, 1);
  assert.match(svg, /role="img" aria-label="Randevu sayfası"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
});

test("başlık verilmezse SVG ekran okuyucudan gizlenir", () => {
  assert.match(qrSvg("https://teyitrandevu.com/r/ornek"), /aria-hidden="true"/);
});

test("kenar boşluğu ayarlanabilir", () => {
  const size = qrMatrix("teyit").length;
  assert.match(qrSvg("teyit", { margin: 0 }), new RegExp(`viewBox="0 0 ${size} ${size}"`));
});
