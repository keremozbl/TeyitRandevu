import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { requireTenant } from "@/lib/auth/session";
import { updateServiceAction } from "@/lib/services/actions";
import { blockedMinutes, moneyToInput } from "@/lib/services/pricing";
import { countAppointments, loadResourceOptions, loadService, loadServices } from "@/lib/services/queries";

import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Hizmet" };

export default async function HizmetPage({ params }: { params: Promise<{ id: string }> }) {
  const { active } = await requireTenant();
  const { id } = await params;

  const service = await loadService(active.tenant.id, id);
  if (!service) notFound();

  const [resources, existing, usage] = await Promise.all([
    loadResourceOptions(active.tenant.id),
    loadServices(active.tenant.id),
    countAppointments(service.id),
  ]);

  const categories = [
    ...new Set(existing.map((row) => row.category?.trim()).filter(Boolean)),
  ] as string[];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/hizmetler" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Hizmetlere dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">{service.name}</h1>
          {service.category && <p className="text-[13px] text-ink-3">{service.category}</p>}
          {!service.isActive && (
            <p className="rounded-sm bg-st-cancelled-soft px-1.5 py-0.5 text-[12px] text-ink">
              pasif
            </p>
          )}
        </div>
        <p className="font-mono text-[13px] text-ink-3" data-numeric>
          Takvimde {blockedMinutes(service)} dakika yer kaplıyor
          {usage > 0 && ` · ${usage} randevuda kullanılmış`}
        </p>
      </div>

      {usage > 0 && (
        <Alert tone="info">
          Süreyi değiştirmek geçmiş randevuları etkilemez: randevu, yazıldığı andaki süreyi
          kendi satırında tutuyor. Değişiklik bundan sonra yazılacaklara uygulanır.
        </Alert>
      )}

      <ServiceForm
        action={updateServiceAction}
        defaults={{
          id: service.id,
          name: service.name,
          category: service.category ?? "",
          durationMin: service.durationMin,
          bufferBeforeMin: service.bufferBeforeMin,
          bufferAfterMin: service.bufferAfterMin,
          price: moneyToInput(service.price),
          vatRate: service.vatRate,
          color: service.color ?? "",
          isOnlineBookable: service.isOnlineBookable,
          isActive: service.isActive,
          sortOrder: service.sortOrder,
          resourceIds: service.resourceIds,
        }}
        resources={resources}
        categories={categories}
        submitLabel="Değişiklikleri Kaydet"
        pendingLabel="Kaydediliyor…"
        cancelHref="/app/hizmetler"
      />
    </div>
  );
}
