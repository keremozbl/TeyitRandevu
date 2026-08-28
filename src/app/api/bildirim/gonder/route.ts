import { NextResponse } from "next/server";

import { dispatchNotifications } from "@/lib/notifications/dispatch";

/**
 * Kuyruğu boşaltan uç nokta. Zamanlayıcı (Vercel Cron, `vercel.json`) belirli
 * aralıklarla çağırır.
 *
 * Kimlik doğrulaması bir sırla: `Authorization: Bearer <CRON_SECRET>`. Vercel
 * Cron bu başlığı kendi gönderiyor. Sır TANIMLI DEĞİLSE uç nokta çalışmaz —
 * korumasız açık bırakmak, herkesin kuyruğu tetikleyebilmesi demek olurdu.
 *
 * GET de POST da kabul ediliyor: Vercel Cron GET atıyor, elle tetiklemek için
 * POST daha doğru.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? process.env.NOTIFY_CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

async function handle(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET ?? process.env.NOTIFY_CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil; kuyruk işleyicisi kapalı." },
      { status: 503 },
    );
  }

  if (!authorized(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("adet") ?? 20);

  try {
    const report = await dispatchNotifications({
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 20,
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    });
    return NextResponse.json(report);
  } catch (cause) {
    // Ayrıntı sunucu günlüğüne; dışarı genel mesaj (CANLIYA-GECIS B7).
    console.error("[bildirim] kuyruk işlenemedi", cause);
    return NextResponse.json({ error: "Kuyruk işlenemedi" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
