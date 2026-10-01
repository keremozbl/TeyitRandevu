"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getTemplate } from "@/lib/templates";

import { demoCredentials, isDemoEnabled, isDemoUser } from "./config";

/**
 * Demo oturumu açar ve ziyaretçiyi KURULUM sihirbazına bırakır.
 *
 * Neden hazır bir kuruma değil de kuruluma: ürünün ilk beş dakikası kurulumdur.
 * Ziyaretçi kendi işletmesinin adını yazıp sektörünü seçtiğinde panel onun
 * diliyle açılıyor ("Danışanlar", "Ustalar"), takvim onun saatleriyle
 * çiziliyor. Hazır bir kuruma düşseydi bunların hiçbirini görmezdi.
 *
 * Hesap servis rolüyle açılıyor (RLS baypası burada zorunlu: kullanıcı henüz
 * yok), ama oturum SIRADAN yoldan — `signInWithPassword` — kuruluyor. Yani
 * ziyaretçi paneli gerçek bir kullanıcı olarak geziyor; onu kendi kurumuyla
 * sınırlayan tek şey RLS.
 */

/**
 * Kaba kuvvet freni.
 *
 * Süreç belleğinde: Vercel'de her örnek kendi sayacını tutar, yani gerçek bir
 * sınır DEĞİL — yalnızca kazara/otomatik tıklamayı yavaşlatır. Kalıcı sınır
 * (IP tablosu ya da `submit_demo_request` gibi bir fonksiyon) canlıya
 * çıkmadan gerekiyor: CANLIYA-GECIS B12.
 */
const attempts = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function allow(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    attempts.set(ip, recent);
    return false;
  }
  recent.push(now);
  attempts.set(ip, recent);
  return true;
}

async function clientIp(): Promise<string> {
  const store = await headers();
  return (
    store.get("x-forwarded-for")?.split(",")[0]?.trim() || store.get("x-real-ip")?.trim() || "yerel"
  );
}

export async function startDemoAction(formData: FormData) {
  const sector = String(formData.get("sektor") ?? "");
  if (!getTemplate(sector)) redirect("/?durum=sektor#demo");
  if (!isDemoEnabled()) redirect("/?durum=kapali#demo");

  const supabase = await createClient();

  // Elinde zaten bir demo oturumu varsa yeni hesap açma: çift tıklama ve geri
  // tuşu yüzünden ortalık geçici hesapla dolmasın.
  const {
    data: { user: current },
  } = await supabase.auth.getUser();
  if (isDemoUser(current)) redirect(`/kurulum?sektor=${sector}`);

  if (!allow(await clientIp())) redirect("/?durum=yogun#demo");

  const { email, password } = demoCredentials();
  const admin = createAdminClient();

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // Kendi SMTP'miz yok; doğrulama e-postası beklemek demoyu bitirirdi.
    email_confirm: true,
    app_metadata: { demo: true, demo_sector: sector, demo_created_at: new Date().toISOString() },
    user_metadata: { full_name: "Demo kullanıcısı" },
  });

  if (createError) {
    console.error("[vitrin] demo hesabı açılamadı:", createError.message);
    redirect("/?durum=hata#demo");
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error("[vitrin] demo girişi başarısız:", signInError.message);
    redirect("/?durum=hata#demo");
  }

  redirect(`/kurulum?sektor=${sector}`);
}
