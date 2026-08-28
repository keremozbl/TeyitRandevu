import type { Metadata } from "next";
import Link from "next/link";

import { requireTenant } from "@/lib/auth/session";
import { createServiceAction } from "@/lib/services/actions";
import { loadResourceOptions, loadServices } from "@/lib/services/queries";

import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Yeni hizmet" };

export default async function YeniHizmetPage() {
  const { active } = await requireTenant();
  const [resources, existing] = await Promise.all([
    loadResourceOptions(active.tenant.id),
    loadServices(active.tenant.id),
  ]);

  const categories = [
    ...new Set(existing.map((service) => service.category?.trim()).filter(Boolean)),
  ] as string[];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/hizmetler" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Hizmetlere dön
        </Link>
        <h1 className="text-lg tracking-tight">Yeni hizmet</h1>
        <p className="text-[13px] text-ink-2">
          Süre ve tamponlar randevunun takvimde kapladığı yeri belirler.
        </p>
      </div>

      <ServiceForm
        action={createServiceAction}
        defaults={{
          name: "",
          category: "",
          durationMin: 30,
          bufferBeforeMin: 0,
          bufferAfterMin: 0,
          price: "",
          vatRate: 20,
          color: "",
          isOnlineBookable: true,
          isActive: true,
          sortOrder: 0,
          resourceIds: [],
        }}
        resources={resources}
        categories={categories}
        submitLabel="Hizmeti Ekle"
        pendingLabel="Ekleniyor…"
        cancelHref="/app/hizmetler"
      />
    </div>
  );
}
