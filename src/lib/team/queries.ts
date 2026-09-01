/**
 * Ekip ekranının veri katmanı.
 *
 * Kaynaklar (hekim, ünit, oda) ve çalışma saatleri kullanıcının JWT'siyle
 * okunur; ne göründüğünü `resource.read` izni ve RLS söyler (Kural 3, 4).
 *
 * Tek istisna kullanıcı kimliği: `auth.users` PostgREST'e açık değil, üyelik
 * satırında yalnızca `user_id` var. E-postayı çözmek için servis rolü
 * kullanılıyor — ama yalnızca RLS'in zaten döndürdüğü kimlikler için, yani
 * listeye kimin gireceğine yine politika karar veriyor.
 */

import { resolveEmails } from "@/lib/auth/emails";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

import { rowsToWeek, type DayHours } from "./hours";

export type ResourceKind = Enums<"resource_kind">;

export type TeamResource = {
  id: string;
  branchId: string;
  branchName: string | null;
  name: string;
  title: string | null;
  color: string | null;
  kind: ResourceKind;
  isBookable: boolean;
  isActive: boolean;
  sortOrder: number;
  hours: DayHours[];
};

export type TeamMember = {
  id: string;
  userId: string;
  /** Servis rolüyle çözülür; çözülemezse null — liste yine de anlamlı kalır */
  email: string | null;
  roleId: string;
  roleKey: string;
  roleLabel: string;
  isActive: boolean;
  isSelf: boolean;
  /** Boş dizi = kurumdaki tüm şubeler */
  branchIds: string[];
  resourceName: string | null;
};

export type BranchOption = { id: string; name: string };

/** Kaynaklar ve haftalık saatleri; pasifler de listelenir, ayrı işaretlenir. */
export async function loadTeamResources(tenantId: string): Promise<TeamResource[]> {
  const supabase = await createClient();

  const [resourceResult, hourResult, branchResult] = await Promise.all([
    supabase
      .from("resources")
      .select("id, branch_id, name, title, color, kind, is_bookable, is_active, sort_order")
      .eq("tenant_id", tenantId)
      .order("is_active", { ascending: false })
      .order("sort_order")
      .order("name"),
    supabase
      .from("working_hours")
      .select("resource_id, weekday, starts_at, ends_at")
      .eq("tenant_id", tenantId),
    supabase.from("branches").select("id, name").eq("tenant_id", tenantId),
  ]);

  if (resourceResult.error) throw new Error(`Kaynaklar okunamadı: ${resourceResult.error.message}`);

  const branchNames = new Map((branchResult.data ?? []).map((row) => [row.id, row.name]));

  return (resourceResult.data ?? []).map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    branchName: branchNames.get(row.branch_id) ?? null,
    name: row.name,
    title: row.title,
    color: row.color,
    kind: row.kind,
    isBookable: row.is_bookable,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    hours: rowsToWeek((hourResult.data ?? []).filter((hour) => hour.resource_id === row.id)),
  }));
}

/** Tek kaynağın düzenleme ekranı. */
export async function loadTeamResource(
  tenantId: string,
  resourceId: string,
): Promise<TeamResource | null> {
  const supabase = await createClient();

  const { data: resource } = await supabase
    .from("resources")
    .select("id, branch_id, name, title, color, kind, is_bookable, is_active, sort_order")
    .eq("tenant_id", tenantId)
    .eq("id", resourceId)
    .maybeSingle();
  if (!resource) return null;

  const [hourResult, branchResult] = await Promise.all([
    supabase
      .from("working_hours")
      .select("weekday, starts_at, ends_at")
      .eq("resource_id", resourceId),
    supabase.from("branches").select("name").eq("id", resource.branch_id).maybeSingle(),
  ]);

  return {
    id: resource.id,
    branchId: resource.branch_id,
    branchName: branchResult.data?.name ?? null,
    name: resource.name,
    title: resource.title,
    color: resource.color,
    kind: resource.kind,
    isBookable: resource.is_bookable,
    isActive: resource.is_active,
    sortOrder: resource.sort_order,
    hours: rowsToWeek(hourResult.data ?? []),
  };
}

/**
 * Kurumun kullanıcıları.
 *
 * `staff.manage` izni yoksa politika yalnızca kişinin kendi üyeliğini
 * döndürür; liste o zaman tek satır olur ve bu doğrudur.
 */
