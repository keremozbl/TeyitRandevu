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

} catch (e) {
  no("BEKLENMEYEN HATA", e.message);
} finally {
  console.log("\n[temizlik]");
  if (tenantId) {
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
