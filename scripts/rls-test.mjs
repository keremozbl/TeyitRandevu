/**
 * Canlı RLS doğrulaması. İki test kullanıcısı açar, biri kurum kurar,
 * diğerinin o kurumu göremediğini kanıtlar, sonra çakışma kısıtını dener.
 * Sonunda oluşturduğu her şeyi siler.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
const tpl = JSON.parse(readFileSync("src/lib/templates/dis-klinigi.json", "utf8"));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  ✓", m); };
const no = (m, d) => { fail++; console.log("  ✗", m, d ? `\n      → ${d}` : ""); };
/** Tek satırlık iddia: koşul doğruysa ok, değilse no. */
function check(cond, okMsg, failMsg, detail) {
  if (cond) ok(okMsg);
  else no(failMsg ?? okMsg, detail);
}

const stamp = Date.now();
const users = [
  { email: `rls-test-a-${stamp}@teyit.test`, pw: "TestParola123!" },
  { email: `rls-test-b-${stamp}@teyit.test`, pw: "TestParola123!" },
];

async function makeUser(u) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email, password: u.pw, email_confirm: true,
  });
  if (error) throw new Error(`kullanıcı: ${error.message}`);
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.signInWithPassword({ email: u.email, password: u.pw });
  if (e2) throw new Error(`giriş: ${e2.message}`);
  return { id: data.user.id, client: c };
}

let a, b, tenantId;

