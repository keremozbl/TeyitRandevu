"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit } from "@/lib/audit/log";
import { requireTenant } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { CARD_CONSENT_KINDS, type CardConsentKind } from "./consents";
import { CONSENT_VERSION } from "./consent-texts";

/**
 * Panelden rıza kaydı ve rızanın geri alınması.
 *
 * İkisi de INSERT: `consents` üzerinde UPDATE politikası yok, verilmiş bir
 * rıza satırı sonradan düzeltilemez (bkz. `consents.ts`).
 *
 * PANELDEN ALINAN RIZA NEYİ BELGELER: hasta metni ekranda okuyup kutuyu
 * kendisi işaretlemedi; resepsiyon, rızanın klinikte sözlü ya da ıslak
 * imzayla alındığını kaydediyor. Kayıt bu yüzden `channel = 'panel'` ve
 * `actor` denetim kaydında duruyor — internetten gelen rızayla aynı şey
 * değil ve arayüz de bunu söylüyor. Kaydı düşen kişinin kim olduğu, bir
 * itiraz hâlinde sorulacak ilk sorudur.
 */

const schema = z.object({
  customer_id: z.uuid(),
  kind: z.enum(CARD_CONSENT_KINDS),
});

async function guard(formData: FormData) {
  const parsed = schema.safeParse({
    customer_id: formData.get("customer_id"),
    kind: formData.get("kind"),
  });
  if (!parsed.success) return { ok: false, error: "Geçersiz rıza kaydı isteği." } as const;

  const { active, user } = await requireTenant();
  const supabase = await createClient();

  // Hasta bu kurumda mı: RLS zaten kapatır ama hata cümlesi anlaşılır olsun.
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("tenant_id", active.tenant.id)
    .eq("id", parsed.data.customer_id)
    .maybeSingle();
  if (!customer) return { ok: false, error: "Hasta bulunamadı ya da erişiminiz yok." } as const;

  return { ok: true, active, user, supabase, input: parsed.data } as const;
}

function back(customerId: string, message: string): never {
  revalidatePath(`/app/hastalar/${customerId}`);
  redirect(`/app/hastalar/${customerId}?${new URLSearchParams({ riza: message })}`);
}

/** "Bu rıza klinikte alındı" kaydı. */
export async function recordConsentAction(formData: FormData): Promise<void> {
  const g = await guard(formData);
  if (!g.ok) back(String(formData.get("customer_id") ?? ""), g.error);

  const { active, user, supabase, input } = g;

  const { error } = await supabase.from("consents").insert({
    tenant_id: active.tenant.id,
    customer_id: input.customer_id,
    kind: input.kind,
    text_version: CONSENT_VERSION,
    granted: true,
    channel: "panel",
  });

  if (error) {
    back(
      input.customer_id,
      error.code === "42501"
        ? "Rıza kaydı düşme yetkiniz yok."
        : `Rıza kaydedilemedi: ${error.message}`,
    );
  }

  await recordAudit({
    tenantId: active.tenant.id,
    actorId: user.id,
    action: "create",
    entity: "consent",
    entityId: input.customer_id,
    detail: { kind: input.kind, version: CONSENT_VERSION, channel: "panel" },
  });

  back(input.customer_id, "riza");
}

/**
 * Rızayı geri alır. Ticari ileti izni için bu, açık bir hukuki sonuç doğurur:
 * kuyruğa yazan `queue_appointment_notifications` da gönderim anında kontrol
 * eden `claim_notifications` de en son satıra bakar, ikisi de bu satırdan
 * sonra ticari iletiyi `skipped` yapar.
 */
export async function revokeConsentAction(formData: FormData): Promise<void> {
  const g = await guard(formData);
  if (!g.ok) back(String(formData.get("customer_id") ?? ""), g.error);

  const { active, user, supabase, input } = g;

  const { error } = await supabase.from("consents").insert({
    tenant_id: active.tenant.id,
    customer_id: input.customer_id,
    kind: input.kind,
    text_version: CONSENT_VERSION,
    granted: false,
    revoked_at: new Date().toISOString(),
    channel: "panel",
  });

  if (error) {
    back(
      input.customer_id,
      error.code === "42501"
        ? "Rıza geri alma yetkiniz yok."
        : `Rıza geri alınamadı: ${error.message}`,
    );
  }

  await recordAudit({
    tenantId: active.tenant.id,
    actorId: user.id,
    action: "delete",
    entity: "consent",
    entityId: input.customer_id,
    detail: { kind: input.kind as CardConsentKind, revoked: true },
  });

  back(input.customer_id, "riza_geri");
}
