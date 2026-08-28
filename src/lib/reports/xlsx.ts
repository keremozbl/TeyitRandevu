import { crc32, deflateRawSync } from "node:zlib";

/**
 * Küçük bir XLSX yazıcısı.
 *
 * Neden elde: kurum Excel kullanıyor (Plan 8.3 — "Excel'i atlamayın") ve CSV
 * sütun genişliği, sayı biçimi, başlık satırı taşımıyor. Hazır kütüphane ise
 * bu iş için fazla: tek sayfa, düz hücreler, formül yok. İhtiyaç duyulan her
 * şey Node'un içindeki `zlib` ile karşılanıyor.
 *
 * Bir .xlsx dosyası birkaç XML'in ZIP'idir. Metinler `inlineStr` olarak
 * yazılıyor, yani ayrı bir `sharedStrings` tablosu yok — dosya birkaç bayt
 * büyür, karşılığında üretimi ve okunması basitleşir.
 */

export type Cell = string | number | null;

export type Sheet = {
  name: string;
  /** Sütun genişlikleri (Excel birimi ≈ karakter); eksik bırakılan varsayılana düşer */
  columnWidths?: number[];
  rows: Cell[][];
};

/**
 * XML'de anlam taşıyan karakterler kaçırılır, Excel'in kabul etmediği kontrol
 * kodları atılır. İkincisi teoriden değil: not alanına kopyalanan bir metin
 * içinde gelen tek bir kontrol karakteri dosyayı "onarılması gerekiyor"
 * uyarısına düşürüyor.
 */
export function escapeXml(value: string): string {
  let out = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    // 9 sekme, 10 satır sonu, 13 satır başı — kalan kontrol kodları atılır
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) continue;
    if (character === "&") out += "&amp;";
    else if (character === "<") out += "&lt;";
    else if (character === ">") out += "&gt;";
    else if (character === '"') out += "&quot;";
    else if (character === "'") out += "&apos;";
    else out += character;
  }
  return out;
}

/** 0 → A, 25 → Z, 26 → AA */
export function columnName(index: number): string {
  let name = "";
  let value = index;
  while (value >= 0) {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  }
  return name;
}

/**
 * Excel sayfa adı kuralları: en fazla 31 karakter, `[]:*?/\` yasak, boş olamaz.
 * Kural bozulursa dosya "onarılması gerekiyor" uyarısıyla açılır.
 */
export function sheetName(raw: string): string {
  const cleaned = raw.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return cleaned || "Sayfa1";
}

function sheetXml(sheet: Sheet): string {
  const cols =
    sheet.columnWidths && sheet.columnWidths.length > 0
      ? `<cols>${sheet.columnWidths
          .map(
            (width, index) =>
              `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
          )
          .join("")}</cols>`
      : "";

  const rows = sheet.rows
    .map((cells, rowIndex) => {
      const reference = rowIndex + 1;
      const body = cells
        .map((cell, columnIndex) => {
          if (cell === null || cell === "") return "";
          const ref = `${columnName(columnIndex)}${reference}`;
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
        })
        .join("");
      return `<row r="${reference}">${body}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/** Sabit zaman damgası: aynı veriden aynı dosya çıksın, karşılaştırılabilsin. */
const DOS_TIME = 0;
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;

type Entry = { name: string; data: Buffer };

/** ZIP: her girdi ayrı ayrı sıkıştırılır, sonra merkezî dizin yazılır. */
function zip(entries: Entry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    const checksum = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // gereken sürüm
    local.writeUInt16LE(0x0800, 6); // ad UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // üreten sürüm
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // yorum
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // iç öznitelik
    central.writeUInt32LE(0, 38); // dış öznitelik
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);

    locals.push(local, compressed);
    centrals.push(central);
    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, end]);
}

/** Tek sayfalık bir çalışma kitabı üretir. */
export function buildXlsx(sheet: Sheet): Buffer {
  const name = sheetName(sheet.name);
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

  return zip([
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(ROOT_RELS, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(WORKBOOK_RELS, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml({ ...sheet, name }), "utf8") },
  ]);
}
