/**
 * Geçici demo hesaplarını ve kurumlarını siler.
 *
 * `/demo` her ziyaretçiye kendi hesabını ve kurumunu açıyor (bkz.
 * `src/lib/demo/actions.ts`). Bunlar bir gün sonra çöp: kurum silinince
 * randevular, kayıtlar ve bildirimler cascade ile gidiyor, ardından hesap
 * siliniyor.
 *
 * Kullanım:
 *   npm run demo:temizle             24 saatten eski demo hesaplarını siler
 *   npm run demo:temizle -- --hepsi  yaşına bakmadan hepsini siler
 *   npm run demo:temizle -- --kuru   yalnızca listeler, silmez
 *
 * Canlıda bunun bir zamanlanmış iş olarak koşması gerekiyor (CANLIYA-GECIS B12).
 */
import { createClient } from "@supabase/supabase-js";

import { DEMO_TTL_HOURS } from "../src/lib/demo/config.ts";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !SECRET) {
  console.error("\n.env eksik: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n");
  process.exit(1);
}

const ALL = process.argv.includes("--hepsi");
const DRY = process.argv.includes("--kuru");

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

const cutoff = Date.now() - DEMO_TTL_HOURS * 60 * 60 * 1000;

/** Demo hesapları — sayfa sayfa, çünkü listUsers tek seferde hepsini vermiyor. */
async function listDemoUsers() {
  const found = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`kullanıcılar listelenemedi: ${error.message}`);
    if (data.users.length === 0) break;

    for (const user of data.users) {
      if (user.app_metadata?.demo !== true) continue;
      const created = Date.parse(user.app_metadata.demo_created_at ?? user.created_at);
      if (ALL || !Number.isFinite(created) || created < cutoff) found.push(user);
    }

    if (data.users.length < 200) break;
  }
  return found;
}

const users = await listDemoUsers();

if (users.length === 0) {
  console.log("silinecek demo hesabı yok");
  process.exit(0);
}

console.log(`${users.length} demo hesabı bulundu${DRY ? " (kuru çalışma)" : ""}`);

let tenantsDeleted = 0;
let usersDeleted = 0;

for (const user of users) {
  const { data: memberships, error } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", user.id);

  if (error) {
    console.log(`  ! ${user.email}: üyelikler okunamadı — ${error.message}`);
    continue;
  }

  const tenantIds = [...new Set((memberships ?? []).map((row) => row.tenant_id))];

  for (const tenantId of tenantIds) {
    // Başka üyesi olan bir kuruma dokunulmaz: demo hesabı davet edilmiş
    // olabilir ve o kurum gerçek bir müşterinin olabilir.
    const { count } = await admin
      .from("memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);

    if ((count ?? 0) > 1) {
      console.log(`  - ${user.email}: kurum ${tenantId} paylaşımlı, atlandı`);
      continue;
    }

    if (!DRY) {
      // Storage nesneleri kurum silinince CASCADE ile gitmiyor: kova ayrı bir
      // şemada ve yolu yalnızca isimle biliyoruz. Yüklenen logo burada
      // siliniyor, yoksa her demo bir dosya bırakırdı.
      const { data: files } = await admin.storage.from("kurum-gorsel").list(tenantId);
      if (files?.length) {
        await admin.storage
          .from("kurum-gorsel")
          .remove(files.map((file) => `${tenantId}/${file.name}`));
      }

      const { error: tenantError } = await admin.from("tenants").delete().eq("id", tenantId);
      if (tenantError) {
        console.log(`  ! kurum silinemedi (${tenantId}): ${tenantError.message}`);
        continue;
      }
    }
    tenantsDeleted += 1;
  }

  if (!DRY) {
    const { error: userError } = await admin.auth.admin.deleteUser(user.id);
    if (userError) {
      console.log(`  ! hesap silinemedi (${user.email}): ${userError.message}`);
      continue;
    }
  }
  usersDeleted += 1;
}

console.log(`\n${tenantsDeleted} kurum, ${usersDeleted} hesap ${DRY ? "silinecekti" : "silindi"}`);

// Windows'ta açık kalan soket, kapanışta libuv uyarısı üretiyor.
process.exit(0);
