# TeyitRandevu

Çok kiracılı randevu ve müşteri takip SaaS'ı. İlk dikey diş klinikleri; motor
sektörden bağımsız. Tam plan: `docs/PLAN.md` — mimari kararların gerekçeleri
orada, burada yalnızca uygulama kuralları var.

**Bilinçli borçlar `docs/CANLIYA-GECIS.md` içinde.** Test ortamında çalışan ama
canlıda değiştirilmesi gereken bir şey fark edersen oraya ekle; sessizce
düzeltme, çünkü çoğu bilerek böyle.

## Yığın

Next.js 16 (App Router) · React 19 · Tailwind 4 · Supabase (Postgres + Auth +
Storage) · Vercel. ORM yok: şema kaynağı SQL, tipler `supabase gen types` ile
üretilir.

## Pazarlık edilemez kurallar

**1. Çakışma engeli veritabanındadır.** `appointments_no_overlap` exclusion
constraint'i çift rezervasyonu imkânsız kılar. Uygulama katmanında "önce kontrol
et sonra yaz" iki eşzamanlı istekte çift rezervasyon üretir. Bu kısıt
kaldırılmaz, gevşetilmez.

**2. Slot'lar hesaplanır, tutulmaz.** Uygunluk = çalışma saatleri − randevular −
izinler − tamponlar. Slot tablosu tutmak, çalışma saati değiştiğinde tutarsızlık
üretir.

**3. Yetki RLS'tedir, arayüzde değil.** Butonu gizlemek yetki değildir; API'ye
istek atılınca veri gelir. Her yeni tablo RLS ile açılır ve `private.allows()`
üzerinden politika alır.

**4. Prisma yok, ORM yok.** Supabase'e ayrıcalıklı rolle bağlanan her araç RLS'i
baypas eder. Veri erişimi `supabase-js` ile, kullanıcının JWT'siyle yapılır.

**5. `SUPABASE_SERVICE_ROLE_KEY` asla `NEXT_PUBLIC_` almaz.** O ön ek değişkeni
tarayıcıya gönderir. `createAdminClient()` yalnızca güvenilir sunucu kodunda.

**6. Zaman UTC'dir.** Veritabanında `timestamptz`, gösterimde tenant'ın IANA
timezone'u. Hiçbir yerde naive datetime yok. Tarih ve para biçimlendirmesi her
zaman `Intl.DateTimeFormat("tr-TR")` / `Intl.NumberFormat("tr-TR")`.

**7. Ticari ileti ayrımı hukuki bir alandır.** Her bildirim şablonu
"hizmet bilgilendirmesi" ya da "ticari ileti" olarak etiketlenir. Ticari olanlar
İYS onayı olmadan gönderilemez. Diş kliniklerine kampanya şablonu sunulmaz.

**8. Tıbbi not ayrı tablodadır.** Postgres RLS satır seviyesindedir, sütun
seviyesinde değil. Resepsiyonun randevuyu görüp tedavi notunu görmemesi ancak
`customer_medical_notes` tablosunun ayrı politikasıyla sağlanır.

## Şema değişikliği

Şemanın tek kaynağı `supabase/schemas/*.sql`. Migration elle yazılmaz.

```bash
# 1. İlgili schemas/*.sql dosyasını düzenle
# 2. supabase/migrations/ altına elle bir migration yaz (yalnızca DEĞİŞİKLİK)
# 3. Uygula
npm run db:push
# 4. Denetim — güvenlik VE performans, ikisi de temiz olmadan devam edilmez
npm run db:advisors
# 5. Canlı RLS doğrulaması — kiracı izolasyonu ve çakışma kısıtı
npm run rls:test
```

`supabase db diff` ve `gen types` gölge veritabanı için **Docker** ister; bu
makinede Docker yok. O yüzden migration'lar elle yazılıyor. Docker kurulursa
`db diff -f <ad>` ile declarative dosyalardan otomatik üretilebilir.

Yeni dosya eklersen `supabase/config.toml` içindeki `schema_paths` listesine
sırasıyla ekle; dosyalar verilen sırayla uygulanır.

## RLS politikası yazarken

Aşağıdakilerin her biri sessizce açık üretir — hata vermez, yanlış çalışır:

| Yapma | Yap |
|---|---|
| `auth.uid() = x` | `(select auth.uid()) = x` — satır başına çağrılmasın |
| Sadece `to authenticated` | Rol + `using` içinde sahiplik/üyelik koşulu |
| UPDATE'te yalnız `using` | `using` **ve** `with check` birlikte |
| SELECT politikasız tablo | Her tabloya SELECT politikası — yoksa UPDATE sessizce 0 satır döner |
| `security definer` fonksiyonu `public` şemada | `private` şema; korumayı sağlayan PostgREST'in yalnız `public`'i açması |
| `user_metadata` ile yetki | `app_metadata` ya da tablodan okuma |
| View ile okuma | `with (security_invoker = true)` |
| Yazma için `for all` politikası | Ayrı `for insert` / `for update` / `for delete` |
| `= any ((select dizi_donduren_fn()))` | `= any (select unnest(dizi_donduren_fn()))` |

**Canlıda öğrenilen iki kural — ikisi de sessizce kırıyor:**

1. **Politika ifadeleri sorguyu atan kullanıcı adına değerlendirilir**, politikanın
   sahibi adına değil. `private` şemadaki yetki fonksiyonlarından `authenticated`
   rolünün EXECUTE yetkisini geri alırsanız her politika
   `permission denied for function` ile patlar ve uygulama tamamen durur.
   Güvenliği sağlayan şey EXECUTE'u kısmak değil, PostgREST'in yalnızca `public`
   şemasını dışa açması (`config.toml → api.schemas`).

2. **`for all` aynı zamanda bir SELECT politikası yaratır.** Ayrı bir `_read`
   politikası da varsa her okumada ikisi birden değerlendirilir. Yazma
   politikaları her zaman `insert` / `update` / `delete` olarak ayrı yazılır.

Yetki fonksiyonları (`private.tenants_with`, `branches_with`, `resources_with`)
yalnızca `auth.uid()`'ye bağlıdır; `(select ...)` sarmalıyla çağrıldıklarında
sorgu başına bir kez çalışır. Bu sarmalı kaldırma.

## Arayüz

Standart: Vercel Web Interface Guidelines. Kurulu `web-design-guidelines`
skill'i her arayüz PR'ında çalıştırılır.

Token'lar `src/app/globals.css` içinde. Bileşen kütüphanesi eklenirse
token'ları **ezilmeden** kullanılmaz.

Kaçınılacaklar: mor-mavi degrade, glassmorphism, her yere büyük radius, emoji
bölüm ikonu, ortalanmış her şey, Inter'in varsayılan hali.

Zorunlular: ikon-only butona `aria-label`, her alana gerçek `<label>`, eylem için
`<button>` gezinme için `<Link>`, görünür `:focus-visible`, yalnızca `transform`
ve `opacity` animasyonu, `prefers-reduced-motion`, boş durum tasarımı, uzun
içerikte `truncate` + flex çocuklarında `min-w-0`, filtre ve seçili tarih
query param'da.

Bu bir operasyon aracı: hız → yoğunluk → netlik → estetik.

## Dil

Arayüz, veritabanı yorumları ve commit mesajları Türkçe. Kod tanımlayıcıları
(tablo, sütun, değişken) İngilizce ve `snake_case` / `camelCase`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
