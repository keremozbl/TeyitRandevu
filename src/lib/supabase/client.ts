import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/supabase/types";

/**
 * Tarayıcı istemcisi. Kullanıcının JWT'siyle çalışır, dolayısıyla RLS
 * politikaları geçerlidir — veri sınırını burada değil veritabanında çiziyoruz.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
