import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { CHANNEL_LABELS, KIND_LABELS } from "@/lib/notifications/labels";
import { loadTemplates } from "@/lib/notifications/queries";
import { smsSegments } from "@/lib/notifications/render";

export const metadata: Metadata = { title: "Bildirim Şablonları" };

export default async function SablonlarPage({
  searchParams,
}: {
  searchParams: Promise<{ kaydedildi?: string }>;
}) {
  const { active } = await requireTenant();
  const { kaydedildi } = await searchParams;
  const permissions = await loadPermissions();
  const canManage = permissions.can("notification.template.manage");

  const templates = await loadTemplates(active.tenant.id);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/app/bildirimler"
          className="text-[13px] text-ink-2 no-underline hover:text-ink"
        >
          <span aria-hidden="true">‹</span> Bildirimlere dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-lg tracking-tight">Bildirim şablonları</h1>
          <p className="text-[13px] text-ink-2" data-numeric>
            {templates.length} şablon
          </p>
        </div>
      </div>

      {kaydedildi && <Alert tone="success">Şablon kaydedildi.</Alert>}

      {templates.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Hiç şablon yok</h2>
          <p className="text-[13px] text-ink-2">
            Şablonlar kurulum sırasında sektör şablonundan kopyalanır. Bu kurum daha eski bir
            sürümde kurulmuş olabilir.
          </p>
        </div>
      ) : (
        <ul className="flex max-w-3xl flex-col divide-y divide-border rounded border border-border bg-surface">
          {templates.map((template) => {
            const { segments, encoding } = smsSegments(template.body);
            return (
              <li key={template.id} className="min-w-0">
                <Link
                  href={canManage ? `/app/bildirimler/sablonlar/${template.id}` : "#"}
                  aria-disabled={!canManage}
                  className={[
                    "flex min-w-0 flex-col gap-1 px-3 py-2.5 no-underline",
                    "transition-colors duration-150",
                    canManage ? "hover:bg-surface-2" : "pointer-events-none",
                  ].join(" ")}
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="min-w-0 truncate text-[13px] font-medium text-ink">
                      {template.name}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-ink-3">
                      {CHANNEL_LABELS[template.channel] ?? template.channel}
                    </span>
                    {template.kind === "commercial" && (
                      <span className="shrink-0 rounded-sm bg-st-pending-soft px-1 py-0.5 text-[11px] text-st-pending">
                        {KIND_LABELS.commercial}
                      </span>
                    )}
                    {!template.isActive && (
                      <span className="shrink-0 text-[12px] text-ink-3">Pasif</span>
                    )}
                    {template.channel === "sms" && (
                      <span
                        data-numeric
                        className="ml-auto shrink-0 font-mono text-[11px] text-ink-3"
                        title={
                          encoding === "ucs2"
                            ? "Türkçe karakter içeriyor: parça 70 karakter"
                            : "GSM-7: parça 160 karakter"
                        }
                      >
                        {segments} SMS
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-[13px] text-ink-2">{template.body}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!canManage && (
        <p className="text-[13px] text-ink-3">
          Şablonları düzenlemek için “Bildirim şablonlarını yönet” izni gerekiyor.
        </p>
      )}
    </div>
  );
}
