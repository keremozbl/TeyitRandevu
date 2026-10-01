/**
 * QR kodu üretici (ISO/IEC 18004) — randevu sayfasının resepsiyona asılan hâli.
 *
 * Neden paket değil: bu dosya projenin tek "algoritma" dosyası ve girdisi
 * sabit — kendi adresimiz, otuz-kırk karakterlik bir URL. Bir bağımlılık
 * eklemek bu iş için sürüm takibi, lisans ve bundle maliyeti getirirdi;
 * karşılığında aldığımız şey ise burada tamamı test edilen iki yüz satır.
 * Çıktı saf veri (boolean matrisi), çizim ayrı: SVG sayfaya gömülüyor, PNG
 * ayrı bir modülde (`qr-png.ts`) üretiliyor.
 *
 * Kapsam bilinçli olarak dar:
 *
 * - **Yalnızca bayt kipi.** URL'de büyük harf ve tire var; alfanümerik kip
 *   küçük harf tanımıyor, sayısal kip zaten uymuyor.
 * - **Yalnızca M düzeltme seviyesi** (%15). Basılan bir kâğıt kirlenir ve
 *   köşesi kıvrılır; L (%7) bunu kaldırmıyor. Q ve H daha dayanıklı ama
 *   kodu gözle görülür biçimde sıklaştırıyor, uzaktan okunması zorlaşıyor.
 * - **Sürüm 1-10**, yani en fazla 216 bayt. Bizim URL'ler 50 civarı; on
 *   katı bir pay bırakıldı, fazlası tabloyu şişirirdi.
 *
 * Bu dosyada "neden böyle" yazılamayan tek şey standardın kendi sabitleri:
 * üreteç polinomları, hizalama deseni koordinatları ve ceza katsayıları
 * ISO/IEC 18004'ten birebir alınmıştır, türetilemezler.
 */

// ---------------------------------------------------------------- GF(256)

/**
 * Galois cismi tabloları.
 *
 * Reed-Solomon aritmetiği 0x11D ilkel polinomuyla GF(256) üzerinde yapılır.
 * Çarpma log/antilog üzerinden: `EXP` iki kat uzun ki toplamda taşma için
 * mod almaya gerek kalmasın.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** `degree` adet düzeltme kelimesi için üreteç polinomu; [0] en yüksek derece. */
function generatorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Veri bloğunun Reed-Solomon kalanı — düzeltme kelimeleri. */
function errorCorrection(data: Uint8Array, ecLength: number): Uint8Array {
  const gen = generatorPoly(ecLength);
  const buffer = new Uint8Array(data.length + ecLength);
  buffer.set(data);

  for (let i = 0; i < data.length; i++) {
    const factor = buffer[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      buffer[i + j] ^= mul(gen[j], factor);
    }
  }

  return buffer.slice(data.length);
}

// ------------------------------------------------------------- tablolar

/**
 * Sürüm başına kapasite (M seviyesi).
 *
 * `total` o sürümün toplam kelime sayısı, `ec` blok başına düzeltme
 * kelimesi, `blocks` blok sayısı. Veri kelimesi = total − ec × blocks;
 * bloklara bölünürken kalan, son bloklara birer fazla düşer.
 */
const SPECS = [
  { total: 26, ec: 10, blocks: 1 }, // sürüm 1
  { total: 44, ec: 16, blocks: 1 },
  { total: 70, ec: 26, blocks: 1 },
  { total: 100, ec: 18, blocks: 2 },
  { total: 134, ec: 24, blocks: 2 },
  { total: 172, ec: 16, blocks: 4 },
  { total: 196, ec: 18, blocks: 4 },
  { total: 242, ec: 22, blocks: 4 },
  { total: 292, ec: 22, blocks: 5 },
  { total: 346, ec: 26, blocks: 5 }, // sürüm 10
] as const;

