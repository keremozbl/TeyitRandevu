import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireTenant } from "@/lib/auth/session";
import { toggleServiceAction } from "@/lib/services/actions";
import { describeDuration, formatMoney } from "@/lib/services/pricing";
import { loadServices, type CatalogService } from "@/lib/services/queries";

export const metadata: Metadata = { title: "Hizmetler" };

export default async function HizmetlerPage({
  searchParams,
}: {
  searchParams: Promise<{ vurgu?: string; kaydedildi?: string; hata?: string }>;
}) {
  const { active } = await requireTenant();
  const { vurgu, kaydedildi, hata } = await searchParams;

  const services = await loadServices(active.tenant.id);
  const activeCount = services.filter((service) => service.isActive).length;

  // Kategoriye göre gruplanır; kategorisi olmayanlar en sonda tek başlıkta
  const groups = new Map<string, CatalogService[]>();
  for (const service of services) {
    const key = service.category?.trim() || "";
    groups.set(key, [...(groups.get(key) ?? []), service]);
  }
  const ordered = [...groups.entries()].sort(([left], [right]) => {
    if (left === "") return 1;
    if (right === "") return -1;
    return left.localeCompare(right, "tr");
  });

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Hizmetler</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {activeCount} aktif
          {services.length > activeCount && ` · ${services.length - activeCount} pasif`}
        </p>
        <Link
          href="/app/hizmetler/yeni"
          className="ml-auto inline-flex h-8 items-center rounded border border-accent bg-accent px-2.5 text-[13px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
        >
          Yeni Hizmet
        </Link>
      </div>

      {hata && <Alert tone="error">{hata}</Alert>}
      {kaydedildi && <Alert tone="success">Hizmet kaydedildi.</Alert>}

      {services.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Hiç hizmet yok</h2>
          <p className="text-[13px] text-ink-2">
            Hizmet randevunun süresini ve tampon sürelerini belirler. Hizmetsiz de randevu yazılır
            ama süreyi her seferinde elle girmek gerekir.
          </p>
          <Link
            href="/app/hizmetler/yeni"
            className="text-[13px] text-accent underline underline-offset-2"
          >
            İlk hizmeti ekle
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ordered.map(([category, rows]) => (
            <section key={category || "kategorisiz"} className="flex flex-col gap-1.5">
              <h2 className="text-[12px] uppercase tracking-wide text-ink-3">
                {category || "Kategorisiz"}
              </h2>
              <ul className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
                {rows.map((service) => (
                  <ServiceRow
                    key={service.id}
                    service={service}
                    highlighted={service.id === vurgu}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceRow({
  service,
  highlighted,
}: {
  service: CatalogService;
  highlighted: boolean;
}) {
  return (
    <li
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] ${
        highlighted ? "bg-accent-soft" : ""
      }`}
    >
      {service.color ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: service.color }}
        />
      ) : (
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-border" />
      )}

      <Link
        href={`/app/hizmetler/${service.id}`}
        className="min-w-0 max-w-[18rem] flex-1 truncate font-medium text-ink no-underline hover:underline"
      >
        {service.name}
      </Link>

      <span className="w-48 shrink-0 truncate font-mono text-[12px] text-ink-2">
        {describeDuration(service)}
      </span>

      <span className="w-28 shrink-0 truncate text-right font-mono text-[12px] text-ink-2">
        {service.price === null ? "" : formatMoney(service.price)}
      </span>

      {service.resourceIds.length > 0 && (
        <span className="shrink-0 text-[12px] text-ink-3" data-numeric>
          {service.resourceIds.length} kaynak
        </span>
      )}

      {!service.isOnlineBookable && service.isActive && (
        <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
          online kapalı
        </span>
      )}
      {!service.isActive && (
        <span className="shrink-0 rounded-sm bg-st-cancelled-soft px-1.5 py-0.5 text-[11px] text-ink">
          pasif
        </span>
      )}

      <form action={toggleServiceAction} className="ml-auto shrink-0">
        <input type="hidden" name="id" value={service.id} />
        <input type="hidden" name="active" value={service.isActive ? "0" : "1"} />
        <Button type="submit" size="sm" variant={service.isActive ? "secondary" : "primary"}>
          {service.isActive ? "Pasife Al" : "Aktife Al"}
        </Button>
      </form>
    </li>
  );
}
