"use server";

import { requireTenant } from "@/lib/auth/session";

import { searchCustomersQuick, type CustomerHit } from "./queries";

/**
 * ⌘K aramasının sunucu ucu.
 *
 * Route handler değil server action: yeni bir uç açmadan, kullanıcının
 * JWT'siyle gidiyor ve RLS geçerli kalıyor (Kural 3 ve 4). Kurum da
 * istemciden değil oturumdan geliyor — istemcinin gönderdiği bir kurum
 * kimliğine güvenmek kiracı sınırını istemciye taşımak olurdu.
 */
export async function searchCustomersAction(term: string): Promise<CustomerHit[]> {
  const { active } = await requireTenant();

  return searchCustomersQuick({
    tenantId: active.tenant.id,
    search: typeof term === "string" ? term : "",
  });
}