/** Hizalama deseni merkezleri (ISO/IEC 18004 Tablo E.1). */
const ALIGNMENT: readonly (readonly number[])[] = [
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

/** Sürümün kenar uzunluğu (modül). */
function moduleCount(version: number): number {
  return 17 + 4 * version;
}

/** Sürümün veri kelimesi sayısı. */
function dataCapacity(version: number): number {
  const spec = SPECS[version - 1];
  return spec.total - spec.ec * spec.blocks;
}

/**
 * Karakter sayacının bit genişliği.
 *
 * Bayt kipinde sürüm 1-9 için 8 bit, 10 ve üstü için 16. Sınırı kaçırmak
 * kodu sessizce okunamaz yapar — çözücü bitleri bir kaydırmayla okur.
 */
function countBits(version: number): number {
  return version < 10 ? 8 : 16;
}

// -------------------------------------------------------------- kodlama

/** Veriyi bayt kipinde kodlar, dolgu ekler ve kelime dizisine çevirir. */
function encodeData(bytes: Uint8Array, version: number): Uint8Array {
  const capacity = dataCapacity(version);
  const bits: number[] = [];

  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // bayt kipi
  push(bytes.length, countBits(version));
  for (const byte of bytes) push(byte, 8);

  // Sonlandırıcı en fazla dört bit; kapasite daha önce dolduysa kısalır.
  const terminator = Math.min(4, capacity * 8 - bits.length);
  push(0, terminator);

  // Bayt sınırına tamamla.
  while (bits.length % 8 !== 0) bits.push(0);

  const words = new Uint8Array(capacity);
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    words[i / 8] = byte;
  }

  // Standardın dolgu kelimeleri: 0xEC ile başlar, 0x11 ile dönüşür.
  const used = bits.length / 8;
  for (let i = used; i < capacity; i++) {
    words[i] = (i - used) % 2 === 0 ? 0xec : 0x11;
  }

  return words;
}

/**
 * Blokları böler, düzeltme kelimelerini hesaplar ve serpiştirir.
 *
 * Serpiştirme (interleaving) kâğıttaki yerel bir lekenin tek bir bloğu
 * tamamen yok etmesini engeller: her bloğun kelimeleri koda dağılır, leke
 * her blokta birkaç kelime bozar ve her blok kendi başına düzeltilebilir.
 */
function interleave(words: Uint8Array, version: number): Uint8Array {
  const spec = SPECS[version - 1];
  const total = dataCapacity(version);
  const short = Math.floor(total / spec.blocks);
  const longBlocks = total % spec.blocks;

  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let i = 0; i < spec.blocks; i++) {
    const length = short + (i >= spec.blocks - longBlocks ? 1 : 0);
    const block = words.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(errorCorrection(block, spec.ec));
  }

  const result = new Uint8Array(spec.total);
  let at = 0;

  for (let i = 0; i < short + 1; i++) {
    for (const block of dataBlocks) {
      if (i < block.length) result[at++] = block[i];
    }
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const block of ecBlocks) result[at++] = block[i];
  }

  return result;
}

// --------------------------------------------------------------- matris

type Grid = {
  size: number;
  modules: boolean[][];
  /** İşlev modülü mü: maske ve veri yerleşimi buralara dokunmaz. */
  reserved: boolean[][];
};

function emptyGrid(size: number): Grid {
  const make = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, modules: make(), reserved: make() };
}

function setFunction(grid: Grid, row: number, col: number, dark: boolean) {
  if (row < 0 || col < 0 || row >= grid.size || col >= grid.size) return;
  grid.modules[row][col] = dark;
  grid.reserved[row][col] = true;
}

