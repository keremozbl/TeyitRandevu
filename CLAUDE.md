# TeyitRandevu

Çok kiracılı randevu ve müşteri takip SaaS'ı. İlk dikey diş klinikleri; motor
sektörden bağımsız. Tam plan: `docs/PLAN.md` — mimari kararların gerekçeleri
orada, burada yalnızca uygulama kuralları var.

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
# 2. Migration üret
npm run db:diff -- <aciklayici_ad>
# 3. Uygula
npm run db:push
# 4. Güvenlik denetimi — açık varsa düzeltilmeden devam edilmez
npm run db:advisors
# 5. Tipleri yenile
npm run db:types
```

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
| `security definer` + `public` şema | `private` şema + explicit `revoke execute` |
| `user_metadata` ile yetki | `app_metadata` ya da tablodan okuma |
| View ile okuma | `with (security_invoker = true)` |

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
