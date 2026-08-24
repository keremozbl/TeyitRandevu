#!/usr/bin/env node
/**
 * Supabase CLI çalıştırıcı.
 *
 * npm betikleri Windows'ta cmd.exe üzerinden çalışır ve `$DEGISKEN` orada
 * genişlemez — bağlantı bilgisini betiğe gömmek yerine .env'i burada okuyup
 * CLI'a argüman olarak veriyoruz. Aynı komut Windows, macOS ve Linux'ta çalışır.
 *
 * Kullanım: node scripts/db.mjs <push|seed|advisors|types>
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

function loadEnv(file = ".env") {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

loadEnv();

const { SUPABASE_DB_URL: DB_URL, SUPABASE_PROJECT_REF: REF } = process.env;

function need(value, name, hint) {
  if (value) return value;
  console.error(`\n${name} tanımlı değil. ${hint}\n`);
  process.exit(1);
}

// CLI, npx üzerinden DEĞİL doğrudan çalıştırılıyor. Sebep: Windows'ta npx bir
// .cmd dosyası ve Node 20.12+ sürümleri shell olmadan .cmd spawn'ını EINVAL ile
// reddediyor (CVE-2024-27980 yaması) — komut sessizce hiç çalışmıyordu.
// supabase paketi zaten bir JS dosyası; onu bu Node ile çalıştırmak shell'e de
// platform ayrımına da gerek bırakmıyor.
const CLI = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

function run(args, opts = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    stdio: opts.capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (r.error) {
    console.error(`
Supabase CLI çalıştırılamadı: ${r.error.message}
`);
    process.exit(1);
  }
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r.stdout;
}

const command = process.argv[2];
const rest = process.argv.slice(3);

switch (command) {
  case "push":
    need(DB_URL, "SUPABASE_DB_URL", "Settings → Database → Connection string (Session pooler)");
    run(["db", "push", "--db-url", DB_URL, ...rest]);
    break;

  case "seed":
    need(DB_URL, "SUPABASE_DB_URL", "Settings → Database → Connection string (Session pooler)");
    run(["db", "push", "--include-seed", "--db-url", DB_URL, ...rest]);
    break;

  case "advisors":
    need(DB_URL, "SUPABASE_DB_URL", "Settings → Database → Connection string (Session pooler)");
    // Güvenlik ve performans ayrı ayrı; ikisi de temiz olmadan devam edilmez.
    for (const type of ["security", "performance"]) {
      console.log(`\n=== ${type} ===`);
      run(["db", "advisors", "--type", type, "--level", "warn", "--db-url", DB_URL]);
    }
    break;

  case "types": {
    need(REF, "SUPABASE_PROJECT_REF", "Settings → General → Reference ID");
    need(process.env.SUPABASE_ACCESS_TOKEN, "SUPABASE_ACCESS_TOKEN",
      "https://supabase.com/dashboard/account/tokens adresinden oluşturun");
    const out = run(["gen", "types", "typescript", "--project-id", REF, "--schema", "public"],
      { capture: true });
    if (!out || out.trimStart().startsWith("{\"_tag\":\"Error\"")) {
      console.error("Tip üretimi başarısız:\n" + out);
      process.exit(1);
    }
    const { writeFileSync } = await import("node:fs");
    writeFileSync("src/lib/supabase/types.ts", out, "utf8");
    console.log(`src/lib/supabase/types.ts yazıldı (${out.split("\n").length} satır)`);
    break;
  }

  default:
    console.error("Kullanım: node scripts/db.mjs <push|seed|advisors|types>");
    process.exit(1);
}
