import { headers } from "next/headers";
import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Denetim kaydı yazıcısı — KVKK Bölüm 12.4.
 *
 * "Kim hangi hasta kaydını açtı" sorusunun cevabı bu tablo. Tablo ilk günden
 * beri vardı ama yazan kod yoktu; boş bir denetim tablosu, tutulduğu sanılan
 * ama tutulmayan kayıt demek.
 *
 * ÜÇ KARAR:
 *
 * 1. **Servis rolüyle yazılır.** `audit_logs` üzerinde INSERT politikası yok
 *    ve olmayacak: kaydı yazan kişi onu silememeli, değiştirememeli, hatta
 *    yazmamayı seçememeli. Kullanıcının kendi JWT'siyle yazılsaydı, kaydın
 *    içeriği kullanıcının kontrolünde olurdu.
 *
 * 2. **Yanıttan sonra yazılır** (`after`). Denetim kaydı, hasta kartının
 *    açılmasını Frankfurt'a bir tur kadar geciktirmemeli. `after` yanıt
 *    gönderildikten sonra çalışır ve `redirect()` çağrılsa bile çalışır —
 *    yazma akışlarında kaydın kaybolmaması bu yüzden.
 *
 * 3. **Hata sayfayı düşürmez.** Kayıt yazılamazsa sunucu günlüğüne düşer,
 *    kullanıcı işine devam eder. Tersi savunulabilir bir seçenek — "kaydı
 *    tutamıyorsan gösterme" — ama denetim tablosundaki bir arıza yüzünden
 *    kliniğin hasta kartını açamaması, korumaya çalıştığımız şeyden daha
 *    büyük zarar. Sessizce yutulmuyor: `[denetim]` etiketiyle günlüğe yazılır.
 *
 * VERİ ASGARİLİĞİ: `diff` sütununa hasta verisinin KENDİSİ yazılmaz. Değişen
 * alanların adları yazılır ("phone değişti"), yeni ve eski değer değil. Aksi
 * halde denetim tablosu, saklama süresi ve erişim kuralları farklı olan ikinci
 * bir hasta veritabanına dönerdi.
 */

export type AuditAction = "read" | "create" | "update" | "delete" | "export";

/** Kaydın hangi varlığa ait olduğu; tablo adlarıyla aynı tutuluyor. */
export type AuditEntity = "customer" | "customer_medical_note" | "report";

/** `diff` sütununa yazılabilecek değerler — hasta verisi değil, üstveri. */
export type AuditDetail = Record<string, string | number | boolean | null | string[]>;

export type AuditEntry = {
  tenantId: string;
  actorId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  detail?: AuditDetail;
};

/**
 * İstemcinin IP'si. Rıza kaydındaki `clientIp` ile aynı gerekçe: biçimi
 * tutmayan bir değer `inet` cast'inde patlar, o yüzden burada elenir.
 *
 * `headers()` BURADA okunuyor, `after` geri çağrımının içinde değil: sunucu
 * bileşenlerinde istek API'leri `after` içinden çağrılamaz (Next 16).
 */
async function clientIp(): Promise<string | null> {
  const store = await headers();
  const raw = store.get("x-forwarded-for")?.split(",")[0] ?? store.get("x-real-ip") ?? "";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 45) return null;
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

/** Bir ya da daha çok denetim kaydını kuyruğa alır. Asla hata fırlatmaz. */
export async function recordAudit(entry: AuditEntry | AuditEntry[]): Promise<void> {
  const entries = Array.isArray(entry) ? entry : [entry];
  if (entries.length === 0) return;

  const ip = await clientIp();

  after(async () => {
    try {
      const admin = createAdminClient();
      const { error } = await admin.from("audit_logs").insert(
        entries.map((item) => ({
          tenant_id: item.tenantId,
          actor_id: item.actorId,
          action: item.action,
          entity: item.entity,
          entity_id: item.entityId ?? null,
          diff: item.detail ?? null,
          ip,
        })),
      );

      if (error) {
        // Bölüm bulunamadığında da buraya düşer (CANLIYA-GECIS A1): `audit-partitions`
        // işi durmuşsa hata mesajı "no partition of relation" der.
        console.error(
          `[denetim] kayıt yazılamadı: ${error.message} — ${entries
            .map((item) => `${item.action}:${item.entity}`)
            .join(", ")}`,
        );
      }
    } catch (cause) {
      console.error("[denetim] kayıt yazılamadı:", cause);
    }
  });
}
