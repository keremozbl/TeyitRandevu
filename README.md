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

## Vercel'e dağıtım

Depo GitHub'a bağlı; `main`'e gelen her commit dağıtımı tetikler.

**Environment Variables** (Settings → Environment Variables):

| Değişken | Not |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | aynı yer |
| `SUPABASE_SERVICE_ROLE_KEY` | aynı yer; `NEXT_PUBLIC_` ön eki ASLA eklenmez |
| `CRON_SECRET` | kuyruk uç noktasının sırrı; yoksa uç nokta 503 döner |
| `NEXT_PUBLIC_SITE_URL` | **Vercel'de gerekmez** — aşağıya bakın |

`NEXT_PUBLIC_SITE_URL` Vercel'de boş bırakılır: kod, Vercel'in kendi verdiği
`NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` değerine düşer ve özel alan adı
bağlandığında kendiliğinden ona döner. Yerel `.env`i Vercel'e olduğu gibi
kopyalayıp `localhost` yazarsan o değer **yok sayılır** — aksi hâlde kurumun
paylaştığı bağlantı, karekodun içi ve hatırlatma mesajındaki link hep
`localhost` gösterirdi.

Supabase tarafında Authentication → URL Configuration → Site URL ve
Redirect URLs aynı adrese ayarlanır; yoksa giriş yönlendirmeleri
`localhost`a düşer.

### Hobby planının iki kısıtı

**Cron günde bir.** `vercel.json` `0 6 * * *` kullanıyor. Daha sık bir
ifade (`*/5 * * * *`) Hobby'de dağıtımı **reddediyor**, yavaşlatmıyor.
Gerçek beş dakikalık kuyruk boşaltma için Supabase'in `pg_cron`'u
kullanılır — hazır SQL `docs/CANLIYA-GECIS.md` B10 içinde.

**Commit yazarı hesapla eşleşmeli.** Vercel, sahibine eşleştiremediği bir
commit'i "başka bir katkıcı" sayar ve derlemeyi hiç başlatmaz; günlük bile
üretmez, sadece "Hobby teams do not support collaboration" der. `git config
user.email` GitHub hesabına ekli ve doğrulanmış bir adres olmalı.

```bash
git config --global user.email   # GitHub'a ekli adresle aynı mı?
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
