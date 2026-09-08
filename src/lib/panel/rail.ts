import { cookies } from "next/headers";

/**
 * Kenar çubuğunun katlanma tercihi.
 *
 * Tema `localStorage`'da ama bu cookie'de — sebebi ikisinin farklı problemi
 * çözmesi: tema kök layout'ta okunsaydı pazarlama sayfaları statik ön
 * üretimden çıkardı, oysa panel zaten istek başına çiziliyor (oturum, kurum,
 * RLS). Cookie'yi sunucuda okuyunca ray doğru genişlikte basılıyor ve
 * hidrasyonda genişleyip daralma titremesi olmuyor.
 */

export const RAIL_COOKIE = "tr_ray";

export type RailState = "acik" | "kapali";

export async function readRail(): Promise<RailState> {
  const value = (await cookies()).get(RAIL_COOKIE)?.value;
  return value === "kapali" ? "kapali" : "acik";
}
