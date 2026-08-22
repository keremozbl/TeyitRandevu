/**
 * Supabase projesi henüz bağlanmamışken uygulamanın çökmemesi için tek kontrol
 * noktası. Bağlantı kurulduktan sonra da kalır: eksik ortam değişkeni sessiz
 * bir hata yerine anlaşılır bir ekran üretir.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
