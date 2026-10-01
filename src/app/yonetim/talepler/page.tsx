import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { updateDemoRequestAction } from "@/lib/platform/actions";
import {
  BUSINESS_LABELS,
  loadDemoRequests,
  STATUS_LABELS,
  type DemoRequestStatus,
} from "@/lib/platform/queries";

export const metadata: Metadata = { title: "Demo talepleri" };

const FILTERS: { key: DemoRequestStatus | "hepsi"; label: string }[] = [
  { key: "hepsi", label: "Hepsi" },
  { key: "new", label: "Yeni" },
  { key: "contacted", label: "Dönüş yapıldı" },
  { key: "qualified", label: "Pilot adayı" },
  { key: "closed", label: "Kapandı" },
];

const STATUS_KEYS = new Set<string>(["new", "contacted", "qualified", "closed"]);

export default async function TaleplerSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>;
}) {
  const { durum } = await searchParams;
  const status = durum && STATUS_KEYS.has(durum) ? (durum as DemoRequestStatus) : undefined;

  const rows = await loadDemoRequests(status);

  const clock = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Demo talepleri</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {rows.length} kayıt
        </p>
      </div>

      <nav aria-label="Durum filtresi" className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => {
          const selected = filter.key === "hepsi" ? !status : status === filter.key;
          return (
            <Link
              key={filter.key}
              href={
                filter.key === "hepsi" ? "/yonetim/talepler" : `/yonetim/talepler?durum=${filter.key}`
              }
              aria-current={selected ? "true" : undefined}
              className={[
                "inline-flex h-7 items-center rounded border px-2.5 text-[13px] no-underline",
                "transition-[background-color,border-color,color] duration-150",
                selected
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
              ].join(" ")}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Bu filtrede talep yok</h2>
          <p className="text-[13px] text-ink-2">
            Siteden gelen demo talepleri buraya düşer. Formu{" "}
            <Link href="/#iletisim" className="underline underline-offset-2">
              iletişim sayfasında
            </Link>{" "}
            deneyebilirsiniz.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const state = STATUS_LABELS[row.status];
            return (
              <li key={row.id} className="rounded border border-border bg-surface">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border px-3 py-2.5">
                  <time
                    dateTime={row.createdAt.toISOString()}
                    data-numeric
                    className="shrink-0 font-mono text-[12px] text-ink-2"
                  >
                    {clock.format(row.createdAt)}
                  </time>
                  <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                    {row.fullName}
                  </span>
                  {row.orgName && (
                    <span className="min-w-0 truncate text-[13px] text-ink-2">{row.orgName}</span>
                  )}
                  <span className={`ml-auto shrink-0 text-[12px] font-medium ${state.tone}`}>
                    {state.label}
                  </span>
                </div>

                <div className="flex flex-col gap-2 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                    <a
                      href={`mailto:${row.email}`}
                      className="text-ink underline underline-offset-2"
                    >
                      {row.email}
                    </a>
                    {row.phone && (
                      <a href={`tel:${row.phone}`} className="font-mono text-ink-2">
                        {row.phone}
                      </a>
                    )}
                    {row.businessType && (
                      <span className="text-ink-3">
                        {BUSINESS_LABELS[row.businessType] ?? row.businessType}
                      </span>
                    )}
                    <span className={row.marketingOk ? "text-st-confirmed" : "text-ink-3"}>
                      {row.marketingOk ? "ticari ileti izni var" : "ticari ileti izni yok"}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3">
                      metin {row.noticeVersion}
                    </span>
                  </div>

                  {row.message && (
                    <p className="whitespace-pre-wrap break-words rounded border border-border bg-surface-2 p-2.5 text-[13px] text-ink">
                      {row.message}
                    </p>
                  )}

                  <form
                    action={updateDemoRequestAction}
                    className="flex flex-wrap items-end gap-2 pt-1"
                  >
                    <input type="hidden" name="id" value={row.id} />

                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`durum-${row.id}`}
                        className="text-[12px] font-medium text-ink-2"
                      >
                        Durum
                      </label>
                      <Select
                        id={`durum-${row.id}`}
                        name="status"
                        defaultValue={row.status}
                        className="w-44"
                      >
                        <option value="new">Yeni</option>
                        <option value="contacted">Dönüş yapıldı</option>
                        <option value="qualified">Pilot adayı</option>
                        <option value="closed">Kapandı</option>
                      </Select>
                    </div>

                    <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
                      <label
                        htmlFor={`not-${row.id}`}
                        className="text-[12px] font-medium text-ink-2"
                      >
                        Satış notu
                      </label>
                      <Textarea
                        id={`not-${row.id}`}
                        name="note"
                        rows={2}
                        maxLength={2000}
                        defaultValue={row.internalNote ?? ""}
                      />
                    </div>

                    <Button type="submit" size="sm" variant="secondary">
                      Kaydet
                    </Button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
