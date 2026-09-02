import type { Metadata } from "next";
import Link from "next/link";

import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { addDays, lower, zonedTimeToUtc, type Terminology } from "@/lib/domain";
import { programTotals, statusLabel, type ProgramGroup } from "@/lib/reports/program";
import { loadProgram } from "@/lib/reports/queries";
import { formatMoney } from "@/lib/services/pricing";

export const metadata: Metadata = { title: "Günün programı" };

const REVENUE_PERMISSION = "report.revenue.read";

export default async function ProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ tarih?: string; sube?: string }>;
}) {
  const { active } = await requireTenant();
  const { tarih, sube } = await searchParams;

  const [loaded, permissions] = await Promise.all([
    loadProgram({
      tenantId: active.tenant.id,
      tenantName: active.tenant.name,
      tenantTimeZone: active.tenant.timezone,
      date: tarih,
      branchId: sube,
    }),
    loadPermissions(),
  ]);

  if (!loaded) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-lg tracking-tight">Günün programı</h1>
        <p className="max-w-md rounded border border-dashed border-border p-8 text-[13px] text-ink-2">
          Program bir şubenin kaynakları üzerinde çalışır; kurumda aktif şube görünmüyor.
        </p>
      </div>
    );
  }

  const { report, branches, timeZone } = loaded;
  const withRevenue = permissions.can(REVENUE_PERMISSION);
  const totals = programTotals(report);

  const heading = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(zonedTimeToUtc(report.date, "12:00", timeZone));

  const hrefFor = (date: string) => {
    const params = new URLSearchParams({ tarih: date });
    if (branches.length > 1 && sube) params.set("sube", sube);
    return `/app/raporlar/program?${params}`;
  };

  const fileHref = (() => {
    const params = new URLSearchParams({ tarih: report.date });
    if (sube) params.set("sube", sube);
    return `/app/raporlar/program/xlsx?${params}`;
  })();

  return (
    <div className="flex flex-col gap-4 p-4 print:gap-2 print:p-0">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/app/raporlar" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Raporlara dön
        </Link>

        <form method="get" action="/app/raporlar/program" className="ml-auto flex items-end gap-2">
          <div>
            <label htmlFor="tarih" className="sr-only">
              Tarih
            </label>
            <input
              id="tarih"
              name="tarih"
              type="date"
              defaultValue={report.date}
              className="h-8 rounded border border-border bg-surface px-2 font-mono text-[13px] text-ink"
            />
          </div>
          {branches.length > 1 && (
            <div>
              <label htmlFor="sube" className="sr-only">
                Şube
              </label>
              <select
                id="sube"
                name="sube"
                defaultValue={sube ?? ""}
                className="h-8 max-w-[12rem] truncate rounded border border-border bg-surface px-2 text-[13px] text-ink"
                style={{ backgroundColor: "var(--surface)", color: "var(--ink)" }}
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded border border-border bg-surface px-2.5 text-[13px] text-ink transition-colors duration-150 hover:bg-surface-2"
          >
            Göster
          </button>
        </form>

        <Link
          href={hrefFor(addDays(report.date, 1))}
          className="inline-flex h-8 items-center rounded border border-border bg-surface px-2.5 text-[13px] text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
        >
          Yarın
        </Link>

        <a
          href={fileHref}
          className="inline-flex h-8 items-center rounded border border-accent bg-accent px-2.5 text-[13px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
        >
          Excel indir
        </a>
      </div>

      <header className="flex flex-col gap-0.5">
        <h1 className="text-lg tracking-tight print:text-[16pt]">
          {report.tenantName}
          {report.branchName && ` · ${report.branchName}`}
        </h1>
        <p className="text-[13px] text-ink-2 print:text-[11pt]">
          {heading} · günün programı
        </p>
        <p className="text-[13px] text-ink-3 print:text-[10pt]" data-numeric>
          {totals.total} randevu
          {totals.pending > 0 && ` · ${totals.pending} onay bekliyor`}
          {report.cancelledCount > 0 && ` · ${report.cancelledCount} iptal`}
          {report.noShowCount > 0 && ` · ${report.noShowCount} gelmedi`}
        </p>
      </header>

      {totals.total === 0 ? (
        <p className="rounded border border-dashed border-border p-8 text-[13px] text-ink-2">
          Bu günde randevu yok.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {report.groups
            .filter((group) => group.entries.length > 0)
            .map((group) => (
              <ResourceTable
                key={group.resourceId}
                group={group}
                withRevenue={withRevenue}
                terms={active.terms}
              />
            ))}
        </div>
      )}

      <p className="text-[12px] text-ink-3 print:hidden">
        Çıktıda “Not” sütunu bilerek boş: {lower(active.terms.resource_singular)} kâğıdın üzerine
        yazıyor. Tarayıcının yazdır
        komutuyla (Ctrl+P) A4 düzeninde çıkar.
      </p>
    </div>
  );
}

function ResourceTable({
  group,
  withRevenue,
  terms,
}: {
  group: ProgramGroup;
  withRevenue: boolean;
  terms: Terminology;
}) {
  return (
    <section className="flex break-inside-avoid flex-col gap-1.5">
      <h2 className="text-[13px] font-medium text-ink print:text-[12pt]">{group.resourceName}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-[13px] print:text-[10pt]">
          <thead>
            <tr className="border-b border-border text-left text-[12px] text-ink-3">
              <th scope="col" className="w-16 py-1 pr-2 font-normal">
                Saat
              </th>
              <th scope="col" className="w-16 py-1 pr-2 font-normal">
                Bitiş
              </th>
              <th scope="col" className="py-1 pr-2 font-normal">
                {terms.customer_singular}
              </th>
              <th scope="col" className="w-36 py-1 pr-2 font-normal">
                Telefon
              </th>
              <th scope="col" className="py-1 pr-2 font-normal">
                {terms.service_singular}
              </th>
              <th scope="col" className="w-28 py-1 pr-2 font-normal">
                Durum
              </th>
              {withRevenue && (
                <th scope="col" className="w-24 py-1 pr-2 text-right font-normal">
                  Ücret
                </th>
              )}
              <th scope="col" className="w-48 py-1 font-normal">
                Not
              </th>
            </tr>
          </thead>
          <tbody>
            {group.entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border align-top">
                <td className="py-2 pr-2 font-mono">{entry.startsAt}</td>
                <td className="py-2 pr-2 font-mono text-ink-2">{entry.endsAt}</td>
                <td className="py-2 pr-2 text-ink">{entry.customerName ?? "İsimsiz kayıt"}</td>
                <td className="py-2 pr-2 font-mono text-ink-2">{entry.customerPhone ?? ""}</td>
                <td className="py-2 pr-2 text-ink-2">{entry.serviceName ?? ""}</td>
                <td className="py-2 pr-2 text-ink-2">{statusLabel(entry.status)}</td>
                {withRevenue && (
                  <td className="py-2 pr-2 text-right font-mono text-ink-2">
                    {entry.price === null ? "" : formatMoney(entry.price)}
                  </td>
                )}
                {/* Bilerek boş: hekim çıktının üzerine elle yazıyor (Plan 8.3) */}
                <td className="py-2 text-ink-3">{entry.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
