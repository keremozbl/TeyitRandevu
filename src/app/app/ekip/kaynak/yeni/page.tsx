import type { Metadata } from "next";
import Link from "next/link";

import { requireTenant } from "@/lib/auth/session";
import { createResourceAction } from "@/lib/team/actions";
import { rowsToWeek } from "@/lib/team/hours";
import { loadBranches } from "@/lib/team/queries";

import { ResourceForm } from "../../resource-form";

export const metadata: Metadata = { title: "Yeni kaynak" };

/** Yeni kaynak hafta içi 09:00–18:00 ile açılır: en sık girilen hâli. */
const DEFAULT_HOURS = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  starts_at: "09:00",
  ends_at: "18:00",
}));

export default async function YeniKaynakPage() {
  const { active } = await requireTenant();
  const branches = await loadBranches(active.tenant.id);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/ekip" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Ekibe dön
        </Link>
        <h1 className="text-lg tracking-tight">Yeni kaynak</h1>
        <p className="text-[13px] text-ink-2">
          Hekim, ünit ya da oda. Takvimde bir sütun açar ve randevular bunun üzerine düşer.
        </p>
      </div>

      <ResourceForm
        action={createResourceAction}
        defaults={{
          name: "",
          title: "",
          kind: "staff",
          color: "#0E5F6E",
          branchId: branches[0]?.id ?? "",
          isBookable: true,
          isActive: true,
          sortOrder: 0,
          hours: rowsToWeek(DEFAULT_HOURS),
        }}
        branches={branches}
        submitLabel="Kaynağı Ekle"
        pendingLabel="Ekleniyor…"
        cancelHref="/app/ekip"
      />
    </div>
  );
}
