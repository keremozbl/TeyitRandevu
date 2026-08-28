import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * Public randevu sayfasının istemcisi — OTURUMSUZ.
 *
 * `server.ts` cookie'leri okur ve isteği o kullanıcının JWT'siyle atar. Public
 * sayfada bu istenmez: sayfayı açan kişi tesadüfen panele girmiş bir personel
 * olabilir ve o zaman sayfa ziyaretçiye göstermediği veriyi göstermeye başlar.
 * Burada her ziyaretçi aynı `anon` rolüdür, dolayısıyla sayfa herkese aynı
 * şeyi gösterir.
 *
 * `anon` rolünün hiçbir tabloda yetkisi yok (90_rls); bu istemcinin
 * yapabildiği tek şey `booking_*` fonksiyonlarını çağırmak.
 */
export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
