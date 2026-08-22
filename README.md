# TeyitRandevu

Klinik ve işletmeler için randevu, hasta takibi ve otomatik hatırlatma sistemi.
Çok kiracılı; işletme kayıt olur, sektörünü seçer, hazır bir şablonla kendi
altyapısını kurar.

Plan ve mimari kararlar: [`docs/PLAN.md`](docs/PLAN.md)
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
2. Settings → API'den `URL`, `anon key` ve `service_role key` değerlerini
   `.env` dosyasına yaz.
3. Settings → General'den Reference ID'yi `SUPABASE_PROJECT_REF` olarak yaz.
4. Projeye bağlan ve şemayı gönder:

```bash
npx supabase login          # tarayıcıda oturum açar
npm run db:link
npm run db:push             # supabase/schemas/*.sql uygulanır
npm run db:seed             # izin kataloğu ve rol şablonları
npm run db:advisors         # güvenlik denetimi — açık varsa düzeltilir
npm run db:types            # TypeScript tipleri üretilir
```

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
- [ ] Supabase projesine bağlanma
- [ ] Kimlik doğrulama
- [ ] Kurum kurulum sihirbazı
