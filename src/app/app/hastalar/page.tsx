import type { Metadata } from "next";
import Link from "next/link";

import { requireTenant } from "@/lib/auth/session";
import { loadCustomerList, type CustomerRow } from "@/lib/customers/queries";
import { formatPhoneTr } from "@/lib/utils/phone";

export const metadata: Metadata = { title: "Hastalar" };

export default async function HastalarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sayfa?: string }>;
}) {
  const { active } = await requireTenant();
  const { q, sayfa } = await searchParams;

  const page = Number.parseInt(sayfa ?? "1", 10);
  const list = await loadCustomerList({
    tenantId: active.tenant.id,
    search: q,
    page: Number.isFinite(page) ? page : 1,
  });

  const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
  const first = (list.page - 1) * list.pageSize + 1;
  const last = Math.min(list.page * list.pageSize, list.total);

  const hrefFor = (target: number) => {
    const params = new URLSearchParams();
    if (list.search) params.set("q", list.search);
    if (target > 1) params.set("sayfa", String(target));
    return `/app/hastalar${params.size > 0 ? `?${params}` : ""}`;
  };

  const dayTime = new Intl.DateTimeFormat("tr-TR", {
    timeZone: active.tenant.timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Hastalar</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {list.total === 0
            ? "kayıt yok"
            : list.search
              ? `${list.total} sonuç`
              : `${list.total} kayıt`}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {/* Arama query param'da: paylaşılabilir, geri tuşu çalışır, JavaScript
            kapalıyken de gönderilir. */}
        <form method="get" action="/app/hastalar" className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="text-[13px] font-medium text-ink">
              Hasta ara
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={list.search}
              autoComplete="off"
              spellCheck={false}
              placeholder="Ad ya da telefon…"
              className="h-8 w-64 max-w-full rounded border border-border bg-surface px-2.5 text-ink placeholder:text-ink-3 transition-[border-color] duration-150 hover:border-border-strong"
            />
          </div>
          <button
            type="submit"
            className="inline-flex h-8 items-center rounded border border-border bg-surface px-2.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-surface-2"
          >
            Ara
          </button>
          {list.search && (
            <Link
              href="/app/hastalar"
              className="inline-flex h-8 items-center rounded px-2 text-[13px] text-ink-2 no-underline transition-colors duration-150 hover:text-ink"
            >
              Temizle
            </Link>
          )}
        </form>

        <Link
          href="/app/hastalar/yeni"
          className="ml-auto inline-flex h-8 items-center rounded border border-accent bg-accent px-2.5 text-[13px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
        >
          Yeni Hasta
        </Link>
      </div>

      {list.rows.length === 0 ? (
        <EmptyState search={list.search} />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
            {list.rows.map((row) => (
              <CustomerRowItem key={row.id} row={row} dayTime={dayTime} />
            ))}
          </ul>

          {lastPage > 1 && (
            <nav aria-label="Sayfalar" className="flex items-center gap-3 text-[13px]">
              <p className="text-ink-2" data-numeric>
                {first}–{last} / {list.total}
              </p>
              <div className="ml-auto flex items-center gap-1">
                <PageLink href={hrefFor(list.page - 1)} disabled={list.page <= 1}>
                  ‹ Önceki
                </PageLink>
                <PageLink href={hrefFor(list.page + 1)} disabled={list.page >= lastPage}>
                  Sonraki ›
                </PageLink>
              </div>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function CustomerRowItem({
  row,
  dayTime,
}: {
  row: CustomerRow;
  dayTime: Intl.DateTimeFormat;
}) {
  return (
    <li className="flex min-w-0">
      <Link
        href={`/app/hastalar/${row.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-[13px] no-underline transition-colors duration-150 hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{row.fullName}</span>

        <span className="hidden w-36 shrink-0 truncate font-mono text-ink-2 sm:inline">
          {row.phone ? formatPhoneTr(row.phone) : "—"}
        </span>

        <span className="hidden min-w-0 max-w-[14rem] flex-1 gap-1 truncate text-ink-3 md:flex">
          {row.tags.length > 0 ? row.tags.join(" · ") : ""}
        </span>

        {row.noShowCount > 0 && (
          <span
            className="shrink-0 rounded-sm bg-st-noshow-soft px-1.5 py-0.5 text-[11px] text-ink"
            title={`${row.noShowCount} randevuya gelmedi`}
          >
            {row.noShowCount} gelmedi
          </span>
        )}

        <span className="w-32 shrink-0 truncate text-right font-mono text-ink-2">
          {row.nextVisitAt ? dayTime.format(row.nextVisitAt) : ""}
        </span>
      </Link>
    </li>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const style =
    "inline-flex h-7 items-center rounded border border-border px-2.5 no-underline transition-colors duration-150";
  if (disabled) {
    return (
      <span aria-disabled="true" className={`${style} bg-surface text-ink-3 opacity-50`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${style} bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink`}>
      {children}
    </Link>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
      {search ? (
        <>
          <h2 className="text-ink">“{search}” için kayıt bulunamadı</h2>
          <p className="text-[13px] text-ink-2">
            Arama ad ve telefon üzerinde çalışıyor. Telefonun son dört hanesi de yeter.
          </p>
          <Link
            href="/app/hastalar/yeni"
            className="text-[13px] text-accent underline underline-offset-2"
          >
            Bu adla yeni kayıt aç
          </Link>
        </>
      ) : (
        <>
          <h2 className="text-ink">Henüz hasta kaydı yok</h2>
          <p className="text-[13px] text-ink-2">
            Hasta kaydı iki yoldan açılır: buradan elle ya da randevu yazarken “yeni hasta”
            seçilerek. İkisi de aynı kaydı üretir.
          </p>
          <Link
            href="/app/hastalar/yeni"
            className="text-[13px] text-accent underline underline-offset-2"
          >
            İlk hastayı ekle
          </Link>
        </>
      )}
    </div>
  );
}
