import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireTenant } from "@/lib/auth/session";
import { RESOURCE_KIND_LABELS } from "@/lib/scheduling/status";
import { updateResourceAction } from "@/lib/team/actions";
import { loadBranches, loadTeamResource } from "@/lib/team/queries";

import { ResourceForm } from "../../resource-form";

export const metadata: Metadata = { title: "Kaynak" };

export default async function KaynakPage({ params }: { params: Promise<{ id: string }> }) {
  const { active } = await requireTenant();
  const { id } = await params;

  const [resource, branches] = await Promise.all([
    loadTeamResource(active.tenant.id, id),
    loadBranches(active.tenant.id),
  ]);
  if (!resource) notFound();

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/ekip" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Ekibe dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">
            {resource.title ? `${resource.title} ` : ""}
            {resource.name}
          </h1>
          <p className="font-mono text-[12px] uppercase text-ink-3">
            {RESOURCE_KIND_LABELS[resource.kind]}
          </p>
          {!resource.isActive && (
            <p className="rounded-sm bg-st-cancelled-soft px-1.5 py-0.5 text-[12px] text-ink">
              pasif
            </p>
          )}
        </div>
        {resource.branchName && (
          <p className="text-[13px] text-ink-3">{resource.branchName}</p>
        )}
      </div>

      <ResourceForm
        action={updateResourceAction}
        defaults={{
          id: resource.id,
          name: resource.name,
          title: resource.title ?? "",
          kind: resource.kind,
          color: resource.color ?? "",
          branchId: resource.branchId,
          isBookable: resource.isBookable,
          isActive: resource.isActive,
          sortOrder: resource.sortOrder,
          hours: resource.hours,
        }}
        branches={branches}
        submitLabel="Değişiklikleri Kaydet"
        pendingLabel="Kaydediliyor…"
        cancelHref="/app/ekip"
      />
    </div>
  );
}
