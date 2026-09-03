import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import {
  cancelNotificationAction,
  retryNotificationAction,
  toggleFlowAction,
} from "@/lib/notifications/actions";
import {
  CHANNEL_LABELS,
  describeFlowTiming,
  KIND_LABELS,
  STATUS_LABELS,
  type NotificationStatusKey,
} from "@/lib/notifications/labels";
import { loadFlows, loadOutbox, type NotificationStatus } from "@/lib/notifications/queries";
import { isRealProvider } from "@/lib/notifications/providers";

export const metadata: Metadata = { title: "Bildirimler" };

const TEMPLATE_MANAGE = "notification.template.manage";

const FILTERS: { key: NotificationStatus | "hepsi"; label: string }[] = [
  { key: "hepsi", label: "Hepsi" },
  { key: "scheduled", label: "Bekleyen" },
  { key: "sent", label: "Gönderilen" },
  { key: "skipped", label: "Gönderilmeyen" },
  { key: "failed", label: "Başarısız" },
];

const STATUS_KEYS = new Set<string>([
  "scheduled",
  "sending",
  "sent",
  "failed",
  "cancelled",
  "skipped",
]);

export default async function BildirimlerPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; hata?: string }>;
}) {
  const { active } = await requireTenant();
  const { durum, hata } = await searchParams;
  const permissions = await loadPermissions();
  const canManage = permissions.can(TEMPLATE_MANAGE);

  const status = durum && STATUS_KEYS.has(durum) ? (durum as NotificationStatus) : undefined;

  const [{ rows, summary }, flows] = await Promise.all([
    loadOutbox({ tenantId: active.tenant.id, status }),
    loadFlows(active.tenant.id),
  ]);

  const timeZone = active.tenant.timezone;
  const clock = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const anyReal = rows.some((row) => isRealProvider(row.provider));
  const activeFlows = flows.filter((flow) => flow.isActive).length;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Bildirimler</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {summary.scheduled} bekliyor · {summary.sent} gönderildi
        </p>
        {canManage && (
          <Link
            href="/app/bildirimler/sablonlar"
            className="ml-auto inline-flex h-8 items-center rounded border border-border bg-surface px-2.5 text-[13px] font-medium text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
          >
            Şablonlar
          </Link>
        )}
      </div>

      {hata && <Alert tone="error">{hata}</Alert>}

      {!anyReal && rows.length > 0 && (
        <Alert tone="info">
          Gerçek bir SMS/WhatsApp sağlayıcısı henüz bağlı değil. Mesajlar hazırlanıp kaydediliyor
          ama <strong>alıcıya gitmiyor</strong>; aşağıdaki metinler tam olarak gönderilecek
          olanlar.
        </Alert>
      )}

      {/* ------------------------------------------------------------------ akışlar */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[15px] font-semibold text-ink">Akışlar</h2>
          <p className="text-[13px] text-ink-2" data-numeric>
            {activeFlows} açık · {flows.length - activeFlows} kapalı
          </p>
        </div>

        {flows.length === 0 ? (
          <div className="rounded border border-dashed border-border p-6 text-[13px] text-ink-2">
            Bu kurumda hiç bildirim akışı yok. Akışlar kurulum sırasında sektör şablonundan
            kopyalanır.
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded border border-border bg-surface">
            {flows.map((flow) => (
              <li key={flow.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {flow.name}
                  </span>
                  <span className="block truncate text-[13px] text-ink-2">
                    {describeFlowTiming(flow.trigger, flow.offsetMinutes)} ·{" "}
                    {CHANNEL_LABELS[flow.channel] ?? flow.channel}
                    {flow.templateKind === "commercial" && (
                      <span className="ml-1.5 rounded-sm bg-st-pending-soft px-1 py-0.5 text-[11px] text-st-pending">
                        {KIND_LABELS.commercial}
                      </span>
                    )}
                  </span>
                </span>

                {!flow.templateActive && (
                  <span className="shrink-0 text-[12px] text-st-noshow">Şablon pasif</span>
                )}

                {canManage ? (
                  <form action={toggleFlowAction} className="shrink-0">
                    <input type="hidden" name="id" value={flow.id} />
                    <input type="hidden" name="is_active" value={flow.isActive ? "false" : "true"} />
                    <Button type="submit" size="sm" variant={flow.isActive ? "secondary" : "primary"}>
                      {flow.isActive ? "Kapat" : "Aç"}
                    </Button>
                  </form>
                ) : (
                  <span className="shrink-0 text-[12px] text-ink-3">
                    {flow.isActive ? "Açık" : "Kapalı"}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* -------------------------------------------------------------------- kuyruk */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Kuyruk</h2>

        <nav aria-label="Durum filtresi" className="flex flex-wrap gap-1.5">
          {FILTERS.map((filter) => {
            const selected = filter.key === "hepsi" ? !status : status === filter.key;
            const count =
              filter.key === "hepsi"
                ? Object.values(summary).reduce((sum, value) => sum + value, 0)
                : summary[filter.key];
            return (
              <Link
                key={filter.key}
                href={filter.key === "hepsi" ? "/app/bildirimler" : `/app/bildirimler?durum=${filter.key}`}
                aria-current={selected ? "true" : undefined}
                className={[
                  "inline-flex h-7 items-center gap-1.5 rounded border px-2.5 text-[13px] no-underline",
                  "transition-[background-color,border-color,color] duration-150",
                  selected
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-border bg-surface text-ink-2 hover:border-border-strong hover:text-ink",
                ].join(" ")}
              >
                {filter.label}
                <span data-numeric className="opacity-70">
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {rows.length === 0 ? (
          <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
            <h3 className="text-ink">Kuyrukta mesaj yok</h3>
            <p className="text-[13px] text-ink-2">
              Randevu oluşturulduğunda hatırlatmalar buraya düşer. Akışlar kapalıysa hiçbir mesaj
              üretilmez.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded border border-border bg-surface">
            {rows.map((row) => {
              const state = STATUS_LABELS[row.status as NotificationStatusKey];
              return (
                <li key={row.id} className="flex flex-col gap-1.5 px-3 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <time
                      dateTime={row.scheduledAt.toISOString()}
                      data-numeric
                      className="shrink-0 font-mono text-[12px] text-ink-2"
                    >
                      {clock.format(row.scheduledAt)}
                    </time>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ink-3">
                      {CHANNEL_LABELS[row.channel] ?? row.channel}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {row.customerName ?? "—"}
                      {row.toAddress && (
                        <span className="ml-1.5 font-mono text-[12px] text-ink-3">
                          {row.toAddress}
                        </span>
                      )}
                    </span>
                    <span className={`shrink-0 text-[12px] font-medium ${state.tone}`}>
                      {state.label}
                    </span>
                  </div>

                  {row.renderedBody && (
                    <p className="text-[13px] text-ink-2">{row.renderedBody}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                    {row.templateName && <span className="truncate">{row.templateName}</span>}
                    {row.kind === "commercial" && (
                      <span className="text-st-pending">{KIND_LABELS.commercial}</span>
                    )}
                    {row.provider === "log" && <span>log · gerçekten gönderilmedi</span>}
                    {row.attemptCount > 0 && <span data-numeric>{row.attemptCount}. deneme</span>}
                    {row.lastError && <span className="text-st-noshow">{row.lastError}</span>}

                    {canManage && row.status === "scheduled" && (
                      <form action={cancelNotificationAction} className="ml-auto">
                        <input type="hidden" name="id" value={row.id} />
                        {status && <input type="hidden" name="durum" value={status} />}
                        <Button type="submit" size="sm" variant="ghost">
                          İptal et
                        </Button>
                      </form>
                    )}
                    {canManage && row.status === "failed" && (
                      <form action={retryNotificationAction} className="ml-auto">
                        <input type="hidden" name="id" value={row.id} />
                        {status && <input type="hidden" name="durum" value={status} />}
                        <Button type="submit" size="sm" variant="secondary">
                          Yeniden dene
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
