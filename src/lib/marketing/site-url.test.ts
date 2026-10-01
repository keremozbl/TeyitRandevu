import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { siteUrl } from "./site-url.ts";

/**
 * Bu fonksiyonun yanlış cevabı hata vermiyor, sessizce kırıyor: kuruma
 * verilen randevu bağlantısı ve basılan karekod buradan çıkıyor. O yüzden
 * her dalın testi var.
 */

const KEYS = [
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_PUBLIC_VERCEL_ENV",
  "VERCEL",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});

test("hiçbir şey tanımlı değilse localhost", () => {
  setEnv({});
  assert.equal(siteUrl(), "http://localhost:3000");
});

test("elle verilen değer kazanır", () => {
  setEnv({
    NEXT_PUBLIC_SITE_URL: "https://teyitrandevu.com",
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "teyit.vercel.app",
  });
  assert.equal(siteUrl(), "https://teyitrandevu.com");
});

test("sondaki eğik çizgi atılır", () => {
  setEnv({ NEXT_PUBLIC_SITE_URL: "https://teyitrandevu.com///" });
  assert.equal(siteUrl(), "https://teyitrandevu.com");
});

test("Vercel adresi protokolsüz gelir, https eklenir", () => {
  setEnv({ NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "teyitrandevu.vercel.app" });
  assert.equal(siteUrl(), "https://teyitrandevu.vercel.app");
});

test("Vercel'de hiçbir ayar yapılmadan doğru adres çıkar", () => {
  setEnv({
    NEXT_PUBLIC_VERCEL_ENV: "production",
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "teyitrandevu.vercel.app",
  });
  assert.equal(siteUrl(), "https://teyitrandevu.vercel.app");
});

test("Vercel'de localhost yazan elle değer yok sayılır", () => {
  // Yerel .env'i Vercel'e kopyalamanın klasik sonucu.
  for (const local of [
    "http://localhost:3000",
    "https://localhost",
    "http://127.0.0.1:3000",
  ]) {
    setEnv({
      NEXT_PUBLIC_SITE_URL: local,
      NEXT_PUBLIC_VERCEL_ENV: "production",
      NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "teyitrandevu.vercel.app",
    });
    assert.equal(siteUrl(), "https://teyitrandevu.vercel.app", local);
  }
});

test("yerelde localhost yok sayılmaz — geliştirme bozulmasın", () => {
  setEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
  assert.equal(siteUrl(), "http://localhost:3000");
});

test("Vercel'de localhost yazılı ama başka kaynak yoksa localhost'a düşer", () => {
  setEnv({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL: "1" });
  assert.equal(siteUrl(), "http://localhost:3000");
});

test("localhost'a benzeyen gerçek alan adı yok sayılmaz", () => {
  setEnv({
    NEXT_PUBLIC_SITE_URL: "https://localhost-klinik.com",
    NEXT_PUBLIC_VERCEL_ENV: "production",
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "teyit.vercel.app",
  });
  assert.equal(siteUrl(), "https://localhost-klinik.com");
});
