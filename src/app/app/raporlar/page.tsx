import type { Metadata } from "next";
import Link from "next/link";

import { requireTenant } from "@/lib/auth/session";
import { addDays, lower, utcToPlainDate } from "@/lib/domain";

export const metadata: Metadata = { title: "Raporlar" };

export default async function RaporlarPage() {
  const { active } = await requireTenant();
  const today = utcToPlainDate(new Date(), active.tenant.timezone);
  const tomorrow = addDays(today, 1);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg tracking-tight">Raporlar</h1>
        <p className="max-w-2xl text-[13px] text-ink-2">
          Rapor içeriği alanın yetkisine göre kırpılır: {lower(active.terms.resource_singular)}
          yalnızca kendi kayıtlarını görür,
          ücret sütunu yalnızca ciro yetkisi olana çıkar. Bunu rapor değil, izinler belirliyor.
        </p>
      </div>

      <ul className="flex max-w-2xl flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
        <ReportRow
          title="Yarının programı"
          detail="Gün sonunda ekibe verilecek liste. Şimdilik ekrandan açılıp yazdırılıyor ya da Excel olarak indiriliyor."
          href={`/app/raporlar/program?tarih=${tomorrow}`}
          action="Yarını aç"
        />
        <ReportRow
          title="Bugünün programı"
          detail="Sabah resepsiyonun eline verilen liste. Çıktıda “Not” sütunu bilerek boş."
          href={`/app/raporlar/program?tarih=${today}`}
          action="Bugünü aç"
        />
      </ul>

      <section className="flex max-w-2xl flex-col gap-1 border-t border-border pt-4">
        <h2 className="text-[13px] font-medium text-ink-2">Henüz yok</h2>
        <p className="text-[13px] text-ink-3">
          Zamanlanmış gönderim (gün sonu WhatsApp/e-posta), gün sonu ciro özeti, haftalık doluluk
          ve kaynak performansı. Zamanlama için bildirim kanalı altyapısı gerekiyor; rapor tanımı
          ile gönderim aynı satırlardan beslenecek, ayrı bir kod yolu yazılmayacak.
        </p>
      </section>
    </div>
  );
}

function ReportRow({
  title,
  detail,
  href,
  action,
}: {
  title: string;
  detail: string;
  href: string;
  action: string;
}) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 px-3 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        <p className="text-[13px] text-ink-2">{detail}</p>
      </div>
      <Link
        href={href}
        className="inline-flex h-8 shrink-0 items-center rounded border border-border bg-surface px-2.5 text-[13px] text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
      >
        {action}
      </Link>
    </li>
  );
}
