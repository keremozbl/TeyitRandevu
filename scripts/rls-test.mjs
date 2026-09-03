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
  { email: `rls-test-c-${stamp}@teyit.test`, pw: "TestParola123!" },
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

let a, b, c, tenantId;

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
  check(perms?.length === 23, `permissions: ${perms?.length} satır`, `permissions: ${perms?.length} (beklenen 23)`);

  console.log("\n[4] tenants tablosuna doğrudan INSERT engellenmeli");
  const { error: insErr } = await a.client.from("tenants")
    .insert({ name: "Korsan", slug: `korsan-${stamp}`, family: "saglik", business_type: "x" });
  check(Boolean(insErr), `reddedildi: ${insErr?.code}`, "doğrudan INSERT GEÇTİ");

  console.log("\n[5] Kurulum RPC'si");
  const payload = {
    terminology: tpl.terminology, booking_rules: tpl.booking_rules,
    branch_name: "Merkez", resources: tpl.resources, services: tpl.services,
    customer_fields: tpl.customer_fields, appointment_fields: tpl.appointment_fields,
    notification_defaults: tpl.notification_defaults,
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

  console.log("\n[9] Randevu oluşturma RPC'si — randevu ve hasta TEK işlemde");
  const rpcStart = new Date(Date.now() + 3 * 86400000);
  rpcStart.setUTCHours(6, 0, 0, 0);
  const rpcPhone = "+905559998877";
  const orphanPhone = "+905559990000";

  const rpcArgs = {
    _tenant_id: tenantId, _branch_id: r.branch_id, _resource_id: r.id,
    _starts_at: rpcStart.toISOString(), _duration_min: 30, _status: "confirmed",
    _service_id: s.id,
  };

  const { data: newId, error: rpc1 } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _customer_name: "RPC Hasta", _customer_phone: rpcPhone,
  });
  check(!rpc1 && Boolean(newId), "randevu ve yeni hasta oluşturuldu", "RPC başarısız", rpc1?.message);

  const { data: firstCust } = await a.client.from("customers").select("id").eq("phone", rpcPhone);
  check(firstCust?.length === 1, "hasta bir kez kaydedildi", `hasta ${firstCust?.length} kez kaydedildi`);

  // Aynı telefonla ikinci randevu: ikinci bir hasta kaydı AÇILMAMALI
  const later = new Date(rpcStart.getTime() + 3600000);
  const { error: rpc2 } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: later.toISOString(),
    _customer_name: "RPC Hasta (tekrar)", _customer_phone: rpcPhone,
  });
  const { data: afterSecond } = await a.client.from("customers").select("id").eq("phone", rpcPhone);
  check(!rpc2 && afterSecond?.length === 1, "aynı telefon ikinci kayıt açmıyor",
    `telefon tekrarında ${afterSecond?.length} kayıt`, rpc2?.message);

  // ASIL İDDİA: çakışma hatası hasta kaydını da geri almalı
  const { error: rpc3 } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _customer_name: "Öksüz Kalmamalı", _customer_phone: orphanPhone,
  });
  check(rpc3?.code === "23P01", `çakışan randevu REDDEDİLDİ (${rpc3?.code})`,
    "ÇAKIŞAN RANDEVU KABUL EDİLDİ", rpc3?.message);
  const { data: orphan } = await a.client.from("customers").select("id").eq("phone", orphanPhone);
  check(orphan?.length === 0, "çakışmada hasta kaydı da geri alındı",
    `ÖKSÜZ HASTA KAYDI KALDI: ${orphan?.length}`);

  // Kaynak ile şube uyuşmuyorsa reddedilmeli
  const { error: rpc4 } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _branch_id: crypto.randomUUID(),
    _starts_at: new Date(rpcStart.getTime() + 7200000).toISOString(),
  });
  check(Boolean(rpc4), "kaynak-şube uyuşmazlığı reddedildi", "UYUŞMAYAN ŞUBE KABUL EDİLDİ");

  // Yabancı kullanıcı bu kuruma randevu yazamamalı
  const { error: rpc5 } = await b.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: new Date(rpcStart.getTime() + 10800000).toISOString(),
    _customer_name: "Korsan",
  });
  check(Boolean(rpc5), "yabancı kullanıcı RPC ile randevu yazamıyor", "YABANCI KULLANICI RANDEVU YAZDI");

  console.log("\n[10] Durum değişikliğinin yan etkileri veritabanında");
  const readAppointment = async () => (await a.client.from("appointments")
    .select("status, cancelled_at, cancelled_by, no_show_at").eq("id", newId).single()).data;
  const readNoShowCount = async () => (await a.client.from("customers")
    .select("no_show_count").eq("phone", rpcPhone).single()).data?.no_show_count;

  await a.client.from("appointments").update({ status: "no_show" }).eq("id", newId);
  const afterNoShow = await readAppointment();
  check(Boolean(afterNoShow?.no_show_at), "gelmedi damgası atıldı", "no_show_at boş kaldı");
  check(await readNoShowCount() === 1, "hasta gelmeme sayacı arttı", "sayaç artmadı");

  await a.client.from("appointments").update({ status: "confirmed" }).eq("id", newId);
  const undoneNoShow = await readAppointment();
  check(undoneNoShow?.no_show_at === null, "gelmedi geri alınınca damga silindi", "damga kaldı");
  check(await readNoShowCount() === 0, "sayaç geri alındı", "sayaç düşmedi");

  await a.client.from("appointments")
    .update({ status: "cancelled", cancelled_reason: "Hasta erteledi" }).eq("id", newId);
  const afterCancel = await readAppointment();
  check(Boolean(afterCancel?.cancelled_at), "iptal zamanı damgalandı", "cancelled_at boş kaldı");
  check(afterCancel?.cancelled_by === a.id, "iptal eden kullanıcı yazıldı", "cancelled_by yanlış");

  await a.client.from("appointments").update({ status: "confirmed" }).eq("id", newId);
  const afterUndo = await readAppointment();
  check(afterUndo?.cancelled_at === null && afterUndo?.cancelled_by === null,
    "iptal geri alınınca iz kalmıyor", "iptal izi kaldı");

  console.log("\n[11] Tıbbi not ayrı izin");
  const { error: mnErr } = await a.client.from("customer_medical_notes")
    .insert({ tenant_id: tenantId, customer_id: cust.id, resource_id: r.id, branch_id: r.branch_id, body: "test" });
  // owner 'tenant' kapsamında yazma iznine sahip
  check(!mnErr, "owner tıbbi not yazabiliyor", "owner tıbbi not yazamadı", mnErr?.message);
  const { data: mnB } = await b.client.from("customer_medical_notes").select("id");
  check(mnB?.length === 0, "yabancı kullanıcı tıbbi notu göremiyor", `SIZDI: ${mnB?.length}`);

  // Asıl vaka yabancı değil, AYNI KURUMDAKİ resepsiyon: hastayı görmeli,
  // tedavi notunu görmemeli. Hasta kartı bu ayrımın üstünde duruyor.
  console.log();
  console.log("[11b] Aynı kurumun resepsiyonu tıbbi notu görmemeli");
  c = await makeUser(users[2]);
  const { data: recRole } = await admin.from("roles")
    .select("id").eq("tenant_id", tenantId).eq("key", "resepsiyon").single();
  const { error: memErr } = await admin.from("memberships")
    .insert({ user_id: c.id, tenant_id: tenantId, role_id: recRole.id, is_active: true });
  check(!memErr, "resepsiyon üyeliği açıldı", "üyelik açılamadı", memErr?.message);

  const { data: recCustomers } = await c.client.from("customers").select("id");
  check(recCustomers?.length > 0, "resepsiyon hastayı görüyor", "resepsiyon hastayı GÖREMİYOR");

  const { data: recNotes } = await c.client.from("customer_medical_notes").select("id");
  check(recNotes?.length === 0, "resepsiyon tıbbi notu göremiyor", `SIZDI: ${recNotes?.length}`);

  const { error: recWrite } = await c.client.from("customer_medical_notes")
    .insert({ tenant_id: tenantId, customer_id: cust.id, resource_id: r.id, branch_id: r.branch_id, body: "olmamalı" });
  check(Boolean(recWrite), `resepsiyon tıbbi not yazamıyor (${recWrite?.code})`, "RESEPSİYON TIBBİ NOT YAZDI");

  // Arayüz bölümü açıp açmayacağını buradan okuyor (izin değil, görünürlük)
  const { data: recPerms } = await c.client.from("role_permissions")
    .select("permission_key").eq("role_id", recRole.id);
  const keys = (recPerms ?? []).map((row) => row.permission_key);
  check(keys.includes("customer.read"), "resepsiyon izinleri okunabiliyor", "role_permissions okunamadı");
  check(!keys.includes("customer.medical_notes.read"),
    "resepsiyon rolünde tıbbi not izni yok", "resepsiyonda tıbbi not izni ÇIKTI");

  // Denetim kaydı: okuması ayrı izin, yazması hiç kimsede yok. Satırın
  // kendisi de veri: hangi hastanın kartının açıldığını söylüyor.
  console.log();
  console.log("[11d] Denetim kaydı — okuma ayrı izin, yazma kimsede yok");
  const { error: auditSeedErr } = await admin.from("audit_logs").insert({
    tenant_id: tenantId, actor_id: a.id, action: "read",
    entity: "customer", entity_id: cust.id,
  });
  check(!auditSeedErr, "servis rolü denetim kaydı yazabiliyor",
    "servis rolü yazamadı", auditSeedErr?.message);

  const { data: auditOwner } = await a.client.from("audit_logs").select("id");
  check(auditOwner?.length > 0, "owner denetim kaydını okuyabiliyor",
    "owner denetim kaydını OKUYAMIYOR — audit.read izni kopyalanmamış olabilir");

  const { data: auditRec } = await c.client.from("audit_logs").select("id");
  check(auditRec?.length === 0, "resepsiyon denetim kaydını göremiyor", `SIZDI: ${auditRec?.length}`);

  const { data: auditForeign } = await b.client.from("audit_logs").select("id");
  check(auditForeign?.length === 0, "yabancı kullanıcı denetim kaydını göremiyor",
    `SIZDI: ${auditForeign?.length}`);

  // Kaydı yazan kişi onu üretememeli: uydurma satır, denetimin tamamını
  // değersizleştirir.
  const { error: auditWrite } = await a.client.from("audit_logs").insert({
    tenant_id: tenantId, actor_id: a.id, action: "read", entity: "customer",
  });
  check(Boolean(auditWrite), `owner denetim kaydı YAZAMIYOR (${auditWrite?.code})`,
    "OWNER DENETİM KAYDI YAZDI");

  const { data: auditUpdated } = await a.client.from("audit_logs")
    .update({ action: "export" }).eq("tenant_id", tenantId).select("id");
  check((auditUpdated?.length ?? 0) === 0, "owner denetim kaydını değiştiremiyor",
    `DEĞİŞTİRDİ: ${auditUpdated?.length}`);

  const { data: auditDeleted } = await a.client.from("audit_logs")
    .delete().eq("tenant_id", tenantId).select("id");
  check((auditDeleted?.length ?? 0) === 0, "owner denetim kaydını silemiyor",
    `SİLDİ: ${auditDeleted?.length}`);

  // Demo talepleri platforma ait, kiracıya değil: hiçbir klinik kullanıcısı
  // başkasının satış kaydını görmemeli.
  console.log();
  console.log("[11e] Demo talepleri — yalnız platform yöneticisinde");
  // Oturumsuz istemci: siteyi açan ziyaretçi neyse o. (Public randevu
  // bölümündeki `pub` daha aşağıda tanımlanıyor.)
  const visitor = createClient(URL, ANON, { auth: { persistSession: false } });
  const demoEmail = `demo-test-${stamp}@teyit.test`;
  const { data: demoWrite, error: demoWriteErr } = await visitor.rpc("submit_demo_request", {
    _full_name: "Demo Testi",
    _email: demoEmail,
    _notice_version: "test.1",
    _org_name: "Test Kliniği",
    _marketing_ok: false,
  });
  check(!demoWriteErr && demoWrite?.ok === true, "anon demo talebi bırakabiliyor",
    "talep yazılamadı", demoWriteErr?.message ?? JSON.stringify(demoWrite));

  const { data: demoAnon } = await visitor.from("demo_requests").select("id");
  check(!demoAnon?.length, "anon talepleri okuyamıyor", `SIZDI: ${demoAnon?.length}`);

  const { data: demoOwner } = await a.client.from("demo_requests").select("id");
  check(!demoOwner?.length, "platform yöneticisi olmayan kullanıcı talepleri göremiyor",
    `SIZDI: ${demoOwner?.length}`);

  const { error: demoDirect } = await a.client.from("demo_requests").insert({
    full_name: "Elle", email: "elle@teyit.test", notice_version: "test.1",
  });
  check(Boolean(demoDirect), `tabloya doğrudan yazılamıyor (${demoDirect?.code})`,
    "DEMO TALEBİ TABLOYA DOĞRUDAN YAZILDI");

  const { data: adminSelf } = await a.client.from("platform_admins").select("user_id");
  check(!adminSelf?.length, "kullanıcı platform yöneticisi değil", "BEKLENMEYEN YÖNETİCİ SATIRI");

  const { error: adminInsert } = await a.client.from("platform_admins")
    .insert({ user_id: a.id, label: "kendini yönetici yaptı" });
  check(Boolean(adminInsert), `kullanıcı kendini yönetici yapamıyor (${adminInsert?.code})`,
    "KULLANICI KENDİNİ PLATFORM YÖNETİCİSİ YAPTI");

  // Yönetici olunca aynı sorgu görmeli — politika gerçekten bu tabloya bakıyor.
  await admin.from("platform_admins").insert({ user_id: a.id, label: "rls-test" });
  const { data: demoAsAdmin } = await a.client.from("demo_requests").select("id, email");
  check((demoAsAdmin ?? []).some((row) => row.email === demoEmail),
    "platform yöneticisi talepleri görüyor", "yönetici talepleri GÖREMİYOR");
  await admin.from("platform_admins").delete().eq("user_id", a.id);

  await admin.from("demo_requests").delete().eq("email", demoEmail);

  console.log("\n[12] Yetki fonksiyonları dışarıdan çağrılamamalı");
  const { error: fnErr } = await a.client.rpc("allows", { _perm: "appointment.read", _tenant: tenantId });
  check(Boolean(fnErr), "private.allows RPC ile çağrılamıyor", "private fonksiyon DIŞARIDAN ÇAĞRILABİLDİ");


  console.log("\n[13] Public randevu sayfası — anon rolü");
  // Oturumsuz istemci: public sayfayı açan ziyaretçi neyse o.
  const pub = createClient(URL, ANON, { auth: { persistSession: false } });
  const slug = `rls-test-${stamp}`;

  // Kural: anon HİÇBİR tabloyu okuyamaz, her şey booking_* fonksiyonlarından.
  for (const t of ["tenants", "appointments", "customers", "services", "resources", "consents"]) {
    const { data } = await pub.from(t).select("*");
    check(!data?.length, `${t}: anon'a kapalı`, `${t}: anon ${data?.length} satır GÖRDÜ`);
  }

  const { data: bookingPage, error: bpErr } = await pub.rpc("booking_page", { _slug: slug });
  check(!bpErr && bookingPage?.tenant?.id === tenantId, "booking_page kurumu döndü", "booking_page başarısız", bpErr?.message);
  check(bookingPage?.services?.length === tpl.services.length,
    `hizmetler geldi: ${bookingPage?.services?.length}`, `hizmet sayısı ${bookingPage?.services?.length}`);
  check(!JSON.stringify(bookingPage ?? {}).includes("Test Hasta"),
    "sayfada hasta verisi yok", "SAYFADA HASTA ADI SIZDI");

  const { data: unknownSlug } = await pub.rpc("booking_page", { _slug: `yok-${stamp}` });
  check(unknownSlug === null, "bilinmeyen slug null döner", "bilinmeyen slug veri döndü");

  await admin.from("tenants").update({ status: "suspended" }).eq("id", tenantId);
  const { data: suspended } = await pub.rpc("booking_page", { _slug: slug });
  check(suspended === null, "askıya alınan kurumun sayfası kapalı", "ASKIDAKİ KURUM RANDEVU VERİYOR");
  await admin.from("tenants").update({ status: "trial" }).eq("id", tenantId);

  const availFrom = new Date();
  const availTo = new Date(Date.now() + 10 * 86400000);
  const { data: avail } = await pub.rpc("booking_availability", {
    _slug: slug, _resource_ids: [r.id],
    _from: availFrom.toISOString(), _to: availTo.toISOString(),
  });
  check(avail?.working_hours?.length === 10, `çalışma saatleri geldi: ${avail?.working_hours?.length}`,
    `çalışma saati ${avail?.working_hours?.length}`);
  const busyKeys = Object.keys(avail?.busy?.[0] ?? {});
  check(busyKeys.every((k) => ["resource_id", "blocked_from", "blocked_to"].includes(k)),
    `dolu aralıklar yalnız zaman taşıyor: ${busyKeys.join(", ")}`, `DOLU ARALIKTA FAZLA ALAN: ${busyKeys.join(", ")}`);

  const { data: alienAvail } = await pub.rpc("booking_availability", {
    _slug: slug, _resource_ids: [crypto.randomUUID()],
    _from: availFrom.toISOString(), _to: availTo.toISOString(),
  });
  check(alienAvail?.working_hours?.length === 0, "yabancı kaynak süzülüyor", "YABANCI KAYNAĞIN SAATLERİ GELDİ");

  const { error: wideErr } = await pub.rpc("booking_availability", {
    _slug: slug, _resource_ids: [r.id], _from: availFrom.toISOString(),
    _to: new Date(Date.now() + 200 * 86400000).toISOString(),
  });
  check(Boolean(wideErr), "aşırı geniş tarih aralığı reddedildi", "200 GÜNLÜK ARALIK KABUL EDİLDİ");

  /** Hafta içine düşen, kurumun mesai saatindeki bir an (kurum UTC+03). */
  const weekdaySlot = (daysAhead, utcHour) => {
    const when = new Date();
    when.setUTCDate(when.getUTCDate() + daysAhead);
    when.setUTCHours(utcHour, 0, 0, 0);
    while (when.getUTCDay() === 0 || when.getUTCDay() === 6) {
      when.setUTCDate(when.getUTCDate() + 1);
    }
    return when;
  };
  const holdArgs = { _slug: slug, _service_id: s.id, _resource_id: r.id };

  const { data: hClosed } = await pub.rpc("booking_hold", {
    ...holdArgs, _starts_at: weekdaySlot(5, 0).toISOString(),  // 03:00 yerel
  });
  check(hClosed?.reason === "closed", "mesai dışı saat reddedildi", `mesai dışı: ${hClosed?.reason}`);

  const { data: hSoon } = await pub.rpc("booking_hold", {
    ...holdArgs, _starts_at: new Date(Date.now() + 30 * 60000).toISOString(),
  });
  check(hSoon?.reason === "too_soon", "minimum ön süre uygulandı", `ön süre: ${hSoon?.reason}`);

  const { data: hFar } = await pub.rpc("booking_hold", {
    ...holdArgs, _starts_at: new Date(Date.now() + 200 * 86400000).toISOString(),
  });
  check(hFar?.reason === "too_far", "ileri tarih sınırı uygulandı", `ileri tarih: ${hFar?.reason}`);

  const { data: hAlien } = await pub.rpc("booking_hold", {
    ...holdArgs, _resource_id: crypto.randomUUID(), _starts_at: weekdaySlot(5, 7).toISOString(),
  });
  check(hAlien?.reason === "resource_unavailable", "yabancı kaynağa randevu yazılamıyor",
    `yabancı kaynak: ${hAlien?.reason}`);

  const slotOne = weekdaySlot(5, 7);   // 10:00 yerel
  const { data: hold } = await pub.rpc("booking_hold", { ...holdArgs, _starts_at: slotOne.toISOString() });
  check(hold?.ok === true && Boolean(hold?.token), "slot tutuldu", `slot tutulamadı: ${hold?.reason}`);

  const { data: holdAgain } = await pub.rpc("booking_hold", { ...holdArgs, _starts_at: slotOne.toISOString() });
  check(holdAgain?.reason === "slot_taken", "tutulan slot ikinci kez verilmiyor", `ikinci tutma: ${holdAgain?.reason}`);

  const { data: holdLeak } = await pub.from("appointments").select("id");
  check(!holdLeak?.length, "anon tutma satırını okuyamıyor", "TUTMA SATIRI ANON'A GÖRÜNDÜ");

  const consentPayload = [
    { kind: "kvkk_aydinlatma", granted: true, text_version: "test.1" },
    { kind: "acik_riza_saglik", granted: true, text_version: "test.1" },
    { kind: "ticari_ileti", granted: false, text_version: "test.1" },
  ];
  const onlinePhone = "+905553334455";
  const confirmArgs = { _token: hold?.token, _full_name: "Online Hasta", _phone: onlinePhone };

  const { data: noConsent } = await pub.rpc("booking_confirm", { ...confirmArgs, _consents: [] });
  check(noConsent?.reason === "consent_required", "rıza olmadan randevu oluşmuyor", `rızasız: ${noConsent?.reason}`);

  const { data: onlyDisclosure } = await pub.rpc("booking_confirm", {
    ...confirmArgs, _consents: [consentPayload[0]],
  });
  check(onlyDisclosure?.reason === "consent_required", "açık rıza ayrıca aranıyor",
    `yalnız aydınlatma: ${onlyDisclosure?.reason}`);

  const { data: badPhone } = await pub.rpc("booking_confirm", {
    ...confirmArgs, _phone: "0555", _consents: consentPayload,
  });
  check(badPhone?.reason === "phone_invalid", "biçimsiz telefon reddedildi", `telefon: ${badPhone?.reason}`);

  const { data: confirmed } = await pub.rpc("booking_confirm", {
    ...confirmArgs, _consents: consentPayload, _ip: "203.0.113.7", _user_agent: "rls-test",
  });
  check(confirmed?.ok === true, "randevu oluştu", `randevu oluşmadı: ${confirmed?.reason}`);

  const { data: consentRows } = await admin.from("consents")
    .select("kind, granted, text_version, channel, ip").eq("tenant_id", tenantId);
  check(consentRows?.length === 3, `üç rıza kaydı yazıldı: ${consentRows?.length}`, `rıza kaydı ${consentRows?.length}`);
  const commercial = consentRows?.find((row) => row.kind === "ticari_ileti");
  check(commercial?.granted === false, "reddedilen ticari ileti onayı da kayıtta", "ticari ileti reddi kaydedilmedi");
  check(consentRows?.every((row) => row.channel === "online_booking" && row.text_version === "test.1"),
    "kanal ve metin sürümü kayıtta", "kanal ya da sürüm eksik");
  check(consentRows?.every((row) => row.ip === "203.0.113.7"), "rızanın IP'si kayıtta", "IP kaydedilmedi");

  const { data: onlineCustomer } = await admin.from("customers")
    .select("id, source, full_name").eq("tenant_id", tenantId).eq("phone", onlinePhone).maybeSingle();
  check(onlineCustomer?.source === "online", "hasta kaydı online kaynaklı açıldı", `kaynak: ${onlineCustomer?.source}`);

  const { data: reconfirm } = await pub.rpc("booking_confirm", { ...confirmArgs, _consents: consentPayload });
  const { data: onlineAppointments } = await admin.from("appointments")
    .select("id").eq("tenant_id", tenantId).eq("source", "online");
  check(reconfirm?.reason === "already_confirmed" && onlineAppointments?.length === 1,
    "ikinci gönderim yeni randevu açmıyor", `online randevu sayısı: ${onlineAppointments?.length}`);

  const { data: look } = await pub.rpc("booking_lookup", { _token: hold?.token });
  check(look?.customer?.full_name === "Online Hasta" && look?.hold_expires_at === null,
    "randevu token ile görüntüleniyor", "booking_lookup beklenen kaydı vermedi");
  const { data: lookMissing } = await pub.rpc("booking_lookup", { _token: crypto.randomUUID() });
  check(lookMissing === null, "rastgele token hiçbir şey döndürmüyor", "RASTGELE TOKEN VERİ DÖNDÜ");

  const { data: cancelled } = await pub.rpc("booking_cancel", { _token: hold?.token, _reason: "Test iptali" });
  const { data: cancelledRow } = await admin.from("appointments")
    .select("status, cancelled_at, cancelled_reason").eq("public_token", hold?.token).maybeSingle();
  check(cancelled?.ok === true && cancelledRow?.status === "cancelled" && Boolean(cancelledRow?.cancelled_at),
    "müşteri randevusunu iptal edebiliyor", "iptal edilemedi");
  const { data: cancelTwice } = await pub.rpc("booking_cancel", { _token: hold?.token });
  check(cancelTwice?.reason === "already_cancelled", "ikinci iptal zararsız", `ikinci iptal: ${cancelTwice?.reason}`);

  // İptal penceresi: randevu saati yaklaşınca internetten iptal kapanır.
  const slotTwo = weekdaySlot(5, 8);
  const { data: hold2 } = await pub.rpc("booking_hold", { ...holdArgs, _starts_at: slotTwo.toISOString() });
  await pub.rpc("booking_confirm", {
    _token: hold2?.token, _full_name: "Online Hasta", _phone: onlinePhone, _consents: consentPayload,
  });
  const soonStart = new Date(Date.now() + 60 * 60000);
  await admin.from("appointments").update({
    starts_at: soonStart.toISOString(),
    ends_at: new Date(soonStart.getTime() + 20 * 60000).toISOString(),
  }).eq("public_token", hold2?.token);
  const { data: lateCancel } = await pub.rpc("booking_cancel", { _token: hold2?.token });
  check(lateCancel?.reason === "cancel_window", "iptal penceresi kapandığında iptal edilemiyor",
    `pencere: ${lateCancel?.reason}`);

  // Süresi dolan tutma: onay reddedilir, satır silinir, slot serbest kalır.
  const slotThree = weekdaySlot(5, 9);
  const { data: hold3 } = await pub.rpc("booking_hold", { ...holdArgs, _starts_at: slotThree.toISOString() });
  await admin.from("appointments")
    .update({ hold_expires_at: new Date(Date.now() - 60000).toISOString() })
    .eq("public_token", hold3?.token);
  const { data: expiredConfirm } = await pub.rpc("booking_confirm", {
    _token: hold3?.token, _full_name: "Geç Kalan", _phone: "+905556667788", _consents: consentPayload,
  });
  check(expiredConfirm?.reason === "expired", "süresi dolan tutma onaylanamıyor", `süre: ${expiredConfirm?.reason}`);
  const { data: expiredRow } = await admin.from("appointments").select("id").eq("public_token", hold3?.token);
  check(expiredRow?.length === 0, "süresi dolan tutma silindi", "ÖLÜ TUTMA KAYDI KALDI");

  // Süpürme: ölü tutma yazma yolunda temizlenmezse kısıt boş slotu dolu sanır.
  const { data: hold4 } = await pub.rpc("booking_hold", { ...holdArgs, _starts_at: slotThree.toISOString() });
  await admin.from("appointments")
    .update({ hold_expires_at: new Date(Date.now() - 60000).toISOString() })
    .eq("public_token", hold4?.token);
  const { data: hold5 } = await pub.rpc("booking_hold", { ...holdArgs, _starts_at: slotThree.toISOString() });
  check(hold5?.ok === true, "ölü tutma süpürüldü ve slot yeniden verildi", `süpürme: ${hold5?.reason}`);

  const { error: sweepErr } = await pub.rpc("sweep_expired_holds", { _resource_id: r.id });
  check(Boolean(sweepErr), "private.sweep_expired_holds dışarıdan çağrılamıyor", "SÜPÜRME FONKSİYONU AÇIK");

  const { error: anonCreate } = await pub.rpc("create_appointment", {
    ...rpcArgs, _starts_at: weekdaySlot(6, 7).toISOString(), _customer_name: "Korsan",
  });
  check(Boolean(anonCreate), "anon panel RPC'sini çağıramıyor", "ANON create_appointment ÇAĞIRDI");


  console.log("\n[14] Bildirim altyapısı");

  const { data: flowRows } = await a.client
    .from("notification_flows")
    .select("id, trigger, is_active, template_id");
  check(flowRows?.length === tpl.notification_defaults.length,
    `akışlar şablondan kopyalandı: ${flowRows?.length}`, `akış sayısı ${flowRows?.length}`);

  const { data: templateRows } = await a.client.from("message_templates").select("id, key, kind");
  check(templateRows?.length === tpl.notification_defaults.length,
    `şablonlar kopyalandı: ${templateRows?.length}`, `şablon sayısı ${templateRows?.length}`);

  console.log("\n[14a] Randevu yazılınca kuyruk dolmalı");
  const notifyStart = weekdaySlot(8, 7);
  const { data: notifyAppointment, error: notifyErr } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: notifyStart.toISOString(),
    _customer_name: "Bildirim Hastası", _customer_phone: "+905557778899",
  });
  check(!notifyErr && Boolean(notifyAppointment), "randevu yazıldı", "randevu yazılamadı", notifyErr?.message);

  const readQueue = async (appointmentId) =>
    (await a.client.from("notifications")
      .select("id, status, channel, kind, scheduled_at, to_address, last_error, flow_id")
      .eq("appointment_id", appointmentId)).data ?? [];

  const queued = await readQueue(notifyAppointment);
  check(queued.length === 3, `üç bildirim kuyruğa girdi: ${queued.length}`,
    `kuyrukta ${queued.length} satır (beklenen 3)`);
  check(queued.every((row) => row.to_address === "+905557778899"),
    "alıcı numarası kuyruğa donduruldu", "alıcı numarası yanlış");
  check(queued.every((row) => row.status === "scheduled"),
    "hepsi gönderilmeyi bekliyor", "beklenmeyen durum");

  // Hatırlatmalar randevu saatine göre kurulmuş olmalı. "Randevu oluşturuldu"
  // bildirimi de kuyrukta ve onun zamanı `now()` — en erken satır odur.
  const scheduledAt = (rows) => rows.map((row) => new Date(row.scheduled_at).getTime());
  check(scheduledAt(queued).includes(notifyStart.getTime() - 1440 * 60000),
    "bir gün önceki hatırlatma doğru zamana kuruldu", "hatırlatma zamanı yanlış");
  check(scheduledAt(queued).includes(notifyStart.getTime() - 120 * 60000),
    "iki saat önceki hatırlatma doğru zamana kuruldu", "ikinci hatırlatma zamanı yanlış");

  console.log("\n[14b] Randevu saati değişince kuyruk yeniden kurulmalı");
  const movedStart = new Date(notifyStart.getTime() + 3600000);
  await a.client.from("appointments")
    .update({ starts_at: movedStart.toISOString(),
              ends_at: new Date(movedStart.getTime() + 30 * 60000).toISOString() })
    .eq("id", notifyAppointment);

  const afterMove = await readQueue(notifyAppointment);
  const movedTimes = scheduledAt(afterMove.filter((row) => row.status === "scheduled"));
  check(movedTimes.includes(movedStart.getTime() - 1440 * 60000),
    "hatırlatma yeni saate taşındı", "hatırlatma eski saatte kaldı");
  check(!movedTimes.includes(notifyStart.getTime() - 1440 * 60000),
    "eski saatteki hatırlatma kuyrukta kalmadı", "ESKİ SAATE KURULU HATIRLATMA DURUYOR");
  check(afterMove.filter((row) => row.status === "scheduled").length === 3,
    "kuyruk yeniden kuruldu, çoğalmadı", `kuyrukta ${afterMove.length} satır`);

  console.log("\n[14c] Randevu iptal olunca bekleyen mesaj düşmeli");
  await a.client.from("appointments").update({ status: "cancelled" }).eq("id", notifyAppointment);
  const queueAfterCancel = await readQueue(notifyAppointment);
  check(queueAfterCancel.every((row) => row.status === "cancelled"),
    "iptalde bekleyen mesajlar düştü", "iptal sonrası hâlâ bekleyen mesaj var");
  check(queueAfterCancel.every((row) => row.last_error === "Randevu iptal edildi"),
    "niçin gitmediği kayıtta", "iptal sebebi yazılmadı");

  console.log("\n[14d] İYS kapısı — ticari ileti onaysız gönderilmez");
  const { data: promoTemplate, error: promoErr } = await a.client.from("message_templates")
    .insert({
      tenant_id: tenantId, key: "kampanya_testi", name: "Kampanya",
      channel: "sms", kind: "commercial",
      body: "Merhaba {{musteri_adi}}, size özel indirim. RET yazın.",
    })
    .select("id").single();
  check(!promoErr, "ticari şablon yazıldı", "ticari şablon yazılamadı", promoErr?.message);

  await a.client.from("notification_flows").insert({
    tenant_id: tenantId, name: "Kampanya akışı", trigger: "appointment_created",
    offset_minutes: 0, channel: "sms", template_id: promoTemplate.id,
  });

  const promoStart = weekdaySlot(9, 7);
  const { data: promoAppointment } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: promoStart.toISOString(),
    _customer_name: "Onaysız Hasta", _customer_phone: "+905550001122",
  });

  const promoQueue = (await readQueue(promoAppointment)).filter((row) => row.kind === "commercial");
  check(promoQueue.length === 1, "ticari ileti kuyruğa yazıldı", `ticari satır ${promoQueue.length}`);
  check(promoQueue[0]?.status === "skipped",
    "onaysız ticari ileti GÖNDERİLMEYECEK olarak işaretlendi",
    `ticari ileti durumu: ${promoQueue[0]?.status}`);
  check(/İYS/.test(promoQueue[0]?.last_error ?? ""),
    "sebep kayıtta: İYS onayı yok", `sebep: ${promoQueue[0]?.last_error}`);

  // Onay verilince aynı akış gönderilebilir olmalı
  const { data: consented } = await a.client.from("customers")
    .select("id").eq("phone", "+905550001122").single();
  const { error: consentErr } = await a.client.from("consents").insert({
    tenant_id: tenantId, customer_id: consented.id, kind: "ticari_ileti",
    text_version: "test.1", granted: true, channel: "panel",
  });
  check(!consentErr, "ticari ileti onayı kaydedildi", "onay kaydedilemedi", consentErr?.message);

  // Saat farklı: hafta sonu kayması iki randevuyu aynı güne düşürebiliyor ve
  // aynı saatte çakışma kısıtına takılıyorlardı.
  const consentedStart = weekdaySlot(9, 9);
  const { data: consentedAppointment, error: consentedErr } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: consentedStart.toISOString(), _customer_id: consented.id,
  });
  check(!consentedErr, "onaylı hastaya randevu yazıldı", "randevu yazılamadı", consentedErr?.message);
  const consentedQueue = (await readQueue(consentedAppointment)).filter((row) => row.kind === "commercial");
  check(consentedQueue[0]?.status === "scheduled",
    "onay verilince ticari ileti kuyruğa girdi", `durum: ${consentedQueue[0]?.status}`);

  console.log("\n[14e] Kuyruk yetkisi");
  const { data: bNotifications } = await b.client.from("notifications").select("id");
  check(!bNotifications?.length, "yabancı kullanıcı kuyruğu göremiyor",
    `SIZDI: ${bNotifications?.length}`);
  const { data: bTemplates } = await b.client.from("message_templates").select("id");
  check(!bTemplates?.length, "yabancı kullanıcı şablonları göremiyor", `SIZDI: ${bTemplates?.length}`);

  const { data: recNotifications } = await c.client.from("notifications").select("id");
  check(recNotifications?.length > 0, "resepsiyon kuyruğu görüyor",
    "resepsiyon kuyruğu GÖREMİYOR");

  const { error: recTemplateWrite } = await c.client.from("message_templates")
    .update({ body: "resepsiyon değiştiremez" }).eq("id", promoTemplate.id).select("id");
  const { data: recAfter } = await a.client.from("message_templates")
    .select("body").eq("id", promoTemplate.id).single();
  check(!recAfter.body.includes("resepsiyon değiştiremez"),
    "resepsiyon şablonu değiştiremiyor", "RESEPSİYON ŞABLONU DEĞİŞTİRDİ", recTemplateWrite?.message);

  const { error: recInsert } = await c.client.from("notifications").insert({
    tenant_id: tenantId, channel: "sms", kind: "service",
    scheduled_at: new Date().toISOString(),
  });
  check(Boolean(recInsert), `kuyruğa elle mesaj yazılamıyor (${recInsert?.code})`,
    "KUYRUĞA ELLE MESAJ YAZILDI");

  console.log("\n[14f] Worker fonksiyonları yalnız servis rolüne açık");
  const { error: claimByUser } = await a.client.rpc("claim_notifications", { _limit: 1 });
  check(Boolean(claimByUser), "claim_notifications kullanıcıya kapalı", "KUYRUK KULLANICIYA AÇIK");

  const { error: installByUser } = await a.client.rpc("install_notification_defaults", {
    _tenant: tenantId, _defaults: [],
  });
  check(Boolean(installByUser), "install_notification_defaults kullanıcıya kapalı",
    "VARSAYILAN KURULUMU KULLANICIYA AÇIK");

  const { data: claimed, error: claimErr } = await admin.rpc("claim_notifications", { _limit: 5 });
  check(!claimErr && Array.isArray(claimed), `servis rolü kuyruktan aldı: ${claimed?.length}`,
    "servis rolü kuyruğu alamadı", claimErr?.message);
  check((claimed ?? []).every((row) => row.status === "sending"),
    "alınan satırlar 'gönderiliyor' oldu", "durum güncellenmedi");
  // Onaylı hastanın ticari iletisi çıkabilir; çıkmaması gereken ONAYSIZ olan.
  const claimedIds = new Set((claimed ?? []).map((row) => row.id));
  check(!claimedIds.has(promoQueue[0]?.id),
    "onaysız ticari ileti worker'a verilmedi", "ONAYSIZ TİCARİ İLETİ GÖNDERİME ÇIKTI");
  const { data: promoStill } = await a.client.from("notifications")
    .select("status").eq("id", promoQueue[0]?.id).single();
  check(promoStill?.status === "skipped", "onaysız ticari ileti 'gönderilmedi' olarak duruyor",
    `durum: ${promoStill?.status}`);

  // Rıza geri alma: panelin yazdığı satırın gönderim kapısını GERÇEKTEN
  // kapatması gerekiyor. Arayüzde "geri alındı" yazıp mesajın gitmeye devam
  // etmesi, kaydın hiç olmamasından kötüdür.
  console.log("\n[14g] Rıza geri alınınca ticari ileti durmalı");
  const { error: revokeErr } = await a.client.from("consents").insert({
    tenant_id: tenantId, customer_id: consented.id, kind: "ticari_ileti",
    text_version: "test.1", granted: false, revoked_at: new Date().toISOString(),
    channel: "panel",
  });
  check(!revokeErr, "geri alma satırı yazıldı", "geri alma yazılamadı", revokeErr?.message);

  // Rıza satırı DEĞİŞTİRİLEMEZ: geri alma yeni satırdır, eskisi olduğu gibi durur.
  const { data: consentUpdated } = await a.client.from("consents")
    .update({ granted: true }).eq("customer_id", consented.id).select("id");
  check((consentUpdated?.length ?? 0) === 0, "verilmiş rıza satırı değiştirilemiyor",
    `DEĞİŞTİRDİ: ${consentUpdated?.length}`);

  const revokedStart = weekdaySlot(9, 11);
  const { data: revokedAppointment, error: revokedApptErr } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: revokedStart.toISOString(), _customer_id: consented.id,
  });
  check(!revokedApptErr, "geri alma sonrası randevu yazıldı", "randevu yazılamadı",
    revokedApptErr?.message);

  const revokedQueue = (await readQueue(revokedAppointment)).filter((row) => row.kind === "commercial");
  check(revokedQueue[0]?.status === "skipped",
    "rıza geri alınınca ticari ileti kuyruğa 'gönderilmedi' düştü",
    `durum: ${revokedQueue[0]?.status}`);

  // Hizmet bilgilendirmesi etkilenmemeli: hatırlatma rızaya bağlı değil.
  const revokedService = (await readQueue(revokedAppointment)).filter((row) => row.kind === "service");
  check(revokedService.length > 0 && revokedService.every((row) => row.status !== "skipped"),
    "hatırlatma rıza geri alınsa da gönderilecek",
    `hizmet satırları: ${revokedService.map((row) => row.status).join(", ")}`);

  // ---------------------------------------------------------------------------
  console.log("\n[15] KVKK imhası — anonimleştirme");

  // İmha edilecek kişi: randevusu, tıbbi notu ve rıza kaydı olsun ki her
  // tablonun ne olduğu görülebilsin.
  const { data: erased } = await a.client
    .from("customers")
    .insert({ tenant_id: tenantId, full_name: "İmha Testi", phone: "+905559998877", notes: "idari not" })
    .select("id")
    .single();

  const erasedStart = new Date(Date.now() + 90 * 24 * 3600_000);
  erasedStart.setUTCHours(9, 0, 0, 0);
  const { data: erasedAppointment } = await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: erasedStart.toISOString(), _customer_id: erased.id, _notes: "randevu notu",
  });

  await a.client.from("customer_medical_notes").insert({
    tenant_id: tenantId, customer_id: erased.id, resource_id: r.id,
    branch_id: r.branch_id, body: "tıbbi not",
  });
  const { error: consentError } = await a.client.from("consents").insert({
    tenant_id: tenantId, customer_id: erased.id, kind: "kvkk_aydinlatma",
    text_version: "test", granted: true, channel: "panel", ip: "1.2.3.4", user_agent: "test",
  });
  check(!consentError, "imha testi için rıza kaydı yazıldı", consentError?.message);

  // Yetkisiz rol (c: resepsiyon) çağıramamalı — izin yalnızca sahip ve yöneticide.
  if (c) {
    const { error: forbidden } = await c.client.rpc("anonymize_customer", {
      _tenant_id: tenantId, _customer_id: erased.id,
    });
    check(Boolean(forbidden), "yetkisiz rol anonimleştiremiyor", `hata gelmedi`);
  }

  const { error: eraseError } = await a.client.rpc("anonymize_customer", {
    _tenant_id: tenantId, _customer_id: erased.id,
  });
  check(!eraseError, "sahip anonimleştirebiliyor", eraseError?.message);

  const { data: afterCustomer } = await a.client
    .from("customers")
    .select("full_name, phone, notes, custom_data, anonymized_at")
    .eq("id", erased.id)
    .single();
  check(
    afterCustomer?.full_name === "Silinen kayıt" &&
      afterCustomer?.phone === null &&
      afterCustomer?.notes === null &&
      afterCustomer?.anonymized_at !== null,
    "kişiyi tanımlayan alanlar temizlendi",
    `ad: ${afterCustomer?.full_name}, telefon: ${afterCustomer?.phone}`,
  );

  const { data: afterNotes } = await a.client
    .from("customer_medical_notes").select("id").eq("customer_id", erased.id);
  check(afterNotes?.length === 0, "tıbbi notlar silindi", `${afterNotes?.length} not kaldı`);

  const { data: afterAppointment } = await a.client
    .from("appointments").select("id, notes, customer_id").eq("id", erasedAppointment).single();
  check(
    Boolean(afterAppointment) && afterAppointment.notes === null,
    "randevu satırı duruyor, notu temizlendi",
    `randevu: ${afterAppointment?.id}, not: ${afterAppointment?.notes}`,
  );

  const { data: afterConsents } = await a.client
    .from("consents").select("id, ip, user_agent").eq("customer_id", erased.id);
  check(
    afterConsents?.length === 1 && afterConsents[0].ip === null && afterConsents[0].user_agent === null,
    "rıza kaydı duruyor, IP ve tarayıcı imzası silindi",
    `${afterConsents?.length} satır, ip: ${afterConsents?.[0]?.ip}`,
  );

  // ---------------------------------------------------------------------------
  console.log("\n[16] Silme talepleri");

  const { data: requester } = await a.client
    .from("customers")
    .insert({ tenant_id: tenantId, full_name: "Talep Testi", phone: "+905557776655" })
    .select("id")
    .single();

  const talepStart = new Date(Date.now() + 120 * 24 * 3600_000);
  talepStart.setUTCHours(11, 0, 0, 0);
  await a.client.rpc("create_appointment", {
    ...rpcArgs, _starts_at: talepStart.toISOString(), _customer_id: requester.id,
  });
  const { data: talepAppointment } = await a.client
    .from("appointments").select("public_token").eq("customer_id", requester.id).limit(1).single();

  // Randevu sayfasındaki token ile: oturumsuz (anon) çağrı.
  const anonClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: created } = await anonClient.rpc("booking_request_erasure", {
    _token: talepAppointment.public_token, _note: "test talebi",
  });
  check(created?.ok === true && created?.reason === "created",
    "randevu sayfasından talep bırakılabiliyor", `sonuç: ${JSON.stringify(created)}`);

  // İkinci kez basmak ikinci satır açmamalı.
  const { data: again } = await anonClient.rpc("booking_request_erasure", {
    _token: talepAppointment.public_token,
  });
  check(again?.reason === "already_open", "açık talep varken ikinci satır açılmıyor",
    `sonuç: ${JSON.stringify(again)}`);

  // Geçersiz token hiçbir şey sızdırmamalı.
  const { data: bogus } = await anonClient.rpc("booking_request_erasure", {
    _token: "11111111-1111-1111-1111-111111111111",
  });
  check(bogus?.ok === false && bogus?.reason === "not_found",
    "geçersiz token talep açamıyor", `sonuç: ${JSON.stringify(bogus)}`);

  // Tabloya anon erişimi olmamalı: tek kapı fonksiyon.
  const { data: anonRows, error: anonErr } = await anonClient.from("erasure_requests").select("id");
  check(anonErr !== null || (anonRows?.length ?? 0) === 0,
    "anon rolü talep tablosunu okuyamıyor", `${anonRows?.length} satır SIZDI`);

  // Sahip görüyor, yetkisiz rol (resepsiyon) görmüyor.
  const { data: ownerRows } = await a.client.from("erasure_requests").select("id, status");
  check(ownerRows?.length === 1, "sahip talebi görüyor", `${ownerRows?.length} satır`);

  if (c) {
    const { data: recRows } = await c.client.from("erasure_requests").select("id");
    check((recRows?.length ?? 0) === 0, "resepsiyon talebi göremiyor", `SIZDI: ${recRows?.length}`);
  }

} catch (e) {
  no("BEKLENMEYEN HATA", e.message);
} finally {
  console.log("\n[temizlik]");
  if (tenantId) {
    // audit_logs'ta tenant FK'si YOK: denetim kaydı, sildiği kurumun ardından
    // da durur. O yüzden test satırları elle siliniyor.
    await admin.from("audit_logs").delete().eq("tenant_id", tenantId);
    const { error } = await admin.from("tenants").delete().eq("id", tenantId);
    console.log(error ? `  kurum silinemedi: ${error.message}` : "  kurum ve bağlı tüm kayıtlar silindi");
  }
  for (const u of [a, b, c]) {
    if (u?.id) await admin.auth.admin.deleteUser(u.id);
  }
  console.log("  test kullanıcıları silindi");
  console.log(`\nSONUÇ: ${pass} geçti, ${fail} kaldı\n`);
  process.exit(fail > 0 ? 1 : 0);
}
