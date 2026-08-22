import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Çıkış yalnızca POST ile: GET olsaydı önceden getirme ile oturum kapanabilirdi. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/giris", request.nextUrl.origin), {
    status: 303,
  });
}
