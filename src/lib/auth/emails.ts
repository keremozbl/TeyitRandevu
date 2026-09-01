import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Kullanıcı kimliklerini e-postaya çevirir.
 *
 * `auth.users` PostgREST'e kapalı ve bir `profiles` tablosu yok; servis rolü
 * burada yalnızca o eksiği telafi ediyor, KİMİN listeleneceğine karar
 * vermiyor. Çağıran, kimlikleri RLS'ten geçmiş satırlardan getirmiş olmalı —
 * buraya dışarıdan gelen bir kimlik verilirse bu fonksiyon onu da çözer.
 *
 * Anahtar bulunamazsa liste e-postasız çizilir: ekip ve denetim ekranları
 * yapılandırma eksiği yüzünden çökmemeli.
 */
export async function resolveEmails(userIds: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return found;

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return found;
  }

  const results = await Promise.all(
    unique.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return [id, data?.user?.email ?? null] as const;
    }),
  );
  for (const [id, email] of results) if (email) found.set(id, email);
  return found;
}
