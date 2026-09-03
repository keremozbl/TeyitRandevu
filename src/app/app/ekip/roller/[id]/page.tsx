import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { requireTenant } from "@/lib/auth/session";
import { loadPermissionCatalog, loadRolePermissions } from "@/lib/team/queries";

import { RoleForm } from "./role-form";

export const metadata: Metadata = { title: "Rol" };

export default async function RolPage({ params }: { params: Promise<{ id: string }> }) {
  const { active } = await requireTenant();
  const { id } = await params;

  const [data, permissions] = await Promise.all([
    loadRolePermissions(active.tenant.id, id),
    loadPermissionCatalog(),
  ]);
  if (!data) notFound();

  const { role, granted } = data;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/ekip/roller" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Rollere dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">{role.label}</h1>
          <p className="font-mono text-[12px] text-ink-3" translate="no">
            {role.key}
          </p>
          <p className="text-[13px] text-ink-2" data-numeric>
            {role.memberCount} kullanıcı
          </p>
        </div>
      </div>

      {role.isProtected ? (
        <Alert tone="info">
          Bu rol korumalı: kurum sahibinin yetkisi hiçbir koşulda kısıtlanamaz. Politika da bu
          rolün güncellenmesini reddediyor, o yüzden form açılmıyor.
        </Alert>
      ) : (
        <>
          {role.memberCount > 0 && (
            <Alert tone="info">
              Bu rolde {role.memberCount} kullanıcı var; kaydettiğiniz anda hepsinin gördüğü değişir.
            </Alert>
          )}
          <RoleForm
            roleId={role.id}
            label={role.label}
            permissions={permissions}
            granted={granted}
            cancelHref="/app/ekip/roller"
            customerLabel={active.terms.customer_plural}
          />
        </>
      )}
    </div>
  );
}
