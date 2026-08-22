import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Servis rolü istemcisi — RLS'i BAYPAS EDER.
 *
 * Yalnızca güvenilir sunucu kodunda kullanılır: webhook doğrulaması, kuyruk
 * işleyicileri, onboarding gibi RLS'i bilerek atlamamız gereken yerler.
 * Kullanıcı isteğinden gelen bir tenant_id ile ASLA çağrılmaz; çağrılacaksa
 * yetki kontrolü elle yapılır.
 *
 * Anahtar NEXT_PUBLIC_ ön eki taşımaz — o ön ek değişkeni tarayıcıya gönderir.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient yalnızca sunucuda çağrılabilir.");
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY tanımlı değil.");
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
