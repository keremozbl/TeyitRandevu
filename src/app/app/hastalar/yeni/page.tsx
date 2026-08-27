import type { Metadata } from "next";
import Link from "next/link";

import { loadPermissions, MEDICAL_READ } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { createCustomerAction } from "@/lib/customers/actions";
import { visibleFields } from "@/lib/customers/fields";
import { loadBranchOptions, loadCustomerFields } from "@/lib/customers/queries";

import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "Yeni hasta" };

export default async function YeniHastaPage() {
  const { active } = await requireTenant();
  const [permissions, definitions, branches] = await Promise.all([
    loadPermissions(),
    loadCustomerFields(active.tenant.id),
    loadBranchOptions(active.tenant.id),
  ]);

  const fields = visibleFields(definitions, permissions.can(MEDICAL_READ));

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/hastalar" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Hastalara dön
        </Link>
        <h1 className="text-lg tracking-tight">Yeni hasta</h1>
      </div>

      <CustomerForm
        action={createCustomerAction}
        defaults={{
          fullName: "",
          phone: "",
          email: "",
          birthDate: "",
          notes: "",
          tags: [],
          customData: {},
        }}
        fields={fields}
        branches={branches}
        branchId={branches[0]?.id ?? null}
        submitLabel="Hastayı Kaydet"
        pendingLabel="Kaydediliyor…"
        cancelHref="/app/hastalar"
      />
    </div>
  );
}
