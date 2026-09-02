import { cache } from "react";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";

/**
 * Platform yönetiminin veri katmanı.
 *
 * Kiracı katmanından tamamen ayrı: burada `requireTenant()` yok, çünkü bu
 * veriler bir kuruma ait değil. Yetkiyi `platform_admins` tablosu veriyor ve
 * asıl kapı RLS'te — `demo_requests` politikaları `private.is_platform_admin()`
 * arıyor, bu fonksiyonlar yalnızca ekranı doğru çizmek için.
 */

export type DemoRequestStatus = Enums<"demo_request_status">;

export type DemoRequest = {
  id: string;
  createdAt: Date;
  fullName: string;
  orgName: string | null;
  email: string;
  phone: string | null;
  businessType: string | null;
  message: string | null;
  status: DemoRequestStatus;
  marketingOk: boolean;
  noticeVersion: string;
  source: string | null;
  internalNote: string | null;
  handledAt: Date | null;
};

export const isPlatformAdmin = cache(async function isPlatformAdmin(): Promise<boolean> {
  const { user } = await requireUser();
  const supabase = await createClient();

  // Kendi satırını okuyabilir (90_rls): satır varsa yöneticidir.
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return Boolean(data);
});

export async function loadDemoRequests(status?: DemoRequestStatus): Promise<DemoRequest[]> {
  const supabase = await createClient();

  let query = supabase
    .from("demo_requests")
    .select(
      "id, created_at, full_name, org_name, email, phone, business_type, message, status, marketing_ok, notice_version, source, internal_note, handled_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);

  const { data } = await query;

  return (data ?? []).map((row) => ({
    id: row.id,
    createdAt: new Date(row.created_at),
    fullName: row.full_name,
    orgName: row.org_name,
    email: row.email,
    phone: row.phone,
    businessType: row.business_type,
    message: row.message,
    status: row.status,
    marketingOk: row.marketing_ok,
    noticeVersion: row.notice_version,
    source: row.source,
    internalNote: row.internal_note,
    handledAt: row.handled_at ? new Date(row.handled_at) : null,
  }));
}

export const STATUS_LABELS: Record<DemoRequestStatus, { label: string; tone: string }> = {
  new: { label: "Yeni", tone: "text-st-pending" },
  contacted: { label: "Dönüş yapıldı", tone: "text-st-arrived" },
  qualified: { label: "Pilot adayı", tone: "text-st-confirmed" },
  closed: { label: "Kapandı", tone: "text-ink-3" },
};

export const BUSINESS_LABELS: Record<string, string> = {
  dis_klinigi: "Diş kliniği",
  saglik_diger: "Diğer sağlık",
  kisisel_bakim: "Kişisel bakım",
  diger: "Diğer",
};
