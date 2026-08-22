import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const TENANT_COOKIE = "tr_tenant";

export type MembershipSummary = {
  tenant_id: string;
  role_key: string;
  tenant: { id: string; name: string; slug: string; business_type: string; timezone: string };
};

/**
 * Oturumu doğrular. getSession() değil getUser() — getSession() cookie'deki
 * token'a olduğu gibi güvenir, getUser() Auth sunucusuna doğrulatır.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/giris");
  return { supabase, user };
}

/** Kullanıcının üye olduğu kurumlar. RLS zaten başkasınınkini göstermez. */
export async function listMemberships(): Promise<MembershipSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("memberships")
    .select(
      "tenant_id, roles!inner(key), tenants!inner(id, name, slug, business_type, timezone)",
    )
    .eq("is_active", true);

  if (!data) return [];

  // Supabase gömülü ilişkileri dizi ya da nesne olarak döndürebiliyor; ikisini de karşıla.
  return data.map((row: Record<string, unknown>) => {
    const roles = row.roles as { key: string } | { key: string }[];
    const tenants = row.tenants as MembershipSummary["tenant"] | MembershipSummary["tenant"][];
    return {
      tenant_id: row.tenant_id as string,
      role_key: Array.isArray(roles) ? roles[0]?.key : roles?.key,
      tenant: Array.isArray(tenants) ? tenants[0] : tenants,
    };
  });
}

/**
 * Aktif kurumu çözer. Hiç üyelik yoksa kurulum sihirbazına yönlendirir —
 * hesabı olup kurumu olmayan kullanıcı boş bir panele düşmemeli.
 */
export async function requireTenant() {
  const { user } = await requireUser();
  const memberships = await listMemberships();

  if (memberships.length === 0) redirect("/kurulum");

  const selected = (await cookies()).get(TENANT_COOKIE)?.value;
  const active =
    memberships.find((m) => m.tenant_id === selected) ?? memberships[0];

  return { user, memberships, active };
}
