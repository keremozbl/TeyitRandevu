"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { SITE_NOTICE_VERSION } from "@/lib/legal/site-texts";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * Demo talebi formu.
 *
 * Yazma yolu `public.submit_demo_request`; `anon` rolünün `demo_requests`
 * tablosunda hiçbir yetkisi yok (CLAUDE.md kural 8). İstemci oturumsuz
 * (`createPublicClient`): formu dolduran kişi tesadüfen panele giriş yapmış
 * biri olsa bile talep aynı kapıdan geçer.
 *
 * Doğrulama iki yerde: burada kullanıcıya anlaşılır cümle üretmek için,
 * veritabanında ise gerçekten kapı olduğu için. Buradaki kontrol atlanabilir,
 * oradaki atlanamaz.
 */

const schema = z.object({
  ad: z.string().trim().min(2, "Adınızı yazın").max(160),
  eposta: z.email("E-posta adresi geçerli görünmüyor").max(254),
  kurum: z.string().trim().max(160).optional(),
  telefon: z.string().trim().max(32).optional(),
  sektor: z.string().trim().max(60).optional(),
  mesaj: z.string().trim().max(4000).optional(),
});

export type DemoFormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Partial<Record<"ad" | "eposta", string>>;
};

/** `inet` cast'i biçimi tutmayan değerde patlar; rıza kaydındaki ile aynı eleme. */
async function clientIp(): Promise<string | undefined> {
  const store = await headers();
  const raw = store.get("x-forwarded-for")?.split(",")[0] ?? store.get("x-real-ip") ?? "";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 45) return undefined;
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : undefined;
}

const REASONS: Record<string, string> = {
  invalid_name: "Adınızı yazın.",
  invalid_email: "E-posta adresi geçerli görünmüyor.",
  message_too_long: "Mesaj çok uzun.",
  missing_notice: "Form yenilenmiş olabilir; sayfayı tazeleyip tekrar deneyin.",
  rate_limited:
    "Bu adresten bugün çok sayıda talep geldi. Yarın tekrar deneyin ya da doğrudan e-posta yazın.",
};

export async function submitDemoRequestAction(
  _prev: DemoFormState,
  formData: FormData,
): Promise<DemoFormState> {
  const parsed = schema.safeParse({
    ad: formData.get("ad") ?? "",
    eposta: formData.get("eposta") ?? "",
    kurum: formData.get("kurum") ?? "",
    telefon: formData.get("telefon") ?? "",
    sektor: formData.get("sektor") ?? "",
    mesaj: formData.get("mesaj") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path[0];
    return {
      error: issue.message,
      fieldErrors: path === "ad" || path === "eposta" ? { [path]: issue.message } : undefined,
    };
  }

  const input = parsed.data;
  const store = await headers();

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("submit_demo_request", {
    _full_name: input.ad,
    _email: input.eposta,
    _notice_version: SITE_NOTICE_VERSION,
    _org_name: input.kurum || undefined,
    _phone: input.telefon || undefined,
    _business_type: input.sektor || undefined,
    _message: input.mesaj || undefined,
    // Onay kutusu işaretlenmediyse alan hiç gelmez; varlığı onaydır.
    _marketing_ok: formData.get("onay_ticari") === "on",
    _source: formData.get("kaynak")?.toString().slice(0, 120) || undefined,
    _ip: await clientIp(),
    _user_agent: store.get("user-agent")?.slice(0, 400) ?? undefined,
  });

  if (error) {
    // Ayrıntı sunucuya, kullanıcıya genel cümle (CANLIYA-GECIS B7).
    console.error("[demo] talep yazılamadı:", error.message);
    return { error: "Talep kaydedilemedi. Lütfen tekrar deneyin ya da e-posta yazın." };
  }

  const result = data as { ok?: boolean; reason?: string } | null;
  if (!result?.ok) {
    const reason = result?.reason ?? "";
    return { error: REASONS[reason] ?? "Talep kaydedilemedi. Lütfen tekrar deneyin." };
  }

  return { ok: true };
}
