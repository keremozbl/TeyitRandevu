/**
 * Günün programının veri katmanı.
 *
 * Rapor kendi yetki mantığını kurmuyor (Plan 8.3): hangi randevunun görüneceğine
 * RLS karar veriyor. Kapsamı "kendi randevuları" olan bir hekim bu sorguyu
 * çalıştırdığında yalnızca kendi hastalarını görür — rapor bunu bilmek zorunda
 * bile değil.
 */

import { utcToPlainDate, zonedTimeToUtc } from "@/lib/domain";
import { GRID_STATUSES } from "@/lib/scheduling/status";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneTr } from "@/lib/utils/phone";

import type { ProgramEntry, ProgramReport, ProgramStatus } from "./program";

export type BranchChoice = { id: string; name: string; timezone: string | null };

/** Programın çizileceği gün ve şube. */
export async function loadProgram({
  tenantId,
  tenantName,
  tenantTimeZone,
  date: rawDate,
  branchId,
}: {
  tenantId: string;
  tenantName: string;
  tenantTimeZone: string;
  date?: string;
  branchId?: string;
}): Promise<{ report: ProgramReport; branches: BranchChoice[]; timeZone: string } | null> {
  const supabase = await createClient();

  const { data: branchRows } = await supabase
    .from("branches")
    .select("id, name, timezone")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");

  const branches: BranchChoice[] = branchRows ?? [];
  const branch = branches.find((row) => row.id === branchId) ?? branches[0];
  if (!branch) return null;

  const timeZone = branch.timezone?.trim() || tenantTimeZone;
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : utcToPlainDate(new Date(), timeZone);

  const dayStart = zonedTimeToUtc(date, "00:00", timeZone);
  const dayEnd = zonedTimeToUtc(date, "24:00", timeZone);

  const [resourceResult, appointmentResult] = await Promise.all([
    supabase
      .from("resources")
      .select("id, name, title, sort_order")
      .eq("branch_id", branch.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("appointments")
      .select(
        "id, resource_id, starts_at, ends_at, status, notes, customers(full_name, phone), services(name, price)",
      )
      .eq("branch_id", branch.id)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at"),
  ]);

  const clock = new Intl.DateTimeFormat("tr-TR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  const rows = appointmentResult.data ?? [];
  const byResource = new Map<string, ProgramEntry[]>();
  let cancelledCount = 0;
  let noShowCount = 0;

  for (const row of rows) {
    if (row.status === "cancelled") {
      cancelledCount += 1;
      continue;
    }
    if (row.status === "no_show") {
      noShowCount += 1;
      continue;
    }
    if (!GRID_STATUSES.includes(row.status)) continue;

    const price = row.services?.price;
    const entry: ProgramEntry = {
      id: row.id,
      startsAt: clock.format(new Date(row.starts_at)),
      endsAt: clock.format(new Date(row.ends_at)),
      customerName: row.customers?.full_name ?? null,
      customerPhone: row.customers?.phone ? formatPhoneTr(row.customers.phone) : null,
      serviceName: row.services?.name ?? null,
      status: row.status as ProgramStatus,
      notes: row.notes,
      price: price === null || price === undefined ? null : Number(price),
    };
    byResource.set(row.resource_id, [...(byResource.get(row.resource_id) ?? []), entry]);
  }

  const groups = (resourceResult.data ?? []).map((resource) => ({
    resourceId: resource.id,
    resourceName: `${resource.title ? `${resource.title} ` : ""}${resource.name}`,
    entries: byResource.get(resource.id) ?? [],
  }));

  return {
    report: {
      date,
      tenantName,
      branchName: branches.length > 1 ? branch.name : null,
      groups,
      cancelledCount,
      noShowCount,
    },
    branches,
    timeZone,
  };
}
