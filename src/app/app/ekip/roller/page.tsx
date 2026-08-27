import type { Metadata } from "next";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { requireTenant } from "@/lib/auth/session";
import { loadRoles } from "@/lib/team/queries";

export const metadata: Metadata = { title: "Roller" };

export default async function RollerPage({
  searchParams,
}: {
  searchParams: Promise<{ vurgu?: string; kaydedildi?: string }>;
}) {
  const { active } = await requireTenant();
  const { vurgu, kaydedildi } = await searchParams;
  const roles = await loadRoles(active.tenant.id);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/ekip" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Ekibe dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">Roller ve izinler</h1>
          <p className="text-[13px] text-ink-2" data-numeric>
            {roles.length} rol
          </p>
        </div>
        <p className="max-w-2xl text-[13px] text-ink-2">
          Rol bir izin kümesinin adıdır. İzinler kodda sabittir, roller kurumun kendi verisidir:
          şablondan kopyalanır, buradan değiştirilir. Her iznin bir de kapsamı vardır — “kendi”,
          “şubesi”, “kurum” aynı iznin üç farklı genişliği.
        </p>
      </div>

      {kaydedildi && <Alert tone="success">Rol kaydedildi.</Alert>}

      <ul className="flex max-w-3xl flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
        {roles.map((role) => (
          <li
            key={role.id}
            className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px] ${
              role.id === vurgu ? "bg-accent-soft" : ""
            }`}
          >
            {role.isProtected ? (
              <span className="min-w-0 max-w-[14rem] flex-1 truncate font-medium text-ink">
                {role.label}
              </span>
            ) : (
              <Link
                href={`/app/ekip/roller/${role.id}`}
                className="min-w-0 max-w-[14rem] flex-1 truncate font-medium text-ink no-underline hover:underline"
              >
                {role.label}
              </Link>
            )}

            <span className="shrink-0 font-mono text-[11px] text-ink-3" translate="no">
              {role.key}
            </span>

            <span className="shrink-0 text-ink-2" data-numeric>
              {role.permissionCount} izin
            </span>

            <span className="shrink-0 text-ink-3" data-numeric>
              {role.memberCount} kullanıcı
            </span>

            {role.isProtected && (
              <span className="ml-auto shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">
                korumalı — kısıtlanamaz
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="max-w-2xl text-[13px] text-ink-3">
        Yeni rol oluşturma ve rol silme henüz yok; şablondan gelen altı rol düzenlenebiliyor.
        Kurum sahibinin rolü hiçbir koşulda kısıtlanamaz — bunu arayüz değil politika garanti eder.
      </p>
    </div>
  );
}
