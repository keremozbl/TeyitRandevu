/**
 * Demo verisi: hesap, diş kliniği ve bugüne dolu bir gün.
 *
 * Boş bir takvim neyin çalıştığını göstermez. Bu betik gerçekçi bir gün kurar:
 * iki hekim, bir ünit, farklı durumlarda randevular, tamponlu işlemler, bir
 * izin ve bir iptal.
 *
 * Randevular `create_appointment` RPC'si ile ve kullanıcının kendi JWT'siyle
 * yazılır — yani demo verisi de RLS'ten ve çakışma kısıtından geçer.
 *
 * İki kurum var ve ikisi de aynı betikten kuruluyor:
 *   - varsayılan: geliştirme hesabı ("Demo Diş Kliniği"), tek kişilik
 *   - `--vitrin`: sitedeki "Demoyu deneyin" düğmesinin açtığı herkese açık
 *     kurum. Parolası deposunda tutulmaz; `DEMO_PUBLIC_PAROLA` zorunlu.
 *
 * Kullanım:
 *   npm run demo:seed              hesabı ve bugünü kurar (tekrar çalıştırılabilir)
 *   npm run demo:seed -- --vitrin  herkese açık vitrin kurumunu kurar/tazeler
 *   npm run demo:seed -- --temizle kurumu ve kullanıcıyı siler (--vitrin ile birlikte de)
 */
import { createClient } from "@supabase/supabase-js";

import { utcToPlainDate, zonedTimeToUtc } from "../src/lib/domain/time.ts";
import { DEMO_EMAIL_DEFAULT, DEMO_TENANT_NAME, DEMO_TENANT_SLUG } from "../src/lib/demo/config.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SECRET) {
  console.error("\n.env eksik: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(1);
}

const VITRIN = process.argv.includes("--vitrin");

// Hesap bilgisi koda yazılmıyor, `.env`den geliyor.
//
// Önceden geliştirme hesabının e-postası ve parolası burada varsayılan
// değer olarak duruyordu. Depo GitHub'a çıktığında o parola, canlı Supabase
// projesinde çalışan bir hesabın parolası olarak yayımlanmış oluyordu.
// Varsayılan yok: eksikse komut hiç çalışmıyor.
const EMAIL = VITRIN
  ? (process.env.DEMO_PUBLIC_EPOSTA ?? DEMO_EMAIL_DEFAULT)
  : process.env.DEMO_EMAIL;
const PASSWORD = VITRIN ? process.env.DEMO_PUBLIC_PAROLA : process.env.DEMO_PAROLA;
const SLUG = VITRIN ? DEMO_TENANT_SLUG : "demo-dis-klinigi";
const NAME = VITRIN ? DEMO_TENANT_NAME : "Demo Diş Kliniği";
const TZ = "Europe/Istanbul";

if (!EMAIL || !PASSWORD) {
  const [eposta, parola] = VITRIN
    ? ["DEMO_PUBLIC_EPOSTA", "DEMO_PUBLIC_PAROLA"]
    : ["DEMO_EMAIL", "DEMO_PAROLA"];
  console.error(`\n.env eksik: ${eposta} ve ${parola} (demo hesabının bilgileri)\n`);
  process.exit(1);
}

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

async function findUser() {
  const { data } = await admin.auth.admin.listUsers();
  return data.users.find((u) => u.email === EMAIL) ?? null;
}

if (process.argv.includes("--temizle")) {
  const { data: tenant } = await admin.from("tenants").select("id").eq("slug", SLUG).maybeSingle();
  if (tenant) {
    await admin.from("tenants").delete().eq("id", tenant.id);
    console.log("kurum ve bağlı tüm kayıtlar silindi");
  }
  const user = await findUser();
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
    console.log("kullanıcı silindi");
  }
  process.exit(0);
}

// -----------------------------------------------------------------------------
// Hesap
// -----------------------------------------------------------------------------
let user = await findUser();
if (user) {
  // Parolayı bilinen değere çek: betik tekrar çalıştırıldığında giriş bilgisi
  // değişmesin.
  await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
  console.log(`kullanıcı zaten var: ${EMAIL}`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true, // kendi SMTP'niz bağlanana kadar doğrulama e-postası beklemeyelim
  });
  if (error) throw new Error(`kullanıcı oluşturulamadı: ${error.message}`);
  user = data.user;
  console.log(`kullanıcı oluşturuldu: ${EMAIL}`);
}

const app = createClient(URL, ANON, { auth: { persistSession: false } });
const { error: signInError } = await app.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (signInError) throw new Error(`giriş yapılamadı: ${signInError.message}`);

// -----------------------------------------------------------------------------
// Kurum
// -----------------------------------------------------------------------------
const template = JSON.parse(
  await (await import("node:fs/promises")).readFile("src/lib/templates/dis-klinigi.json", "utf8"),
);

