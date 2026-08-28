import type { Cell } from "./xlsx";

/**
 * Günün programının şekli.
 *
 * Bu dosya saf: veriyi tabloya çeviren tek yer burası. Sebep Plan 8.3'teki
 * kural — "her rapor hem anlık hem zamanlı, iki ayrı kod yolu yazılmaz".
 * Panelden indirilen dosya da, ileride gün sonu gönderilecek olan da aynı
 * satırlardan üretilecek; ekran da aynı yapıyı çiziyor.
 */

export type ProgramStatus = "pending" | "confirmed" | "arrived" | "completed";

export type ProgramEntry = {
  id: string;
  /** Kurumun zaman diliminde "09:00" */
  startsAt: string;
  endsAt: string;
  customerName: string | null;
  customerPhone: string | null;
  serviceName: string | null;
  status: ProgramStatus;
  notes: string | null;
  price: number | null;
};

export type ProgramGroup = {
  resourceId: string;
  resourceName: string;
  entries: ProgramEntry[];
};

export type ProgramReport = {
  /** Kurumun zaman dilimindeki gün, YYYY-AA-GG */
  date: string;
  tenantName: string;
  branchName: string | null;
  groups: ProgramGroup[];
  /** Programda yer almayan ama günü anlatan sayılar */
  cancelledCount: number;
  noShowCount: number;
};

const STATUS_LABELS: Record<ProgramStatus, string> = {
  pending: "Onay bekliyor",
  confirmed: "Onaylandı",
  arrived: "Geldi",
  completed: "Tamamlandı",
};

export function statusLabel(status: ProgramStatus): string {
  return STATUS_LABELS[status];
}

/** Programdaki toplam randevu ve onay bekleyen sayısı. */
export function programTotals(report: ProgramReport): { total: number; pending: number } {
  let total = 0;
  let pending = 0;
  for (const group of report.groups) {
    for (const entry of group.entries) {
      total += 1;
      if (entry.status === "pending") pending += 1;
    }
  }
  return { total, pending };
}

/**
 * Excel sayfasının satırları.
 *
 * Sütun sırası kâğıttakiyle aynı — aynı belgenin iki hâli olduğu belli olsun.
 * Son sütun bilerek boş: hekim çıktının üzerine elle not alıyor (Plan 8.3).
 * Ücret sütunu yalnızca yetkisi olana çıkar; yanlış alıcıya ciro göndermek
 * gerçek bir sorun.
 */
export function toSheetRows(
  report: ProgramReport,
  options: { withRevenue: boolean },
): Cell[][] {
  const header: Cell[] = ["Kaynak", "Saat", "Bitiş", "Hasta", "Telefon", "Tedavi", "Durum"];
  if (options.withRevenue) header.push("Ücret");
  header.push("Not");

  const rows: Cell[][] = [header];

  for (const group of report.groups) {
    for (const entry of group.entries) {
      const row: Cell[] = [
        group.resourceName,
        entry.startsAt,
        entry.endsAt,
        entry.customerName ?? "İsimsiz kayıt",
        entry.customerPhone ?? "",
        entry.serviceName ?? "",
        statusLabel(entry.status),
      ];
      if (options.withRevenue) row.push(entry.price);
      row.push(entry.notes ?? "");
      rows.push(row);
    }
  }

  return rows;
}

/** Sütun genişlikleri; başlık satırı kadar dar olmasın diye elle veriliyor. */
export function sheetColumnWidths(options: { withRevenue: boolean }): number[] {
  const widths = [22, 8, 8, 26, 16, 24, 14];
  if (options.withRevenue) widths.push(12);
  widths.push(30);
  return widths;
}

/** "2026-08-28" → "28-08-2026": dosya adı tarih sırasıyla değil okunur olsun. */
export function fileNameFor(report: ProgramReport): string {
  const [year, month, day] = report.date.split("-");
  const place = report.branchName ? `-${slug(report.branchName)}` : "";
  return `program-${day}-${month}-${year}${place}.xlsx`;
}

/** Dosya adında Türkçe karakter ve boşluk sorun çıkarır; sadeleştirilir. */
function slug(value: string): string {
  const map: Record<string, string> = {
    ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
    ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
  };
  return value
    .split("")
    .map((character) => map[character] ?? character)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
