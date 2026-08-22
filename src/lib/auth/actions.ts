"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string };

const emailSchema = z
  .string()
  .trim()
  .min(1, "E-posta adresi gerekli")
  .email("Geçerli bir e-posta adresi girin");

const passwordSchema = z
  .string()
  .min(8, "Parola en az 8 karakter olmalı");

function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

const NOT_CONFIGURED =
  "Supabase bağlantısı yapılandırılmamış. .env dosyasına NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY ekleyin.";

/** Supabase'in İngilizce hata metinlerini kullanıcının anlayacağı hale getirir. */
function translate(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "E-posta veya parola hatalı. Parolanızı unuttuysanız sıfırlama bağlantısı isteyin.";
  if (m.includes("email not confirmed"))
    return "E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki bağlantıya tıklayın.";
  if (m.includes("user already registered"))
    return "Bu e-posta zaten kayıtlı. Giriş yapmayı deneyin.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar deneyin.";
  return message;
}

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isConfigured()) return { error: NOT_CONFIGURED };

  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0].message };

  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Parola gerekli" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password,
  });

  if (error) return { error: translate(error.message) };
  redirect("/app");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isConfigured()) return { error: NOT_CONFIGURED };

  const parsed = z
    .object({
      full_name: z.string().trim().min(2, "Adınızı yazın"),
      email: emailSchema,
      password: passwordSchema,
    })
    .safeParse({
      full_name: formData.get("full_name"),
      email: formData.get("email"),
      password: formData.get("password"),
    });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      // Yetki kararlarında ASLA kullanılmaz — user_metadata kullanıcı tarafından
      // düzenlenebilir. Yalnızca görüntüleme için.
      data: { full_name: parsed.data.full_name },
    },
  });

  if (error) return { error: translate(error.message) };

  return {
    notice:
      "Hesabınız oluşturuldu. Doğrulama bağlantısını göndermek üzere e-postanıza baktık — gelen kutunuzu kontrol edin.",
  };
}

export async function sendMagicLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  if (!isConfigured()) return { error: NOT_CONFIGURED };

  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) return { error: email.error.issues[0].message };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) return { error: translate(error.message) };

  return { notice: `Giriş bağlantısı ${email.data} adresine gönderildi.` };
}
