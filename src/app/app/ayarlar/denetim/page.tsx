import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { detailText, ENTITY_FILTERS, summarize } from "@/lib/audit/labels";
import {
  AUDIT_PAGE_SIZE,
  AUDIT_WINDOWS,
  loadAuditTrail,
  parseWindow,
  recordAuditView,
} from "@/lib/audit/queries";
import type { AuditEntity } from "@/lib/audit/log";
import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Denetim kaydı" };

const AUDIT_READ = "audit.read";

export default async function DenetimPage({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string; tur?: string }>;
}) {
  const { active, user } = await requireTenant();
  const { gun, tur } = await searchParams;

  const permissions = await loadPermissions();
  // Yetki RLS'te: izinsiz kullanıcı sorguyu atsa boş liste alırdı. Buradaki
  // kontrol boş bir ekran yerine 404 göstermek için — "kayıt yok" ile
  // "görme yetkin yok" çok farklı iki cümle.
  if (!permissions.can(AUDIT_READ)) notFound();

  const days = parseWindow(gun);
  const filter = ENTITY_FILTERS.find((option) => option.key === tur) ?? ENTITY_FILTERS[0];

  const rows = await loadAuditTrail({
    tenantId: active.tenant.id,
    days,
    entity: filter.entity as AuditEntity | undefined,
  });

  await recordAuditView(active.tenant.id, user.id, days);

  const clock = new Intl.DateTimeFormat("tr-TR", {
    timeZone: active.tenant.timezone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const href = (next: { gun?: number; tur?: string }) => {
    const params = new URLSearchParams();
    const nextDays = next.gun ?? days;
    const nextType = next.tur ?? filter.key;
    if (nextDays !== 7) params.set("gun", String(nextDays));
    if (nextType !== "hepsi") params.set("tur", nextType);
    return params.size > 0 ? `/app/ayarlar/denetim?${params}` : "/app/ayarlar/denetim";
  };

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/ayarlar" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Ayarlara dön
        </Link>
        <h1 className="text-lg tracking-tight">Denetim kaydı</h1>
        <p className="max-w-2xl text-pretty text-[13px] text-ink-2">
          Hasta kaydına kimin, ne zaman eriştiği. KVKK gereği tutuluyor ve{" "}
          <strong className="font-medium text-ink">buradan silinemiyor</strong> — kaydı yazan kişi
          onu değiştiremez.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Tarih aralığı" className="flex flex-wrap gap-1.5">
          {AUDIT_WINDOWS.map((option) => (
            <Link
              key={option}
              href={href({ gun: option })}
              aria-current={option === days ? "true" : undefined}
              className={[
                "inline-flex h-7 items-center rounded border px-2.5 text-[13px] no-underline",
                "transition-[background-color,border-color,color] duration-150",
                option === days
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
              ].join(" ")}
            >
              Son {option} gün
            </Link>
          ))}
        </nav>

        <nav
          aria-label="Kayıt türü"
          className="flex flex-wrap gap-1.5 border-border sm:border-l sm:pl-4"
        >
          {ENTITY_FILTERS.map((option) => (
            <Link
              key={option.key}
              href={href({ tur: option.key })}
              aria-current={option.key === filter.key ? "true" : undefined}
              className={[
                "inline-flex h-7 items-center rounded border px-2.5 text-[13px] no-underline",
                "transition-[background-color,border-color,color] duration-150",
                option.key === filter.key
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
              ].join(" ")}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Bu aralıkta kayıt yok</h2>
          <p className="text-[13px] text-ink-2">
            Hasta kartı açıldığında, tıbbi not okunduğunda ya da program dosya olarak
            indirildiğinde buraya bir satır düşer. Aralığı genişletmeyi deneyin.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded border border-border bg-surface">
          {rows.map((row) => {
            const detail = detailText(row.detail);
            return (
              <li key={row.id} className="flex flex-col gap-1 px-3 py-2.5">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                  <time
                    dateTime={row.at.toISOString()}
                    data-numeric
                    className="shrink-0 font-mono text-[12px] text-ink-2"
                  >
                    {clock.format(row.at)}
                  </time>
                  <span className="min-w-0 shrink-0 max-w-[14rem] truncate text-[13px] text-ink">
                    {row.actorEmail ?? (row.actorId ? "silinmiş kullanıcı" : "sistem")}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-ink-2">
                    {summarize(row.action, row.entity)}
                    {row.targetName && (
                      <span className="ml-1.5 font-medium text-ink">{row.targetName}</span>
                    )}
                  </span>
                  {row.ip && (
                    <span
                      translate="no"
                      className="shrink-0 font-mono text-[11px] text-ink-3"
                    >
                      {row.ip}
                    </span>
                  )}
                </div>

                {detail && <p className="text-[12px] text-ink-3">{detail}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <section className="flex max-w-2xl flex-col gap-1 border-t border-border pt-4">
        <h2 className="text-[13px] font-medium text-ink-2">Neyin kaydı tutuluyor</h2>
        <p className="text-[13px] text-ink-3">
          Hasta kartının açılması, tıbbi notların okunması ve yazılması, hasta kaydının
          oluşturulması ve değiştirilmesi, günün programının Excel olarak indirilmesi, bu ekranın
          görüntülenmesi. Takvimi açmak kayıt üretmez: takvimde tıbbi veri yok ve her ekran
          yenilemesi bir satır yazsaydı liste okunamaz hâle gelirdi.
        </p>
        <p className="text-[13px] text-ink-3">
          Değişikliklerde alan <em>adları</em> yazılır, değerleri değil: kayıtta{" "}
          <span className="font-mono text-[12px]">telefon</span> yazar, eski ve yeni numara
          yazmaz. Aksi hâlde bu tablo ikinci bir hasta veritabanı olurdu.
        </p>
        <p className="text-[13px] text-ink-3" data-numeric>
          Liste en fazla {AUDIT_PAGE_SIZE} satır gösterir; daha eskisi veritabanında duruyor.
        </p>
      </section>
    </div>
  );
}
