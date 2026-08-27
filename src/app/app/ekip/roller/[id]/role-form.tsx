"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { updateRoleAction, type RoleFormState } from "@/lib/team/actions";
import type { PermissionRow, PermissionScope } from "@/lib/team/queries";

const EMPTY: RoleFormState = {};

const SCOPE_LABELS: Record<PermissionScope, string> = {
  own: "Kendi",
  branch: "Şubesi",
  tenant: "Kurum",
};

const CATEGORY_LABELS: Record<string, string> = {
  kurum: "Kurum",
  kaynak: "Kaynak",
  randevu: "Randevu",
  hasta: "Hasta",
  rapor: "Rapor",
  bildirim: "Bildirim",
  entegrasyon: "Entegrasyon",
};

/**
 * Rolün izin matrisi.
 *
 * İzin ile kapsam ayrı iki eksen: "randevuları görüntüle" tek başına anlamsız,
 * "kendi randevuları" ile "kurumdaki tüm randevular" farklı şeyler. Bu yüzden
 * her satır bir açık/kapalı kutusu değil, bir kapsam seçimi.
 */
export function RoleForm({
  roleId,
  label,
  permissions,
  granted,
  cancelHref,
}: {
  roleId: string;
  label: string;
  permissions: PermissionRow[];
  granted: Record<string, PermissionScope>;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(updateRoleAction, EMPTY);

  const categories = permissions.reduce<Record<string, PermissionRow[]>>((groups, permission) => {
    (groups[permission.category] ??= []).push(permission);
    return groups;
  }, {});

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="id" value={roleId} />

        <Field id="label" label="Rol adı" required>
          <Input id="label" name="label" defaultValue={label} required minLength={2} maxLength={60} />
        </Field>

        {Object.entries(categories).map(([category, rows]) => (
          <fieldset key={category} className="flex flex-col gap-2 border-t border-border pt-4">
            <legend className="text-[13px] font-medium text-ink">
              {CATEGORY_LABELS[category] ?? category}
            </legend>
            <div className="flex flex-col gap-2">
              {rows.map((permission) => (
                <div
                  key={permission.key}
                  className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <label
                    htmlFor={`izin_${permission.key}`}
                    className="min-w-0 flex-1 truncate text-[13px] text-ink"
                  >
                    {permission.label}
                  </label>
                  <span
                    className="hidden shrink-0 font-mono text-[11px] text-ink-3 lg:inline"
                    translate="no"
                  >
                    {permission.key}
                  </span>
                  <div className="w-32 shrink-0">
                    <Select
                      id={`izin_${permission.key}`}
                      name={`izin_${permission.key}`}
                      defaultValue={granted[permission.key] ?? ""}
                      className="h-8"
                    >
                      <option value="">Yok</option>
                      {permission.scopes.map((scope) => (
                        <option key={scope} value={scope}>
                          {SCOPE_LABELS[scope]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        <div className="flex items-center gap-3 border-t border-border pt-4">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Kaydediliyor…" : "Rolü Kaydet"}
          </Button>
          <Link href={cancelHref} className="text-[13px] text-ink-2 underline underline-offset-2">
            Vazgeç
          </Link>
        </div>
      </form>
    </div>
  );
}