/** Köşelerdeki göz deseni; ayırıcı beyaz şerit de bu 9×9 alanın parçası. */
function drawFinder(grid: Grid, row: number, col: number) {
  for (let dr = -4; dr <= 4; dr++) {
    for (let dc = -4; dc <= 4; dc++) {
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      setFunction(grid, row + dr, col + dc, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignment(grid: Grid, row: number, col: number) {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      setFunction(grid, row + dr, col + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
}

/** Biçim bilgisi: BCH(15,5), ardından standardın 0x5412 maskesiyle XOR. */
function formatBits(mask: number): number {
  const data = 0b00 << 3 | mask; // 0b00 = M seviyesi
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Sürüm bilgisi: BCH(18,6). Yalnızca sürüm 7 ve üstünde yazılır. */
function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function drawFunctionPatterns(grid: Grid, version: number) {
  const { size } = grid;

  for (let i = 0; i < size; i++) {
    setFunction(grid, 6, i, i % 2 === 0);
    setFunction(grid, i, 6, i % 2 === 0);
  }

  drawFinder(grid, 3, 3);
  drawFinder(grid, 3, size - 4);
  drawFinder(grid, size - 4, 3);

  const centers = ALIGNMENT[version - 1];
  for (let i = 0; i < centers.length; i++) {
    for (let j = 0; j < centers.length; j++) {
      const corner =
        (i === 0 && j === 0) ||
        (i === 0 && j === centers.length - 1) ||
        (i === centers.length - 1 && j === 0);
      if (!corner) drawAlignment(grid, centers[i], centers[j]);
    }
  }

  // Biçim bilgisinin yeri şimdilik yalnızca ayrılıyor; değeri maske
  // seçildikten sonra yazılır.
  drawFormat(grid, 0);

  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(grid, b, a, bit);
      setFunction(grid, a, b, bit);
    }
  }
}

function drawFormat(grid: Grid, mask: number) {
  const { size } = grid;
  const bits = formatBits(mask);
  const bit = (i: number) => ((bits >>> i) & 1) === 1;

  // Birinci kopya: sol üst gözün çevresi.
  for (let i = 0; i <= 5; i++) setFunction(grid, i, 8, bit(i));
  setFunction(grid, 7, 8, bit(6));
  setFunction(grid, 8, 8, bit(7));
  setFunction(grid, 8, 7, bit(8));
  for (let i = 9; i < 15; i++) setFunction(grid, 8, 14 - i, bit(i));

  // İkinci kopya: sağ üst ve sol alt gözlerin yanı.
  for (let i = 0; i < 8; i++) setFunction(grid, 8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) setFunction(grid, size - 15 + i, 8, bit(i));

  // Her zaman siyah olan modül.
  setFunction(grid, size - 8, 8, true);
}

/**
 * Veriyi zikzak yerleştirir.
 *
 * Sağ alttan başlayıp iki sütun genişliğinde şeritler hâlinde yukarı-aşağı
 * ilerler; altıncı sütun zamanlama deseni olduğu için atlanır.
 */
function drawCodewords(grid: Grid, data: Uint8Array) {
  const { size } = grid;
  let index = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (!grid.reserved[row][col] && index < data.length * 8) {
          grid.modules[row][col] = ((data[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
          index++;
        }
      }
    }
  }
}

const MASKS: ((row: number, col: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(grid: Grid, mask: number) {
  const fn = MASKS[mask];
  for (let row = 0; row < grid.size; row++) {
    for (let col = 0; col < grid.size; col++) {
      if (!grid.reserved[row][col] && fn(row, col)) {
        grid.modules[row][col] = !grid.modules[row][col];
      }
    }
  }
}

/** Göz desenine benzeyen 11'li dizi; tarayıcıyı yanıltır, bu yüzden cezalı. */
const FINDER_LIKE = [true, false, true, true, true, false, true, false, false, false, false];

function matchesAt(line: boolean[], at: number, pattern: boolean[]): boolean {
  for (let i = 0; i < pattern.length; i++) {
    if (line[at + i] !== pattern[i]) return false;
  }
  return true;
}

/**
 * Maske cezası (ISO/IEC 18004 §8.8.2).
 *
 * Dört kural: uzun tek renk koşuları, 2×2 tek renk blokları, göz desenine
 * benzeyen diziler ve siyah oranının %50'den sapması. En düşük cezalı maske
 * seçilir — amaç tarayıcının kafasını karıştıracak düzenlilikleri kırmak.
 */
function penalty(grid: Grid): number {
  const { size, modules } = grid;
  let score = 0;

  const lines: boolean[][] = [];
  for (let row = 0; row < size; row++) lines.push(modules[row]);
  for (let col = 0; col < size; col++) {
    lines.push(Array.from({ length: size }, (_, row) => modules[row][col]));
  }

  const reversed = [...FINDER_LIKE].reverse();

  for (const line of lines) {
    // Kural 1: beş ve üstü koşu.
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) {
        run++;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }

    // Kural 3: göz deseni benzeri dizi, iki yönde de.
    for (let i = 0; i + FINDER_LIKE.length <= size; i++) {
      if (matchesAt(line, i, FINDER_LIKE)) score += 40;
      if (matchesAt(line, i, reversed)) score += 40;
    }
  }

  // Kural 2: 2×2 tek renk blok.
  for (let row = 0; row < size - 1; row++) {
    for (let col = 0; col < size - 1; col++) {
      const value = modules[row][col];
      if (
        value === modules[row][col + 1] &&
        value === modules[row + 1][col] &&
        value === modules[row + 1][col + 1]
      ) {
        score += 3;
      }
    }
  }

  // Kural 4: siyah oranının dengesizliği.
  let dark = 0;
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) if (modules[row][col]) dark++;
  }
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;

  return score;
}

// ----------------------------------------------------------------- API

/**
 * Sığdırılabilecek en uzun veri.
 *
 * Sürüm 10'un 216 veri kelimesinden kip göstergesi (4 bit) ve karakter
 * sayacı (16 bit) düşer; kalan 1708 bitten tam 213 bayt çıkar. Sabit yazmak
 * yerine tablodan türetiliyor ki kapsam genişletilirse kendiliğinden artsın.
 */
export const QR_MAX_BYTES = Math.floor((dataCapacity(SPECS.length) * 8 - 4 - countBits(SPECS.length)) / 8);

export class QrTooLongError extends Error {
  constructor(length: number) {
    super(`QR kodu için veri çok uzun: ${length} bayt (en fazla ${QR_MAX_BYTES})`);
    this.name = "QrTooLongError";
  }
}

/**
 * Metni QR koduna çevirir; `true` siyah modül demektir.
 *
 * Maske seçimi standardın kendi kuralı: sekiz maske denenir, cezası en
 * düşük olan kazanır. Deterministik — aynı metin her zaman aynı matrisi
 * verir, bu yüzden testlenebilir.
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);

  const version = SPECS.findIndex((_, index) => {
    const v = index + 1;
    return dataCapacity(v) * 8 >= 4 + countBits(v) + bytes.length * 8;
  }) + 1;

  if (version === 0) throw new QrTooLongError(bytes.length);

  const data = interleave(encodeData(bytes, version), version);

  let best: Grid | null = null;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const grid = emptyGrid(moduleCount(version));
    drawFunctionPatterns(grid, version);
    drawCodewords(grid, data);
    applyMask(grid, mask);
    drawFormat(grid, mask);

    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }

  return best!.modules;
}

export type QrSvgOptions = {
  /** Kenardaki boş alan, modül cinsinden. Standart en az 4 ister. */
  margin?: number;
  /** Koyu modüllerin rengi; açık modüller saydam bırakılır. */
  color?: string;
  /** Erişilebilir ad. Boş verilirse SVG `aria-hidden` olur. */
  title?: string;
};

/**
 * QR kodunun tek bir SVG yolu olarak çizilmiş hâli.
 *
 * Neden tek `<path>`: her modül ayrı `<rect>` olsaydı 57×57'lik bir kodda üç
 * bine yakın düğüm olurdu. Yatay koşular tek dikdörtgene toplanıyor, yol
 * verisi belirgin biçimde kısalıyor.
 *
 * Hem `qrSvg` (metin çıktısı) hem de React bileşeni bunu kullanıyor ki kod
 * iki yerde iki türlü çizilmesin.
 */
export function qrPath(text: string, margin = 4): { d: string; extent: number } {
  const modules = qrMatrix(text);
  const size = modules.length;
  const parts: string[] = [];

  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!modules[row][col]) {
        col++;
        continue;
      }
      let run = 1;
      while (col + run < size && modules[row][col + run]) run++;
      parts.push(`M${col + margin} ${row + margin}h${run}v1h-${run}z`);
      col += run;
    }
  }

  return { d: parts.join(""), extent: size + margin * 2 };
}

/**
 * QR kodunu SVG metni olarak çizer.
 *
 * `shape-rendering="crispEdges"` ölçeklenirken modül kenarlarının
 * bulanmasını engelliyor — bulanık kenar okunmayı doğrudan bozuyor.
 *
 * Açık modüller boyanmıyor: kod hem açık hem koyu temada sayfanın kendi
 * zemini üzerinde duruyor. Basılacak sürümde zemini çağıran taraf veriyor.
 */
export function qrSvg(text: string, options: QrSvgOptions = {}): string {
  const { margin = 4, color = "currentColor", title } = options;
  const { d, extent } = qrPath(text, margin);

  const label = title
    ? `role="img" aria-label="${title.replace(/[<>&"]/g, "")}"`
    : 'aria-hidden="true"';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" ` +
    `shape-rendering="crispEdges" ${label}>` +
    `<path fill="${color}" d="${d}"/>` +
    `</svg>`
  );
}
