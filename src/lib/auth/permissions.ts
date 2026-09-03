import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

import { requireTenant } from "./session";

/**
 * Aktif kurumdaki rolün izinleri.
 *
 * **Bu yetki değildir, görünürlüktür.** Yetkiyi RLS verir (Kural 3): burada
 * `true` dönen bir anahtar veritabanında karşılığı yoksa hiçbir şey açmaz,
 * `false` dönen bir anahtar da veriyi gizlemez — sorgu zaten boş döner.
 * Buradaki tek iş, kullanıcıya asla dolduramayacağı bir form ya da hep boş
 * kalacak bir bölüm göstermemek.
 *
 * Özellikle tıbbi notlar için gerekli: resepsiyon sorgusu boş döner ve "not
 * yok" ile "görme yetkin yok" arayüzde ayrışmaz. İkisi çok farklı cümleler.
 */

export type PermissionScope = Enums<"permission_scope">;

export type Permissions = {
  /** İznin herhangi bir kapsamda verilip verilmediği */
  can: (key: string) => boolean;
  /** Verildiyse hangi kapsamda: own | branch | tenant */
  scopeOf: (key: string) => PermissionScope | null;
};

export const loadPermissions = cache(async function loadPermissions(): Promise<Permissions> {
  const { active } = await requireTenant();
  const supabase = await createClient();

  const { data } = await supabase
    .from("role_permissions")
    .select("permission_key, scope")
    .eq("role_id", active.role_id);

  const granted = new Map<string, PermissionScope>();
  for (const row of data ?? []) granted.set(row.permission_key, row.scope);

  return {
    can: (key) => granted.has(key),
    scopeOf: (key) => granted.get(key) ?? null,
  };
});

/** Tıbbi veri iki yerde geçer: ayrı not tablosu ve `is_medical` esnek alanlar. */
export const MEDICAL_READ = "customer.medical_notes.read";
export const MEDICAL_WRITE = "customer.medical_notes.write";
export const CUSTOMER_WRITE = "customer.write";
/** KVKK imhası: kaydı anonimleştirme. Varsayılan olarak yalnızca sahip ve yönetici. */
export const CUSTOMER_ERASE = "customer.erase";
