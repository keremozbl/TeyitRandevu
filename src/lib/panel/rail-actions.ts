"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { RAIL_COOKIE, type RailState } from "./rail";

/**
 * Rayı katlar ya da açar.
 *
 * Server action, çünkü düğme bir `<form>` içinde: JavaScript çalışmadığında da
 * tercih kaydediliyor. Oturuma değil cookie'ye yazılıyor — kullanıcının
 * kurumu değil tarayıcısı hatırlasın, aynı hesap dizüstünde katlı,
 * masaüstünde açık olabilsin.
 */
export async function toggleRailAction() {
  const store = await cookies();
  const next: RailState = store.get(RAIL_COOKIE)?.value === "kapali" ? "acik" : "kapali";

  store.set(RAIL_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  // Ray layout'ta; sayfayı değil layout'u tazelemek gerekiyor.
  revalidatePath("/app", "layout");
}
