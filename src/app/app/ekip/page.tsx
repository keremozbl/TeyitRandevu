import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requireTenant } from "@/lib/auth/session";
import { RESOURCE_KIND_LABELS } from "@/lib/scheduling/status";
import { toggleResourceAction } from "@/lib/team/actions";
import { summarizeWeek } from "@/lib/team/hours";
import { loadTeamMembers, loadTeamResources, type TeamMember, type TeamResource } from "@/lib/team/queries";

export const metadata: Metadata = { title: "Ekip" };

export default async function EkipPage({
  searchParams,
}: {
  searchParams: Promise<{ vurgu?: string; kaydedildi?: string; hata?: string }>;
}) {
  const { active, user } = await requireTenant();
  const { vurgu, kaydedildi, hata } = await searchParams;

  const [resources, members] = await Promise.all([
    loadTeamResources(active.tenant.id),
    loadTeamMembers(active.tenant.id, user.id),
  ]);

  const activeCount = resources.filter((resource) => resource.isActive).length;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-lg tracking-tight">Ekip</h1>
        <p className="text-[13px] text-ink-2" data-numeric>
          {activeCount} aktif kaynak
          {resources.length > activeCount && ` · ${resources.length - activeCount} pasif`}
          {` · ${members.length} kullanıcı`}
        </p>
      </div>

      {hata && <Alert tone="error">{hata}</Alert>}
      {kaydedildi && <Alert tone="success">Kaynak kaydedildi.</Alert>}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[13px] font-medium text-ink-2">Kaynaklar</h2>
          <p className="text-[13px] text-ink-3">
            Randevular hekim, ünit ya da odanın üzerine düşer. Takvimdeki sütunlar bunlar.
          </p>
          <Link
            href="/app/ekip/kaynak/yeni"
            className="ml-auto inline-flex h-8 items-center rounded border border-accent bg-accent px-2.5 text-[13px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
          >
            Yeni Kaynak
          </Link>
        </div>

        {resources.length === 0 ? (
          <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
            <h3 className="text-ink">Hiç kaynak yok</h3>
            <p className="text-[13px] text-ink-2">
              Takvim kaynakların üzerine kurulur; en az biri olmadan randevu yazılamaz. Kurulum
              sihirbazı ilkini oluşturur, buradan da eklenir.
            </p>
            <Link
              href="/app/ekip/kaynak/yeni"
              className="text-[13px] text-accent underline underline-offset-2"
            >
              İlk kaynağı ekle
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
            {resources.map((resource) => (
              <ResourceRow key={resource.id} resource={resource} highlighted={resource.id === vurgu} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-[13px] font-medium text-ink-2">Kullanıcılar</h2>
          <p className="text-[13px] text-ink-3">
            Panele giren kişiler. Ne görebilecekleri rollerinden gelir.
          </p>
          <Link
            href="/app/ekip/roller"
            className="ml-auto text-[13px] text-accent underline underline-offset-2"
          >
            Rolleri ve izinleri düzenle
          </Link>
        </div>

        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
          {members.map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </ul>

        <p className="text-[13px] text-ink-3">
          Yeni kullanıcı daveti henüz yok: davet e-postası kurumun kendi SMTP{'’'}sini gerektiriyor
          (CANLIYA-GECIS B3). O bağlanana kadar kullanıcı eklemek elle yapılıyor.
        </p>
      </section>
    </div>
  );
}

function ResourceRow({
  resource,
  highlighted,
}: {
  resource: TeamResource;
  highlighted: boolean;
}) {
  return (
    <li
      className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] ${
        highlighted ? "bg-accent-soft" : ""
      }`}
    >
      {resource.color ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: resource.color }}
        />
      ) : (
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-border" />
      )}

      <Link
        href={`/app/ekip/kaynak/${resource.id}`}
        className="min-w-0 max-w-[16rem] flex-1 truncate font-medium text-ink no-underline hover:underline"
      >
        {resource.title ? `${resource.title} ` : ""}
        {resource.name}
      </Link>

      <span className="shrink-0 font-mono text-[10px] uppercase text-ink-3">
        {RESOURCE_KIND_LABELS[resource.kind]}
      </span>

      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">
        {summarizeWeek(resource.hours)}
      </span>

      {!resource.isBookable && resource.isActive && (
        <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
          randevuya kapalı
        </span>
      )}
      {!resource.isActive && (
        <span className="shrink-0 rounded-sm bg-st-cancelled-soft px-1.5 py-0.5 text-[11px] text-ink">
          pasif
        </span>
      )}

      <form action={toggleResourceAction} className="shrink-0">
        <input type="hidden" name="id" value={resource.id} />
        <input type="hidden" name="active" value={resource.isActive ? "0" : "1"} />
        <Button type="submit" size="sm" variant={resource.isActive ? "secondary" : "primary"}>
          {resource.isActive ? "Pasife Al" : "Aktife Al"}
        </Button>
      </form>
    </li>
  );
}

function MemberRow({ member }: { member: TeamMember }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
      <span className="min-w-0 max-w-[20rem] flex-1 truncate text-ink">
        {member.email ?? "e-posta okunamadı"}
        {member.isSelf && <span className="ml-1.5 text-[12px] text-ink-3">(siz)</span>}
      </span>

      <span className="shrink-0 rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[12px] text-ink-2">
        {member.roleLabel}
      </span>

      {member.resourceName && (
        <span className="min-w-0 truncate text-[12px] text-ink-3">
          kaynak: {member.resourceName}
        </span>
      )}

      <span className="ml-auto shrink-0 text-[12px] text-ink-3">
        {member.branchIds.length === 0 ? "tüm şubeler" : `${member.branchIds.length} şube`}
      </span>

      {!member.isActive && (
        <span className="shrink-0 rounded-sm bg-st-cancelled-soft px-1.5 py-0.5 text-[11px] text-ink">
          pasif
        </span>
      )}
    </li>
  );
}