let { data: tenant } = await app.from("tenants").select("id, name").eq("slug", SLUG).maybeSingle();

if (!tenant) {
  const { data: tenantId, error } = await app.rpc("create_tenant_from_template", {
    _name: NAME,
    _slug: SLUG,
    _family: template.family,
    _business_type: template.key,
    _timezone: TZ,
    _payload: {
      terminology: template.terminology,
      booking_rules: template.booking_rules,
      branch_name: "Merkez",
      resources: template.resources,
      services: template.services,
      customer_fields: template.customer_fields,
      appointment_fields: template.appointment_fields,
      working_hours: {
        weekdays: template.working_hours.weekdays,
        starts_at: template.working_hours.starts_at,
        ends_at: template.working_hours.ends_at,
        break: template.working_hours.break,
      },
      notification_defaults: template.notification_defaults,
    },
  });
  if (error) throw new Error(`kurum kurulamadı: ${error.message}`);
  tenant = { id: tenantId, name: NAME };
  console.log(`kurum kuruldu: ${NAME}`);
} else {
  console.log(`kurum zaten var: ${NAME}`);
}

// Bildirim şablonları ve akışları kuruma sonradan eklendi; daha eski bir
// sürümde kurulmuş demo kurumda hiç yok. Fonksiyon idempotent: akışı olan
// kuruma dokunmuyor.
const { data: installed, error: notifyError } = await admin.rpc("install_notification_defaults", {
  _tenant: tenant.id,
  _defaults: template.notification_defaults,
});
if (notifyError) throw new Error(`bildirim varsayılanları: ${notifyError.message}`);
console.log(
  installed > 0
    ? `bildirim şablonu ve akışı kuruldu: ${installed}`
    : "bildirim akışları zaten var",
);

const { data: branch } = await app
  .from("branches")
  .select("id")
  .eq("tenant_id", tenant.id)
  .limit(1)
  .single();

// -----------------------------------------------------------------------------
// Kaynaklar — şablon tek hekim kuruyor; demo için ikinci hekim eklenir
// -----------------------------------------------------------------------------
const { data: existing } = await app.from("resources").select("id, name, kind").eq("tenant_id", tenant.id);

const staff = existing.filter((r) => r.kind === "staff");
const room = existing.find((r) => r.kind === "room");

await app.from("resources").update({ name: "Ayla Demir", title: "Dt." }).eq("id", staff[0].id);

let second = staff.find((r) => r.name === "Mert Kılıç");
if (!second) {
  const { data, error } = await app
    .from("resources")
    .insert({
      tenant_id: tenant.id,
      branch_id: branch.id,
      kind: "staff",
      name: "Mert Kılıç",
      title: "Dt.",
      color: "#9A6412",
      sort_order: 1,
    })
    .select("id")
    .single();
  if (error) throw new Error(`ikinci hekim eklenemedi: ${error.message}`);
  second = data;
}

// İkinci hekimin ve ünitin çalışma saatleri (şablon yalnız ilkine yazmıştı)
const { data: hours } = await app.from("working_hours").select("resource_id").eq("tenant_id", tenant.id);
const withHours = new Set(hours.map((h) => h.resource_id));

const weeklyRows = (resourceId, windows) =>
  [1, 2, 3, 4, 5].flatMap((weekday) =>
    windows.map(([startsAt, endsAt]) => ({
      tenant_id: tenant.id,
      resource_id: resourceId,
      weekday,
      starts_at: startsAt,
      ends_at: endsAt,
    })),
  );

const missing = [
  ...(withHours.has(second.id) ? [] : weeklyRows(second.id, [["09:00", "13:00"], ["14:00", "18:00"]])),
  ...(withHours.has(room.id) ? [] : weeklyRows(room.id, [["09:00", "18:00"]])),
];
if (missing.length > 0) {
  const { error } = await app.from("working_hours").insert(missing);
  if (error) throw new Error(`çalışma saatleri yazılamadı: ${error.message}`);
}

// -----------------------------------------------------------------------------
// Hastalar
// -----------------------------------------------------------------------------
const PEOPLE = [
  ["Hatice Aydın", "+905321112233"],
  ["Mehmet Yıldırım", "+905331112244"],
  ["Zeynep Karaca", "+905341112255"],
  ["Ali Vural", "+905351112266"],
  ["Elif Şahin", "+905361112277"],
  ["Burak Demirci", "+905371112288"],
  ["Ayşe Korkmaz", "+905381112299"],
  ["Canan Öz", "+905391112200"],
  ["Serkan Ateş", "+905301112211"],
];

