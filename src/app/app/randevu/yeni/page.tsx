import type { Metadata } from "next";
import Link from "next/link";

import { requireTenant } from "@/lib/auth/session";
import { lower, zonedTimeToUtc } from "@/lib/domain";
import { loadBookingContext, resolveDate } from "@/lib/scheduling/queries";

import { AppointmentForm } from "./appointment-form";

export const metadata: Metadata = { title: "Yeni randevu" };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export default async function YeniRandevuPage({
  searchParams,
}: {
  searchParams: Promise<{
    tarih?: string;
    saat?: string;
    kaynak?: string;
    sube?: string;
    q?: string;
    hasta?: string;
  }>;
}) {
  const { active } = await requireTenant();
  const { tarih, saat, kaynak, sube, q, hasta } = await searchParams;

  const context = await loadBookingContext({
    tenantId: active.tenant.id,
    tenantTimeZone: active.tenant.timezone,
    branchId: sube,
    search: q,
    pinnedCustomerId: hasta,
  });

  if (!context || context.resources.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-lg tracking-tight">Yeni randevu</h1>
        <div className="flex max-w-md flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">Randevu yazılacak kaynak yok</h2>
          <p className="text-[13px] text-ink-2">
            Randevular {lower(active.terms.resource_plural)}, oda ya da cihaz gibi kaynakların
            üzerine düşer. En az bir kaynak
            eklendiğinde bu form kullanılabilir.
          </p>
          <Link href="/app" className="text-[13px] text-accent underline underline-offset-2">
            Takvime dön
          </Link>
        </div>
      </div>
    );
  }

  const date = resolveDate(tarih, context.timeZone);
  const time = saat && TIME_RE.test(saat) ? saat : "09:00";
  const resourceId = context.resources.find((r) => r.id === kaynak)?.id ?? context.resources[0].id;

  const heading = new Intl.DateTimeFormat("tr-TR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: context.timeZone,
  }).format(zonedTimeToUtc(date, "12:00", context.timeZone));

  const backHref = `/app?tarih=${date}&sube=${context.branch.id}`;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Yeni randevu</h1>
        <p className="font-mono text-[13px] text-ink-3">
          {heading} · {time}
        </p>
      </div>

      <AppointmentForm
        context={context}
        date={date}
        time={time}
        resourceId={resourceId}
        search={q ?? ""}
        preselectCustomerId={hasta ?? ""}
        terms={active.terms}
        backHref={backHref}
      />
    </div>
  );
}
