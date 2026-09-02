"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { demoAccount } from "./config";

/**
 * Vitrin oturumunu açar.
 *
 * Ayrıcalıklı istemci YOK: giriş, herkesin kullandığı yoldan
 * `signInWithPassword` ile yapılıyor, yani oturum da sıradan bir kullanıcı
 * oturumu. Ziyaretçinin vitrin kurumu dışında bir şey görmemesini sağlayan
 * tek şey RLS.
 */
export async function startDemoAction() {
  const account = demoAccount();
  if (!account) redirect("/demo?durum=kapali");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(account);

  // Hata metni ziyaretçiye gösterilmiyor: "invalid login credentials" ona bir
  // şey anlatmaz, sunucu günlüğüne düşmesi yeterli.
  if (error) {
    console.error("[vitrin] giriş başarısız:", error.message);
    redirect("/demo?durum=hata");
  }

  redirect("/app");
}