export async function loadTeamMembers(
  tenantId: string,
  currentUserId: string,
): Promise<TeamMember[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("memberships")
    .select("id, user_id, role_id, is_active, branch_ids, resource_id, roles!inner(key, label)")
    .eq("tenant_id", tenantId)
    .order("created_at");

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const resourceIds = rows.map((row) => row.resource_id).filter((id): id is string => Boolean(id));
  const resourceNames = new Map<string, string>();
  if (resourceIds.length > 0) {
    const { data: resources } = await supabase
      .from("resources")
      .select("id, name")
      .in("id", resourceIds);
    for (const resource of resources ?? []) resourceNames.set(resource.id, resource.name);
  }

  const emails = await resolveEmails(rows.map((row) => row.user_id));

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: emails.get(row.user_id) ?? null,
    roleId: row.role_id,
    roleKey: row.roles.key,
    roleLabel: row.roles.label,
    isActive: row.is_active,
    isSelf: row.user_id === currentUserId,
    branchIds: row.branch_ids ?? [],
    resourceName: row.resource_id ? (resourceNames.get(row.resource_id) ?? null) : null,
  }));
}

/** Kaynak formundaki şube seçimi. */
export async function loadBranches(tenantId: string): Promise<BranchOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export type PermissionScope = Enums<"permission_scope">;

export type PermissionRow = {
  key: string;
  label: string;
  category: string;
  /** Bu izin hangi kapsamlarla anlamlı; kalanları form hiç sunmaz */
  scopes: PermissionScope[];
};

export type TeamRole = {
  id: string;
  key: string;
  label: string;
  isSystem: boolean;
  /** owner rolü: hiçbir koşulda kısıtlanamaz, politika da güncellemeyi reddeder */
  isProtected: boolean;
  permissionCount: number;
  memberCount: number;
};

/** Kurumun rolleri, izin ve kullanıcı sayılarıyla. */
export async function loadRoles(tenantId: string): Promise<TeamRole[]> {
  const supabase = await createClient();

  const { data: roles, error } = await supabase
    .from("roles")
    .select("id, key, label, is_system, is_protected, sort_order")
    .eq("tenant_id", tenantId)
    .order("sort_order")
    .order("label");
  if (error) throw new Error(`Roller okunamadı: ${error.message}`);

  const ids = (roles ?? []).map((role) => role.id);
  const [permissionResult, membershipResult] = await Promise.all([
    supabase.from("role_permissions").select("role_id").in("role_id", ids),
    supabase.from("memberships").select("role_id").eq("tenant_id", tenantId),
  ]);

  const countBy = (rows: { role_id: string }[] | null) => {
    const counts = new Map<string, number>();
    for (const row of rows ?? []) counts.set(row.role_id, (counts.get(row.role_id) ?? 0) + 1);
    return counts;
  };
  const permissionCounts = countBy(permissionResult.data);
  const memberCounts = countBy(membershipResult.data);

  return (roles ?? []).map((role) => ({
    id: role.id,
    key: role.key,
    label: role.label,
    isSystem: role.is_system,
    isProtected: role.is_protected,
    permissionCount: permissionCounts.get(role.id) ?? 0,
    memberCount: memberCounts.get(role.id) ?? 0,
  }));
}

/** İzin kataloğu koddan değil veritabanından: seed ile geliyor, global. */
export async function loadPermissionCatalog(): Promise<PermissionRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("permissions")
    .select("key, label, category, scopes, sort_order")
    .order("sort_order");
  return (data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    category: row.category,
    scopes: row.scopes ?? [],
  }));
}

/** Tek rolün izin matrisi: anahtar → verilmiş kapsam. */
export async function loadRolePermissions(
  tenantId: string,
  roleId: string,
): Promise<{ role: TeamRole; granted: Record<string, PermissionScope> } | null> {
  const roles = await loadRoles(tenantId);
  const role = roles.find((item) => item.id === roleId);
  if (!role) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("role_permissions")
    .select("permission_key, scope")
    .eq("role_id", roleId);

  const granted: Record<string, PermissionScope> = {};
  for (const row of data ?? []) granted[row.permission_key] = row.scope;
  return { role, granted };
}
