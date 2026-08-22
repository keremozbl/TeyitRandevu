import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * E-posta doğrulama ve magic link dönüşü. Supabase kodu buraya bırakır,
 * biz oturuma çeviririz.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/giris?hata=${encodeURIComponent("Giriş bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/giris?hata=${encodeURIComponent("Oturum açılamadı. Bağlantının süresi dolmuş olabilir; yeni bir bağlantı isteyin.")}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
