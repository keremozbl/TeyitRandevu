import type { Metadata } from "next";
import Link from "next/link";

import { loadPermissions, MEDICAL_READ } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { lower } from "@/lib/domain";
import { sectorCapabilities } from "@/lib/panel/sector";
import { createCustomerAction } from "@/lib/customers/actions";
import { visibleFields } from "@/lib/customers/fields";
import { loadBranchOptions, loadCustomerFields } from "@/lib/customers/queries";

import { CustomerForm } from "../customer-form";

/** Başlık kurumun kendi dilinde: berberde "Yeni müşteri", klinikte "Yeni hasta". */
export async function generateMetadata(): Promise<Metadata> {
  const { active } = await requireTenant();
  return { title: `Yeni ${lower(active.terms.customer_singular)}` };
}

export default async function YeniHastaPage() {
  const { active } = await requireTenant();
  const [permissions, definitions, branches] = await Promise.all([
    loadPermissions(),
    loadCustomerFields(active.tenant.id),
    loadBranchOptions(active.tenant.id),
  ]);

  const fields = visibleFields(definitions, permissions.can(MEDICAL_READ));
  const { medicalNotes } = sectorCapabilities(active.tenant.business_type);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/hastalar" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ {active.terms.customer_plural}
        </Link>
        <h1 className="text-lg tracking-tight">
          Yeni {lower(active.terms.customer_singular)}
        </h1>
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
        submitLabel={`${active.terms.customer_singular} Kaydet`}
        pendingLabel="Kaydediliyor…"
        cancelHref="/app/hastalar"
        medicalNotes={medicalNotes}
      />
    </div>
  );
}
