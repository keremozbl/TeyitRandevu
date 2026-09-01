/**
 * Rıza kayıtlarının veri katmanı.
 *
 * **Rıza satırı değiştirilmez.** `consents` üzerinde UPDATE politikası yok
 * (90_rls): verilmiş bir rızanın sonradan düzenlenebilmesi, kaydın kanıt
 * değerini sıfırlardı. Geri alma da bu yüzden yeni bir satır: `granted =
 * false` ve `revoked_at = now()`.
 *
 * Bu, gönderim kapısının okuduğu biçimin ta kendisi:
 * `private.has_commercial_consent` müşterinin EN SON rıza satırına bakıp
 * `granted and revoked_at is null` arıyor (80_notifications). Yani geri alma
 * satırı yazıldığı anda ticari ileti kapanır — kuyruğa yazan da, gönderim
 * anında yeniden kontrol eden de aynı satırı görür.
 *
 * `revoked_at` ile `granted = false` farkı taşır ve ikisi de gerekli:
 *   granted=false, revoked_at=null  → hiç izin verilmedi (kutu işaretlenmedi)
 *   granted=false, revoked_at=dolu  → verilmişti, geri alındı
 */

import { createClient } from "@/lib/supabase/server";

import type { ConsentKind } from "./consent-texts";

/** Hasta kartında yönetilen rızalar. `cerez` site geneline ait, hastaya değil. */
export const CARD_CONSENT_KINDS = [
  "kvkk_aydinlatma",
  "acik_riza_saglik",
  "ticari_ileti",
] as const satisfies readonly ConsentKind[];

export type CardConsentKind = (typeof CARD_CONSENT_KINDS)[number];

export type ConsentRecord = {
  id: string;
  kind: CardConsentKind;
  granted: boolean;
  version: string;
  at: Date;
  revokedAt: Date | null;
  channel: string | null;
};

export type ConsentState = {
  kind: CardConsentKind;
  /** Son söz: hastanın bugünkü durumu bu satır */
  latest: ConsentRecord | null;
  /** Yeniden en eskiye; kartta ikinciden itibaren "geçmiş" olarak çizilir */
  history: ConsentRecord[];
};

const KIND_SET = new Set<string>(CARD_CONSENT_KINDS);

export async function loadConsents(
  tenantId: string,
  customerId: string,
): Promise<ConsentState[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("consents")
    .select("id, kind, granted, text_version, granted_at, revoked_at, channel")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("granted_at", { ascending: false })
    .limit(60);

  const byKind = new Map<CardConsentKind, ConsentRecord[]>();
  for (const kind of CARD_CONSENT_KINDS) byKind.set(kind, []);

  for (const row of data ?? []) {
    if (!KIND_SET.has(row.kind)) continue;
    const kind = row.kind as CardConsentKind;
    byKind.get(kind)!.push({
      id: row.id,
      kind,
      granted: row.granted,
      version: row.text_version,
      at: new Date(row.granted_at),
      revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
      channel: row.channel,
    });
  }

  return CARD_CONSENT_KINDS.map((kind) => {
    const rows = byKind.get(kind)!;
    return { kind, latest: rows[0] ?? null, history: rows };
  });
}

/** Rızanın bugünkü hâli — kartta rozet, sunucuda karar. */
export type ConsentStatus = "granted" | "revoked" | "refused" | "missing";

export function statusOf(state: ConsentState): ConsentStatus {
  if (!state.latest) return "missing";
  if (state.latest.granted) return "granted";
  return state.latest.revokedAt ? "revoked" : "refused";
}
