import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { fileNameFor, sheetColumnWidths, toSheetRows } from "@/lib/reports/program";
import { loadProgram } from "@/lib/reports/queries";
import { buildXlsx } from "@/lib/reports/xlsx";

/**
 * Günün programı, Excel dosyası olarak.
 *
 * Ekranla aynı veriden aynı satırları üretiyor (`toSheetRows`): Plan 8.3'teki
 * "aynı tanım, iki tetikleyici" kuralı. Zamanlanmış gönderim eklendiğinde de
 * üçüncü bir kod yolu değil, aynı fonksiyon çağrılacak.
 *
 * Yetki iki katmanda: hangi randevunun okunacağına RLS, ücret sütununun
 * çıkıp çıkmayacağına `report.revenue.read` karar veriyor.
 */
export async function GET(request: Request) {
  const { active } = await requireTenant();
  const url = new URL(request.url);

  const [loaded, permissions] = await Promise.all([
    loadProgram({
      tenantId: active.tenant.id,
      tenantName: active.tenant.name,
      tenantTimeZone: active.tenant.timezone,
      date: url.searchParams.get("tarih") ?? undefined,
      branchId: url.searchParams.get("sube") ?? undefined,
    }),
    loadPermissions(),
  ]);

  if (!loaded) {
    return new Response("Şube bulunamadı", { status: 404 });
  }

  const withRevenue = permissions.can("report.revenue.read");
  const file = buildXlsx({
    name: `Program ${loaded.report.date}`,
    columnWidths: sheetColumnWidths({ withRevenue }),
    rows: toSheetRows(loaded.report, { withRevenue }),
  });

  const name = fileNameFor(loaded.report);

  return new Response(new Uint8Array(file), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(file.length),
      // Rapor günceli göstermeli: dünün dosyası önbellekten dönmesin
      "cache-control": "no-store",
    },
  });
}
