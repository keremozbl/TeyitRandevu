# TeyitRandevu

Klinik ve işletmeler için randevu, hasta takibi ve otomatik hatırlatma sistemi.
Çok kiracılı; işletme kayıt olur, sektörünü seçer, hazır bir şablonla kendi
altyapısını kurar.

Plan ve mimari kararlar: [`docs/PLAN.md`](docs/PLAN.md)
Canlıya geçiş kontrol listesi: [`docs/CANLIYA-GECIS.md`](docs/CANLIYA-GECIS.md)
Geliştirme kuralları: [`CLAUDE.md`](CLAUDE.md)

## Kurulum

```bash
npm install
cp .env.example .env
```

### Supabase projesi

Docker kurulu olmadığı için yerel Supabase yerine bulut projesiyle
çalışıyoruz. Supabase CLI `npx` ile gelir, ayrıca kurulum gerekmez.

1. [supabase.com](https://supabase.com) → yeni proje, **bölge: Frankfurt (EU
   Central)**. Gerekçe: `docs/PLAN.md` Bölüm 12.2.
2. Settings → API'den `URL`, publishable ve secret anahtarları `.env`'e yaz.
3. Settings → Database → Connection string (Session pooler) değerini
   `SUPABASE_DB_URL` olarak `.env`'e yaz. Paroladaki özel karakterler
   **yüzde-kodlanmalı** (`#` → `%23`).
4. Şemayı gönder ve doğrula:

```bash
npm run db:push       # migration'lar uygulanır
npm run db:seed       # izin kataloğu ve rol şablonları
npm run db:advisors   # güvenlik + performans denetimi
npm run rls:test      # canlı kiracı izolasyonu ve çakışma testi
```

Tipleri yenilemek için (şema değiştikçe):

```bash
npm run db:types      # personal access token gerekir, Docker gerekmez
```

> `db diff` gölge veritabanı için Docker ister; kurulu değilse migration'lar
> `supabase/migrations/` altına elle yazılır.

### Geliştirme

```bash
npm run dev        # http://localhost:3000
npm run typecheck
npm run lint
npm run build
```

## Yapı

```
src/app/              sayfalar ve server action'lar
src/lib/domain/       iş kuralları — slot hesaplama, çakışma, fiyat
src/lib/supabase/     client (tarayıcı) · server (SSR) · admin (servis rolü)
src/lib/templates/    sektör şablonları (JSON) — yeni sektör = yeni dosya
supabase/schemas/     şemanın TEK kaynağı; migration bunlardan üretilir
supabase/seed.sql     izin kataloğu ve rol şablonları
docs/PLAN.md          ürün, teknik ve hukuki plan
```

## Durum

Faz 0 — kurulum. Tamamlananlar:

- [x] Next.js iskeleti, tasarım token'ları, Türkçe font desteği
- [x] Declarative şema: kiracı, yetki, kaynak, hasta, randevu
- [x] RLS politikaları ve yetki çözümleme fonksiyonları
- [x] Çakışma engeli (exclusion constraint)
- [x] İzin kataloğu ve rol şablonları
- [x] Sektör şablonları: diş kliniği, berber
- [x] Supabase projesine bağlanma — şema ve seed uygulandı
- [x] Kimlik doğrulama: giriş, kayıt, e-posta bağlantısı
- [x] Kurum kurulum sihirbazı ve panel iskeleti
- [x] Canlı RLS doğrulaması — 29 test, kiracı izolasyonu ve çakışma kısıtı
- [x] TypeScript tipleri — 26 tablo, iki RPC
- [ ] Takvim ızgarası ve randevu oluşturma
