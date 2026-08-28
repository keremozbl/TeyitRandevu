import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTenant } from "@/lib/auth/session";
import { CHANNEL_LABELS } from "@/lib/notifications/labels";
import { loadTemplate } from "@/lib/notifications/queries";
import type { NotificationPayload } from "@/lib/notifications/render";

import { TemplateForm } from "./template-form";

export const metadata: Metadata = { title: "Şablon" };

/**
 * Önizlemenin örnek verisi. Gerçek bir randevudan değil sabit bir örnekten
 * geliyor: şablonu düzenleyen kişi hangi hastanın kaydına baktığını merak
 * etmemeli ve önizleme için hasta verisi okumak gereksiz bir erişim olurdu.
 */
function exemplar(tenantName: string, timeZone: string): NotificationPayload {
  const startsAt = new Date();
  startsAt.setUTCDate(startsAt.getUTCDate() + 1);
  startsAt.setUTCHours(11, 30, 0, 0);

  return {
    musteri_adi: "Ayşe Yılmaz",
    kurum_adi: tenantName,
    sube_adi: "Merkez",
    sube_adresi: "Bağdat Cad. No 1",
    sube_telefon: "0216 111 22 33",
    hekim_adi: "Dt. Ayla Demir",
    hizmet_adi: "Dolgu",
    baslangic: startsAt.toISOString(),
    bitis: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    zaman_dilimi: timeZone,
    randevu_yolu: "/r/ornek-klinik/randevu/ornek",
  };
}

export default async function SablonPage({ params }: { params: Promise<{ id: string }> }) {
  const { active } = await requireTenant();
  const { id } = await params;

  const template = await loadTemplate(active.tenant.id, id);
  if (!template) notFound();

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link
          href="/app/bildirimler/sablonlar"
          className="text-[13px] text-ink-2 no-underline hover:text-ink"
        >
          <span aria-hidden="true">‹</span> Şablonlara dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-lg tracking-tight">{template.name}</h1>
          <p className="font-mono text-[11px] uppercase tracking-wide text-ink-3">
            {CHANNEL_LABELS[template.channel] ?? template.channel}
          </p>
        </div>
      </div>

      <TemplateForm
        template={template}
        example={exemplar(active.tenant.name, active.tenant.timezone)}
        siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
      />
    </div>
  );
}