const customers = new Map();
for (const [fullName, phone] of PEOPLE) {
  const { data: found } = await app
    .from("customers")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("phone", phone)
    .maybeSingle();

  if (found) {
    customers.set(fullName, found.id);
    continue;
  }

  const { data, error } = await app
    .from("customers")
    .insert({ tenant_id: tenant.id, branch_id: branch.id, full_name: fullName, phone, source: "panel" })
    .select("id")
    .single();
  if (error) throw new Error(`hasta eklenemedi (${fullName}): ${error.message}`);
  customers.set(fullName, data.id);
}

// -----------------------------------------------------------------------------
// Bugünün randevuları
// -----------------------------------------------------------------------------
const today = utcToPlainDate(new Date(), TZ);
const at = (time) => zonedTimeToUtc(today, time, TZ);

const { data: services } = await app.from("services").select("id, name, duration_min").eq("tenant_id", tenant.id);
const serviceByName = new Map(services.map((s) => [s.name, s]));

// Aynı gün tekrar çalıştırılırsa üst üste binmesin
const { data: old } = await app
  .from("appointments")
  .select("id")
  .eq("tenant_id", tenant.id)
  .gte("starts_at", at("00:00").toISOString())
  .lt("starts_at", zonedTimeToUtc(today, "24:00", TZ).toISOString());
if (old?.length) {
  await admin.from("appointments").delete().in("id", old.map((a) => a.id));
  console.log(`bugünün ${old.length} eski demo randevusu silindi`);
}

const AYLA = staff[0].id;
const MERT = second.id;
const UNIT = room.id;

const PLAN = [
  [AYLA, "09:00", "Kontrol / Muayene", "Hatice Aydın", "completed", null],
  [AYLA, "09:30", "Dolgu", "Mehmet Yıldırım", "arrived", null],
  [AYLA, "10:30", "Kanal Tedavisi", "Zeynep Karaca", "confirmed", "Üst sol altı, ikinci seans"],
  [AYLA, "14:00", "Diş Çekimi", "Ali Vural", "pending", null],
  [AYLA, "16:00", "Detartraj (Diş Taşı Temizliği)", "Elif Şahin", "confirmed", null],
  [MERT, "09:00", "Ortodonti Kontrolü", "Burak Demirci", "completed", null],
  [MERT, "10:00", "İmplant", "Ayşe Korkmaz", "confirmed", "Tomografi getirecek"],
  [MERT, "14:00", "Diş Beyazlatma", "Canan Öz", "no_show", null],
  [MERT, "15:30", "Kontrol / Muayene", "Hatice Aydın", "cancelled", null],
  [UNIT, "11:00", "Detartraj (Diş Taşı Temizliği)", "Serkan Ateş", "confirmed", null],
];

let created = 0;
for (const [resourceId, time, serviceName, person, status, note] of PLAN) {
  const service = serviceByName.get(serviceName);
  // İptal ve gelmedi doğrudan yazılmaz: normal randevu açılır, sonra durumu
  // değiştirilir — damgaları ve hasta sayacını tetikleyici işlesin.
  const initial = status === "cancelled" || status === "no_show" ? "confirmed" : status;

  const { data: id, error } = await app.rpc("create_appointment", {
    _tenant_id: tenant.id,
    _branch_id: branch.id,
    _resource_id: resourceId,
    _starts_at: at(time).toISOString(),
    _duration_min: service.duration_min,
    _status: initial,
    _service_id: service.id,
    _customer_id: customers.get(person),
    _notes: note ?? undefined,
  });
  if (error) {
    console.log(`  ! ${time} ${person}: ${error.message}`);
    continue;
  }

  if (status !== initial) {
    await app
      .from("appointments")
      .update({
        status,
        cancelled_reason: status === "cancelled" ? "Hasta erteledi, hafta içi tekrar arayacak" : null,
      })
      .eq("id", id);
  }
  created++;
}

// İzin: hekimin kongre hazırlığı — ızgarada taralı alan olarak görünür
const { data: leave } = await app
  .from("time_off")
  .select("id")
  .eq("resource_id", AYLA)
  .gte("starts_at", at("00:00").toISOString())
  .lt("starts_at", zonedTimeToUtc(today, "24:00", TZ).toISOString());
if (!leave?.length) {
  await app.from("time_off").insert({
    tenant_id: tenant.id,
    resource_id: AYLA,
    starts_at: at("15:00").toISOString(),
    ends_at: at("16:00").toISOString(),
    reason: "Kongre hazırlığı",
  });
}

console.log(`\n${created} randevu, ${PEOPLE.length} hasta, 1 izin yazıldı (${today})`);
console.log(
  VITRIN ? "\n  sitede:  /demo  →  Demoyu başlat" : "\n  npm run dev  →  http://localhost:3000/giris",
);
console.log(`  e-posta: ${EMAIL}`);
console.log(`  parola : ${PASSWORD}\n`);