try {
  console.log("\n[1] Test kullanıcıları");
  a = await makeUser(users[0]);
  b = await makeUser(users[1]);
  ok(`iki kullanıcı oluşturuldu ve giriş yaptı`);

  console.log("\n[2] Üyeliği olmayan kullanıcı hiçbir şey görmemeli");
  for (const t of ["tenants", "customers", "appointments", "services", "memberships"]) {
    const { data, error } = await a.client.from(t).select("*");
    if (error) no(`${t} okunamadı`, error.message);
    else check(data.length === 0, `${t}: 0 satır`, `${t}: ${data.length} satır SIZDI`);
  }

  console.log("\n[3] Global kataloglar okunabilmeli");
  const { data: perms } = await a.client.from("permissions").select("key");
  check(perms?.length === 21, `permissions: ${perms?.length} satır`, `permissions: ${perms?.length} (beklenen 21)`);

  console.log("\n[4] tenants tablosuna doğrudan INSERT engellenmeli");
  const { error: insErr } = await a.client.from("tenants")
    .insert({ name: "Korsan", slug: `korsan-${stamp}`, family: "saglik", business_type: "x" });
  check(Boolean(insErr), `reddedildi: ${insErr?.code}`, "doğrudan INSERT GEÇTİ");

  console.log("\n[5] Kurulum RPC'si");
  const payload = {
    terminology: tpl.terminology, booking_rules: tpl.booking_rules,
    branch_name: "Merkez", resources: tpl.resources, services: tpl.services,
    customer_fields: tpl.customer_fields, appointment_fields: tpl.appointment_fields,
    working_hours: { weekdays: [1,2,3,4,5], starts_at: "09:00", ends_at: "18:00", break: tpl.working_hours.break },
  };
  const { data: tid, error: rpcErr } = await a.client.rpc("create_tenant_from_template", {
    _name: "RLS Test Kliniği", _slug: `rls-test-${stamp}`, _family: "saglik",
    _business_type: "dis_klinigi", _timezone: "Europe/Istanbul", _payload: payload,
  });
  if (rpcErr) throw new Error(`RPC: ${rpcErr.message}`);
  tenantId = tid;
  ok(`kurum kuruldu: ${tid}`);

  console.log("\n[6] Şablon kopyalandı mı");
  const checks = [
    ["services", tpl.services.length],
    ["resources", tpl.resources.length],
    ["roles", 6],
    ["branches", 1],
    ["field_definitions", tpl.customer_fields.length + tpl.appointment_fields.length],
  ];
  for (const [table, expected] of checks) {
    const { data } = await a.client.from(table).select("id");
    check(data?.length === expected, `${table}: ${data?.length}`, `${table}: ${data?.length} (beklenen ${expected})`);
  }
  // öğle arası günü ikiye böler: 5 gün × 2 aralık × 1 personel kaynağı
  const { data: wh } = await a.client.from("working_hours").select("id");
  check(wh?.length === 10, "working_hours: 10 (öğle arası günü ikiye bölmüş)", `working_hours: ${wh?.length} (beklenen 10)`);

  console.log("\n[7] İKİNCİ KULLANICI HİÇBİR ŞEY GÖRMEMELİ  ← asıl test");
  for (const t of ["tenants", "services", "resources", "roles", "branches", "field_definitions", "working_hours"]) {
    const { data } = await b.client.from(t).select("id");
    check(data?.length === 0, `${t}: 0 satır`, `${t}: ${data?.length} satır SIZDI`);
  }

  console.log("\n[8] Çakışma kısıtı — çift rezervasyon");
  const { data: res } = await a.client.from("resources").select("id, branch_id").eq("kind", "staff").limit(1);
  const { data: svc } = await a.client.from("services").select("id, duration_min").limit(1);
  const r = res[0], s = svc[0];

  const { data: cust, error: cErr } = await a.client.from("customers")
    .insert({ tenant_id: tenantId, branch_id: r.branch_id, full_name: "Test Hasta", phone: "+905551112233" })
    .select().single();
  check(!cErr, "hasta oluşturuldu", "hasta oluşturulamadı", cErr?.message);

  const base = { tenant_id: tenantId, branch_id: r.branch_id, resource_id: r.id,
                 customer_id: cust?.id, service_id: s.id, status: "confirmed" };
  const t1 = new Date(Date.now() + 86400000); t1.setUTCMinutes(0, 0, 0);
  const t2 = new Date(t1.getTime() + s.duration_min * 60000);

  const { error: a1 } = await a.client.from("appointments")
    .insert({ ...base, starts_at: t1.toISOString(), ends_at: t2.toISOString() });
  check(!a1, "ilk randevu eklendi", "ilk randevu eklenemedi", a1?.message);

  // Aynı kaynak, kesişen aralık → veritabanı reddetmeli
  const o1 = new Date(t1.getTime() + 10 * 60000);
  const o2 = new Date(o1.getTime() + s.duration_min * 60000);
  const { error: a2 } = await a.client.from("appointments")
    .insert({ ...base, starts_at: o1.toISOString(), ends_at: o2.toISOString() });
  check(Boolean(a2), `çakışan randevu REDDEDİLDİ (${a2?.code})`, "ÇAKIŞAN RANDEVU KABUL EDİLDİ");

  // İptal edilmiş randevu yer kaplamamalı
  await a.client.from("appointments").update({ status: "cancelled" })
    .eq("resource_id", r.id).eq("starts_at", t1.toISOString());
  const { error: a3 } = await a.client.from("appointments")
    .insert({ ...base, starts_at: t1.toISOString(), ends_at: t2.toISOString() });
  check(!a3, "iptal edilen randevu yer kaplamıyor", "iptal sonrası slot hâlâ dolu", a3?.message);

  console.log("\n[9] Tıbbi not ayrı izin");
  const { error: mnErr } = await a.client.from("customer_medical_notes")
    .insert({ tenant_id: tenantId, customer_id: cust.id, resource_id: r.id, branch_id: r.branch_id, body: "test" });
  // owner 'tenant' kapsamında yazma iznine sahip
  check(!mnErr, "owner tıbbi not yazabiliyor", "owner tıbbi not yazamadı", mnErr?.message);
  const { data: mnB } = await b.client.from("customer_medical_notes").select("id");
  check(mnB?.length === 0, "yabancı kullanıcı tıbbi notu göremiyor", `SIZDI: ${mnB?.length}`);

  console.log("\n[10] Yetki fonksiyonları dışarıdan çağrılamamalı");
  const { error: fnErr } = await a.client.rpc("allows", { _perm: "appointment.read", _tenant: tenantId });
  check(Boolean(fnErr), "private.allows RPC ile çağrılamıyor", "private fonksiyon DIŞARIDAN ÇAĞRILABİLDİ");

} catch (e) {
  no("BEKLENMEYEN HATA", e.message);
} finally {
  console.log("\n[temizlik]");
  if (tenantId) {
    const { error } = await admin.from("tenants").delete().eq("id", tenantId);
    console.log(error ? `  kurum silinemedi: ${error.message}` : "  kurum ve bağlı tüm kayıtlar silindi");
  }
  for (const u of [a, b]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id);
  }
  console.log("  test kullanıcıları silindi");
  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı\n`);
  process.exit(fail > 0 ? 1 : 0);
}
