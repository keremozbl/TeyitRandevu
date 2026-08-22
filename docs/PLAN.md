# TeyitRandevu — Ürün, Teknik ve Hukuki Plan

Çok kiracılı (multi-tenant) randevu ve müşteri takip SaaS'ı. İşletme kayıt olur, sektörünü seçer,
hazır bir şablonla kendi altyapısını (şube, personel, hizmet, çalışma saatleri) kurar; hem kendi
panelinden hem de kendine ait public randevu sayfasından randevu yönetir.

İlk dikey: **diş klinikleri**. Motor sektörden bağımsız; diş sadece ilk şablon.

> Sürüm 4 — Supabase + Vercel; hukuki süreçler, kademeli onay zinciri ve kurumsal yapı
> (yetki motoru, rapor motoru, Google Takvim senkronu) eklendi.

---

## 1. Temel kararlar

| Konu | Karar |
|---|---|
| Frontend | Next.js 15 (App Router, TypeScript), Vercel'de |
| Veri + kimlik + dosya | Supabase (Postgres, Auth, Storage, Realtime) |
| Şema kaynağı | Supabase declarative schema (`supabase/schemas/*.sql`) + CLI migration |
| Veri erişimi | `@supabase/ssr` + `supabase-js`, RLS kullanıcının JWT'siyle zorlanır |
| Tip üretimi | `supabase gen types typescript` — elle tip yazılmaz |
| Zamanlanmış işler | `pg_cron` + `pgmq` (Supabase Queues); Vercel Cron yedek |
| Zaman | Veritabanında UTC `timestamptz`, tenant bazlı IANA timezone |
| Bölge | Supabase EU (Frankfurt) — hukuki gerekçe Bölüm 12'de |

### Prisma neden çıktı

İlk planda Prisma vardı. Supabase ile birlikte Prisma yanlış araç: Prisma veritabanına ayrıcalıklı
bir rolle bağlanır ve **RLS'i baypas eder**. RLS'i güvenlik sınırı olarak kullanacaksak, veri
erişimi kullanıcının JWT'siyle çalışan `supabase-js` üzerinden olmalı. Şema kaynağı SQL, tipler
üretiliyor; ORM'e ihtiyaç kalmıyor.

Servis rolü (`service_role`) sadece worker ve webhook gibi güvenilir sunucu kodunda, RLS'i bilerek
atlamamız gereken yerlerde kullanılır. Bu anahtar hiçbir zaman `NEXT_PUBLIC_` ön ekiyle
tanımlanmaz — Next.js'te o ön ek değişkeni tarayıcıya gönderir.

---

## 2. Mimari

```
teyitrandevu.com/              → pazarlama sitesi, kayıt          (Vercel)
teyitrandevu.com/r/[slug]      → public randevu sayfası           (Vercel, ISR)
app.teyitrandevu.com           → işletme paneli                   (Vercel)
Supabase                       → Postgres + Auth + Storage + Realtime
pg_cron + pgmq                 → hatırlatma kuyruğu, temizlik işleri
```

Ayrı worker process yok. Zamanlanmış işler veritabanının içinde: `pg_cron` her dakika kuyruğu
kontrol eder, gönderim için Edge Function'ı tetikler. Bu, ilk plandaki pg-boss + ayrı container
kurulumunu tamamen ortadan kaldırıyor — Supabase'e geçmenin en büyük kazancı bu.

**Katmanlar**

- `app/` — sayfalar ve server action'lar; ince katman, doğrulama ve çağrı
- `lib/domain/` — iş kuralları: slot hesaplama, çakışma, fiyatlandırma. Framework'süz, test edilebilir
- `lib/supabase/` — `client.ts`, `server.ts`, `admin.ts` (yalnızca servis rolü gereken yerler)
- `lib/templates/` — sektör şablonları, JSON seed
- `supabase/schemas/` — şemanın tek kaynağı, SQL
- `supabase/functions/` — Edge Functions: bildirim gönderimi, webhook'lar

**Bağlantı yönetimi.** Vercel serverless + Postgres, doğrudan bağlantıda bağlantı tükenmesine
yol açar. Kural: veri erişimi Data API (PostgREST) üzerinden — kendi havuzu var. Doğrudan bağlantı
gerekirse Supavisor **transaction mode**, ve o modda prepared statement kapalı.

---

## 3. Çok kiracılılık ve güvenlik

İlk plandaki `SET LOCAL app.tenant_id` yaklaşımı Supabase'de **çalışmaz**. Orada güvenilir bir
sunucu ile doğrudan bağlantı varsayılıyordu; burada istek PostgREST üzerinden kullanıcının
JWT'siyle geliyor. Doğru desen: politikalar `auth.uid()` üzerinden üyeliğe bakar.

### Üyelik kontrolü

```sql
-- Yardımcı fonksiyon: gizli şemada, sabit search_path ile
create or replace function private.is_tenant_member(_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where tenant_id = _tenant_id
      and user_id = (select auth.uid())   -- kimlik kontrolü fonksiyonun İÇİNDE
  );
$$;

revoke execute on function private.is_tenant_member(uuid)
  from public, anon, authenticated, service_role;

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

create policy appointments_member_read on public.appointments
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy appointments_member_write on public.appointments
  for update to authenticated
  using      ( (select private.is_tenant_member(tenant_id)) )
  with check ( (select private.is_tenant_member(tenant_id)) );

create index memberships_user_tenant_idx on public.memberships (user_id, tenant_id);
create index appointments_tenant_idx     on public.appointments (tenant_id);
```

### Kaçınılması gereken tuzaklar

Bunların her biri sessizce güvenlik açığı üretir; kod incelemesinde ayrı ayrı aranacak.

| Tuzak | Sonuç | Doğrusu |
|---|---|---|
| `auth.uid() = x` (SELECT'siz) | Fonksiyon her satır için çağrılır, 1M satırda 1M çağrı | `(select auth.uid()) = x` |
| Sadece `to authenticated` | Giriş yapan herkes her satırı görür — BOLA/IDOR | `to authenticated` + `using` içinde sahiplik koşulu |
| UPDATE'te `with check` yok | Kullanıcı kaydın `tenant_id`'sini başkasına atayabilir | `using` **ve** `with check` birlikte |
| SELECT politikası olmayan UPDATE | Güncelleme sessizce 0 satır döner, hata yok | Her tabloya SELECT politikası |
| `security definer` fonksiyon `public` şemada | Postgres `EXECUTE`'u PUBLIC'e verir → herkese açık API | Gizli şema + explicit `revoke` |
| `user_metadata` ile yetki kararı | Kullanıcı kendi metadata'sını düzenleyebilir | `app_metadata`, ya da tablodan okuma |
| View üzerinden okuma | View'lar RLS'i baypas eder | `with (security_invoker = true)` |
| Storage'da sadece INSERT izni | Dosya değiştirme (upsert) sessizce başarısız | INSERT + SELECT + UPDATE birlikte |
| Kullanıcı silmek | Mevcut access token'lar geçerli kalır | Önce oturumları iptal et, JWT ömrünü kısa tut |

**Roller ve izinler Bölüm 8.2'de.** RLS tenant izolasyonunu yapar; rol içi yetki (hekim
başkasının hastasının tıbbi notunu görebilir mi) de politika seviyesinde çözülür — arayüzde
butonu gizlemek yetki değildir.

`supabase db advisors` her migration sonrası çalıştırılacak; CI'da zorunlu adım.

---

## 4. Sektör şablonu sistemi

Ürünün ayırt edici kısmı. Şablon **referans değil, kopya** olarak çalışır: kayıt sırasında seçilen
şablonun içeriği tenant'ın kendi satırlarına kopyalanır, sonrasında işletme her şeyi serbestçe
düzenler. Şablon güncellenince mevcut müşteriler etkilenmez.

| Parça | Diş kliniği | Berber |
|---|---|---|
| Terminoloji | müşteri → "hasta", hizmet → "tedavi" | müşteri, hizmet |
| Kaynak tipi | hekim + ünit (koltuk), ikisi birden | koltuk / usta |
| Hazır hizmetler | Dolgu 45dk, Kanal 90dk, Kontrol 20dk, İmplant 120dk | Saç 30dk, Sakal 15dk, Saç+Sakal 40dk |
| Müşteri alanları | TCKN, kan grubu, kronik hastalık, ilaç alerjisi | doğum günü, tercih edilen usta |
| Randevu alanları | diş no, şikâyet | — |
| Ek modüller | diş haritası, tedavi planı, taksit | paket / sadakat |
| Varsayılan saatler | 09:00–18:00, 13:00–14:00 kapalı | 09:00–21:00, pazar kapalı |

Esnek alanlar `field_definitions` tablosunda tanımlanır (tip, zorunluluk, seçenekler, sıra),
değerler ilgili kaydın `custom_data jsonb` sütununda tutulur.

**JSONB indeksleme:** tüm sütuna `jsonb_ops` GIN indeksi atmak indeksi şişirir. Sadece filtrelenen
anahtarlara ifade indeksi kurulacak, ölçüm sonrası:

```sql
create index customers_tckn_idx on public.customers ((custom_data->>'tckn'))
  where custom_data ? 'tckn';
```

Yeni sektör eklemek = `lib/templates/veteriner.json` yazmak. Kod değişmez.

---

## 5. Veri modeli (çekirdek)

Postgres kuralları: tüm tanımlayıcılar küçük harf ve `snake_case` (aksi halde her sorguda çift
tırnak gerekir), birincil anahtarlar `uuid` + `gen_random_uuid()`, her yabancı anahtara indeks,
kısıtlar veritabanında — uygulamada değil.

```
tenants            id, name, slug, business_type, timezone, locale, currency, status
tenant_settings    tenant_id, terminology, booking_rules, branding   (jsonb)
memberships        user_id → auth.users, tenant_id, role, branch_ids[]
branches           id, tenant_id, name, address, phone, timezone
resources          id, tenant_id, branch_id, type(staff|room|device), user_id?, name, color
services           id, tenant_id, name, duration_min, buffer_before, buffer_after,
                   price, vat_rate, category, is_online_bookable, custom_data
service_resources  service_id, resource_id          -- hangi hizmeti kim verebilir
working_hours      resource_id, weekday, start_time, end_time
time_off           resource_id, starts_at, ends_at, reason
customers          id, tenant_id, full_name, phone, email, birth_date,
                   notes, tags[], custom_data jsonb, source
appointments       id, tenant_id, branch_id, customer_id, resource_id, service_id,
                   starts_at, ends_at, status, price, notes, custom_data,
                   created_by, cancelled_reason, no_show_at
appointment_items  appointment_id, service_id, price
field_definitions  tenant_id, entity(customer|appointment), key, label, type,
                   required, options jsonb, sort_order
notifications      tenant_id, appointment_id, channel, template, send_at,
                   status, provider_ref, error
consents           tenant_id, customer_id, kind, text_version, granted_at, ip, source
subscriptions      tenant_id, plan, status, period_end, limits jsonb
usage_counters     tenant_id, period, sms_sent, appointments_created
audit_logs         tenant_id, actor_id, action, entity, entity_id, diff, ip, at

-- Kurumsal yapı (Bölüm 8)
departments        id, tenant_id, name              -- poliklinik/branş; tek klinikte boş
permissions        key, label, category             -- kodda sabit, seed
roles              id, tenant_id, name, is_system
role_permissions   role_id, permission_key, scope(own|branch|tenant)
report_definitions id, tenant_id, key, name, type, scope, columns, template_id
report_schedules   id, tenant_id, report_id, at_time, weekdays[], recipients, format
report_runs        id, schedule_id, ran_at, period, status, file_url, error
calendar_connections  id, tenant_id, resource_id, provider, account_email,
                      calendar_id, mask_level, status
calendar_event_links  appointment_id, connection_id, external_event_id, etag
```

`memberships` genişler: `role_id`, `branch_ids[]`, `resource_id?` (kullanıcı bir hekimse kendi
kaynağı), `assistant_of?` (asistan hangi hekime bağlı).

Kullanıcı tablosu yok — Supabase Auth'un `auth.users` tablosu kullanılır, `memberships` ona bağlanır.
Diş modülü (Faz 6): `treatments`, `treatment_plans`, `tooth_chart_entries`, `payments`, `installments`.

`audit_logs` hızla büyür; ay bazlı **partition** ile başlayacak, sonradan bölmek acılı.

---

## 6. Randevu motoru

Pazarlık edilemez üç madde:

### a. Slot'lar tutulmaz, hesaplanır

Uygunluk = çalışma saatleri − mevcut randevular − izinler − tampon süreler − minimum ön süre.
Sonuç kaynak ve gün bazında cache'lenir, randevu değişince invalidate edilir. Slot tablosu tutmak,
çalışma saati değiştiğinde tutarsızlık üretir.

### b. Çakışma engeli veritabanında

Uygulama katmanında "önce kontrol et, sonra yaz" iki eşzamanlı istekte çift rezervasyon üretir.
Doğrusu Postgres exclusion constraint; uygulama kontrolüne güvenilmez.

```sql
create extension if not exists btree_gist;

alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','confirmed'));
```

### c. Public sayfada slot tutma (hold)

Müşteri formu doldururken slot 10 dakika `pending` olarak tutulur, süre dolunca `pg_cron` temizler.
Aksi halde form doldurulurken slot kapılır.

**Diğer kurallar:** minimum ön süre (örn. 2 saat), en fazla ileri tarih (örn. 60 gün), aynı
telefondan aynı gün en fazla N randevu (spam), iptal penceresi (örn. 4 saat kala iptal edilemez),
tekrarlayan randevu, bekleme listesi (iptal olunca sıradakine haber).

**Transaction disiplini:** randevu yazan transaction içinde SMS gönderme, dosya yükleme gibi
harici çağrı yapılmaz. Uzun transaction kilit tutar ve tüm takvimi yavaşlatır. Harici iş kuyruğa
yazılır, transaction kapanır.

---

## 7. Bildirim, kademeli onay zinciri ve paketler

No-show'u düşüren tek özellik bu; satış argümanı da burası. Türkiye'de hukuki olarak ikiye
ayrılıyor — Bölüm 12.3 bu ayrımı anlatıyor ve veri modelini doğrudan etkiliyor.

### 7.1 Çekirdek

- **Outbox deseni:** randevu oluşunca `notifications` tablosuna satır yazılır, kuyruk gönderir.
  Gönderim hatası randevuyu bozmaz, retry edilebilir.
- **Kuyruk:** `pgmq` + `pg_cron`. Worker'lar `for update skip locked` ile çeker — aynı mesajı iki
  worker'ın göndermesi böyle engellenir.
- **Şablonlar:** tenant bazlı düzenlenebilir, değişkenli (`{{musteri_adi}}`, `{{tarih}}`).
  Her şablon "hizmet bilgilendirmesi" veya "ticari ileti" olarak etiketlenir — hukuki alan.
- **Onay/iptal linki:** imzalı token ile giriş gerektirmeden onayla veya iptal et.

### 7.2 Kademeli onay zinciri — ürünün asıl farkı

Tek bir hatırlatma SMS'i her rakipte var. Fark, **cevap alana kadar kanal yükselten** bir zincir
kurmakta ve alınan cevabı otomatik aksiyona çevirmekte:

```
T-24 saat   WhatsApp şablon mesajı, [Geliyorum] [Gelemeyeceğim] [Ertele] butonlarıyla
              ↓ cevap yoksa
T-20 saat   SMS + onay linki
              ↓ cevap yoksa
T-30 dakika Otomatik sesli arama — 1: geleceğim · 2: gelemeyeceğim · 3: ertele
              ↓ "gelemeyeceğim" ya da cevapsız
            Slot boşa düşer → bekleme listesindeki ilk kişiye anında teklif
```

Bu sıralama maliyeti de optimize ediyor: WhatsApp en ucuz, arama en pahalı. Cevap veren kişi
zincirden çıkar, arama sadece **cevapsız kalan azınlığa** gider. Düz "herkese arama" modelinde
maliyet 10 katına çıkar ve kâr biter.

**Zamanlama notu.** 30 dakika kala arama, hekimin boşuna beklememesini sağlar ama slotu
kurtarmaya yetmez — kimse 30 dakikada klinige gelemez. Slot kurtarmak istiyorsanız zincirin
**24 saat** ayağı şart. İkisi farklı işler, ikisi de değerli; varsayılanlar buna göre kurulacak
ve tenant bazında ayarlanabilir olacak.

### 7.3 Sağlayıcı soyutlaması

Her kanal tek arayüz arkasında; sağlayıcı değiştirmek tek dosya:

```ts
interface MessageProvider {  send(to, template, vars): Promise<{ ref, cost }> }
interface VoiceProvider   {  placeCall(to, script, callbackUrl): Promise<{ ref, cost }> }
```

| Kanal | Aday sağlayıcılar |
|---|---|
| SMS | NetGSM, İletimerkezi, Verimor |
| WhatsApp | WhatsApp Cloud API (Meta), 360dialog |
| Sesli arama / IVR | NetGSM sesli mesaj, Verimor, Bulutfon, Twilio |
| E-posta | Resend |

**Kendi hesabını getir (BYO).** Büyük klinikler kendi NetGSM sözleşmelerine sahip ve kendi
tarifelerini kullanmak ister. `tenant_providers` tablosu bunu ilk günden destekleyecek:
tenant ya platformun havuzunu kullanır (kontör satın alır) ya da kendi kimlik bilgilerini girer.
Bu, satışta beklenmedik biçimde güçlü bir argüman — "SMS'i bizden almak zorunda değilsiniz".
Kimlik bilgileri Supabase Vault'ta şifreli tutulur, `custom_data`'da değil.

### 7.4 Otomasyon akışları — kod değil veri

Yeni bir hatırlatma tipi eklemek kod değişikliği olmamalı. Akışlar tabloda tanımlı:

```
notification_flows   id, tenant_id, name, trigger(appointment_created|before_start|
                     after_end|no_show|birthday), offset_minutes, channel,
                     template_id, condition jsonb, is_active, requires_feature
```

"24 saat önce WhatsApp", "30 dakika önce arama", "randevudan 2 gün sonra memnuniyet SMS'i" —
hepsi aynı tablonun satırı. `condition` alanı "sadece ilk kez gelen hastalara" gibi kuralları taşır.

### 7.5 Sesli arama (IVR) — veri modeli

Bu özellik Faz 7'de devreye girecek ama **tablolar ve panel ekranları Faz 4'te hazır olacak.**
Sonradan şema değiştirmek yerine baştan yer açmak neredeyse bedava.

```
ivr_scripts     id, tenant_id, name, intro_text, voice_id, language,
                options jsonb   -- [{dtmf:"1", action:"confirm"},
                                --  {dtmf:"2", action:"cancel"},
                                --  {dtmf:"3", action:"reschedule"}]
call_sessions   id, tenant_id, appointment_id, provider, provider_ref,
                attempt_no, started_at, answered_at, ended_at, duration_sec,
                dtmf_result, outcome(answered|no_answer|busy|failed|voicemail),
                cost, recording_url?
```

- **Ses:** TTS ile üretilir (metin şablondan), sabit ses dosyası değil — hasta adı ve saat
  mesajın içinde geçmeli. Türkçe TTS kalitesi sağlayıcıya göre çok değişiyor, seçimden önce
  gerçek cihazda dinleyerek test edilecek.
- **Yeniden deneme:** cevapsızda 2 deneme, aralarında en az 10 dakika, gece aranmaz
  (izinli saat aralığı tenant ayarı, varsayılan 09:00–20:00).
- **DTMF sonucu webhook ile döner** → `call_sessions.dtmf_result` yazılır → akış motoru randevu
  durumunu günceller ve gerekiyorsa bekleme listesini tetikler.
- **Kayıt:** çağrı kaydı tutulacaksa bu ayrı bir kişisel veri işleme faaliyeti; varsayılan
  **kapalı**, açılırsa karşı tarafa anons zorunlu.

### 7.6 Paketleme ve yetkilendirme

Özellikler plana bağlı; kontrol tek yerden:

```
plan_features   plan, feature_key, is_enabled, quota, overage_allowed
entitlements    tenant_id, feature_key, quota_remaining, period_end   -- görünüm
credit_ledger   tenant_id, channel, delta, reason, balance_after, at  -- kontör hareketi
```

- **Sabit ücret + kontör.** Arama ve SMS değişken maliyetli; düz "sınırsız" fiyat kâr yakar.
  Taban abonelik + kanal kontörü modeli. Kontör bakiyesi `credit_ledger`'dan hesaplanır, tek
  sayaç sütunundan değil — mutabakat gerektiğinde tek doğru kaynak hareket dökümüdür.
- **Panel Faz 4'te hazır:** "Sesli Onay" paketi ayarlar ekranında görünür, kilitli, yanında
  "İlgileniyorum" butonu. Bu buton **talep ölçer** — kimin tıkladığı kayıt altına alınır ve
  özelliği geliştirmeden önce gerçek talebi görürsünüz.
- Kota bitince davranış: engelle mi, aşıma izin verip faturalasın mı — plan bazında ayar.

### 7.7 Bekleme listesi — aramanın karşılığı

Sesli arama tek başına zaman kazandırır; **para kazandıran, boşalan slotun anında dolması.**
"2" tuşlanınca: slot serbest bırakılır → bekleme listesinde o hizmet + o gün için uygun ilk
kişiye WhatsApp gider → ilk kabul eden alır (yarış durumu Bölüm 6b'deki exclusion constraint ile
zaten güvenli). Bu ikisi birlikte satılır, ayrı ayrı değil.

### 7.8 Kurtarma raporu — churn'ün panzehiri

KOBİ SaaS'ında iptal, işletmenin ne için ödediğini görememesinden olur. Aylık rapor bunu görünür
kılar: "Bu ay 340 hatırlatma gönderildi · 28 onay · 9 iptal önceden bildirildi · 7 slot yeniden
dolduruldu · **tahmini kurtarılan ciro 10.500 TL** · ödediğiniz 1.200 TL". Bu rapor bir özellik
değil, elde tutma aracı; Faz 5 raporlarının en önemlisi.

---

## 8. Kurumsal yapı — yetki, raporlama, takvim

İlk müşteri tek bir kurum ve öncelik sağlık dikeyi. Bu bölüm o kurumun gerçekten istediği üç şeyi
tanımlıyor: **kendi ekibini kurup yetkilendirebilmek**, **elle hazırladıkları günlük programı
otomatikleştirmek** ve **randevuların hekimin Google takviminde görünmesi**.

### 8.1 Tek model, üç ölçek

Altyapı tek klinikten polikliniğe kadar aynı kalır; fark arayüzde gizlenir.

| Ölçek | Model | Arayüz |
|---|---|---|
| Tek klinik, çok hekim | Tek `branch`, çok `resource` | Şube seçici hiç görünmez |
| Zincir | Çok `branch`, hekim şubeler arası çalışabilir | Şube seçici + merkezi rapor |
| Poliklinik | `departments` (branş) + şube | Bölüm filtresi, bölüm bazlı yetki |

**İlke: özellik var, görünmüyor.** Tek şubeli klinikte şube kavramı arayüzden tamamen kalkar —
kullanıcı hiç bilmez. Zincir olduğunda aynı veriyle açılır. `departments` şimdi opsiyonel alan
olarak konur; sonradan tablo eklemek pahalı, boş bir yabancı anahtar bedava.

### 8.2 Yetki motoru

Sabit dört rol yetmiyor. Kurum kendi ekibini kurup **her birine ne görebileceğini kendisi**
söylemek istiyor. Rol bir izin kümesinin adı; izinler kodda sabit, roller tenant'ın verisi.

```
permissions       key, label, category            -- kodda sabit liste, seed
roles             id, tenant_id, name, is_system  -- sistem rolleri kopyalanabilir
role_permissions  role_id, permission_key, scope(own|branch|tenant)
memberships       user_id, tenant_id, role_id, branch_ids[], resource_id?, assistant_of?
```

**Kapsam (scope) izinden ayrı bir eksen.** `appointment.read` tek başına anlamsız; "kendi
randevuları", "şubesindeki randevular", "kurumdaki tüm randevular" farklı şeyler. İzin + kapsam
birlikte değerlendirilir.

Hazır sistem rolleri — kurum bunları kopyalayıp değiştirebilir:

| Rol | Tipik izinler |
|---|---|
| `owner` | Her şey + faturalama + kurum silme |
| `admin` (klinik yöneticisi) | Personel yönetimi, ayarlar, tüm raporlar; faturalama hariç |
| `hekim` | Kendi takvimi, kendi hastalarının dosyası ve tıbbi notu, kendi performans raporu |
| `asistan` | Bağlı olduğu hekimin takvimi ve hastaları; tıbbi not yazma yetkisi opsiyonel |
| `resepsiyon` | Tüm takvim, randevu oluştur/değiştir, hasta iletişim bilgisi — **tıbbi not yok** |
| `muhasebe` | Ciro ve ödeme raporları; hasta dosyası yok |

**Tıbbi not ayrı bir izindir.** Resepsiyon randevuyu görmeli ama tedavi notunu görmemeli. Bu,
KVKK'nın "gerektiği kadar erişim" ilkesinin ürüne yansıması ve sağlık dikeyinde pazarlık konusu
değil. `customer.medical_notes.read` ayrı bir anahtar.

**Asistan bağlantısı.** Asistan bağımsız çalışmaz, bir hekime bağlıdır: `assistant_of` alanı,
asistanın kapsamını bağlı olduğu hekimin kaynağına daraltır. Bir asistan birden çok hekime
bağlanabilir.

**Yetki RLS'e girer, sadece arayüze değil.** Arayüzde butonu gizlemek yetki değildir; API'den
istek atılınca veri gelir. Politika seviyesinde:

```sql
create or replace function private.can(_perm text, _tenant uuid, _branch uuid default null)
returns boolean language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.user_id = (select auth.uid())
      and m.tenant_id = _tenant
      and rp.permission_key = _perm
      and ( rp.scope = 'tenant'
         or (rp.scope = 'branch' and _branch = any(m.branch_ids)) )
  );
$$;
```

Politikalarda **her zaman** `(select private.can(...))` sarmalıyla çağrılır — satır başına
çağrılmasın diye. `own` kapsamı politikada ayrıca `resource_id = m.resource_id` koşuluyla
tamamlanır.

### 8.3 Rapor motoru — kurumun asıl satın aldığı şey

Şu an bu programı elle hazırlayıp gün sonunda Excel'le paylaşıyorlar. Otomatikleştirilecek olan
**belge değil, işin kendisi**: kimsenin o tabloyu hazırlamak zorunda kalmaması.

Tek seferlik rapor ekranları yazmak yerine tanım + zamanlama motoru:

```
report_definitions  id, tenant_id, key, name, type, scope jsonb, columns jsonb,
                    template_id, is_system
report_schedules    id, tenant_id, report_id, at_time, weekdays[], timezone,
                    recipients jsonb, format(pdf|xlsx|html|message), is_active
report_runs         id, schedule_id, ran_at, period, status, file_url, error
```

Dağıtım için ayrı altyapı yok — Bölüm 7'deki kanal soyutlaması kullanılır. WhatsApp'tan PDF
göndermek, medya mesajı göndermekten ibaret.

**Hazır rapor tipleri**

| Rapor | Ne zaman | Kime |
|---|---|---|
| Yarının programı | Gün sonu 18:00 | Hekime WhatsApp + kuruma e-posta |
| Bugünün programı | Sabah 08:00 | Hekim ve resepsiyon |
| Gün sonu özeti | 20:00 | Yönetim — gelen, gelmeyen, ciro |
| Haftalık doluluk | Pazartesi 09:00 | Yönetim — kaynak kullanım oranı |
| No-show ve kurtarma | Ay sonu | Yönetim — Bölüm 7.8 |
| Hekim performansı | Ay sonu | Yönetim ve ilgili hekim |

**Formatlar.** Ekran (HTML), yazdırma (A4 `@page` CSS), PDF, **XLSX**. Excel'i atlamayın: kurumun
mevcut alışkanlığı bu ve alışkanlık değiştirmek satışı zorlaştırır. Önce onların formatında verin,
zamanla panele çekersiniz.

**Kağıt gerçeği.** Hekim çıktının üzerine elle not alıyor. Şablonda **boş "Not" sütunu** ve satır
başına yeterli yükseklik olacak. Bu küçük detay, çıktının gerçekten kullanılıp kullanılmamasını
belirler.

**Rapor içeriği alıcının yetkisine göre kırpılır.** Hekime giden programda yalnızca kendi hastaları
görünür; ciro sütunu yönetim raporunda vardır, hekim raporunda varsayılan olarak yoktur. Yanlış
alıcıya ciro göndermek gerçek bir sorun — rapor motoru Bölüm 8.2'deki izin fonksiyonunu kullanır,
kendi mantığını kurmaz.

**Her rapor hem anlık hem zamanlı.** Aynı tanım, iki tetikleyici: panelde "İndir" butonu ve
zamanlanmış gönderim. İki ayrı kod yolu yazılmaz.

### 8.4 Google Takvim senkronu — tek yön

Karar: **bizden Google'a tek yön.** Değerin büyük kısmını verir, riski düşüktür. Çift yön
(hekimin takvimindeki özel işlerin slotu kapatması) veri modelinde öngörülür ama Faz 1'de yapılmaz;
watch kanalları, sync token yenileme, döngü koruması ve tekrarlayan etkinlikler ayrı bir proje.

```
calendar_connections  id, tenant_id, resource_id, provider, account_email,
                      calendar_id, mask_level, status(active|needs_reauth), is_active
calendar_event_links  appointment_id, connection_id, external_event_id, etag, last_synced_at
```

- **Hekimler kişisel Gmail kullanacak** → her hekim kendi hesabını tek tek bağlar (OAuth izin
  ekranı). İstenen tek yetki `calendar.events`; fazlası istenmez, izin ekranı ne kadar sade olursa
  bağlanma oranı o kadar yüksek.
- **Refresh token Supabase Vault'ta**, tabloda değil.
- **Ayrı takvim oluşturulur:** hekimin ana takvimine yazılmaz, "TeyitRandevu — Klinik" adlı ayrı
  bir Google takvimi açılır. Hekim istediğinde tek tıkla gizler ya da rengini değiştirir. Kişisel
  takvimi kirletmemek, benimsenmeyi doğrudan etkiler.
- **Maskeleme — KVKK gereği ayar, varsayılanı korumacı:**

  | Seviye | Etkinlik başlığı |
  |---|---|
  | `full` | "Ayşe Demir — Kanal Tedavisi" |
  | `initials` (varsayılan) | "A.D. — Kanal Tedavisi" |
  | `minimal` | "Randevu" |

  Kişisel bir Gmail hesabına tam hasta adı ve tedavi bilgisi yazmak, sağlık verisini Google'a
  aktarmaktır. Kurumun aydınlatma metninde yer almalı ve hekimden ayrıca onay alınmalı.
- **Senkron:** randevu oluştur/güncelle/iptal → kuyruk → Google API. `calendar_event_links`
  üzerinden idempotent upsert; aynı randevu iki kez yazılmaz.
- **Dayanıklılık:** hekim izni geri çekerse bağlantı `needs_reauth` olur ve panelde uyarı çıkar.
  Senkron hatası randevuyu asla bozmaz — takvim ikincil sistemdir.

**Hasta tarafında OAuth istenmez.** Randevu onay mesajına `.ics` eki ve "Google Takvime Ekle"
linki konur. Booking sayfasında hastadan Google hesabı bağlamasını istemek dönüşümü düşürür;
kazanç buna değmez.

### 8.5 Diğer sektörler ne zaman — şablon aileleri

Diğer işletme tipleri sonra gelecek, ama motor şimdi genel kalacak. Doğru soyutlama tek tek sektör
değil, **aile**: ortak modül seti + ortak KVKK profili + içinde birden çok şablon.

| Aile | İçindeki sektörler | Ortak çekirdek |
|---|---|---|
| **Sağlık** | Diş, poliklinik, fizyoterapi, psikolog, diyetisyen, veteriner | Hasta dosyası, tıbbi not izni, tedavi planı, sağlık KVKK profili |
| Kişisel bakım | Berber, kuaför, güzellik, dövme, spa | Paket ve seans takibi, sadakat, kampanya serbestisi |
| Hizmet | Oto servis, atölye, danışmanlık | İş emri, parça/malzeme, teklif |

Aile içine yeni sektör eklemek yalnızca JSON. Yeni aile eklemek küçük bir modül işi. Bu ayrım,
"20 sektör = 20 kod dalı" tuzağını baştan kapatıyor.

**Sıra önerisi:** sağlık ailesini derinleştir (ilk müşteri burada) → kişisel bakım (en çok işletme,
en kolay satış, hukuki yük en düşük) → hizmet. Kişisel bakımın hukuki avantajı önemli: sağlık verisi
yok, kampanya mesajı serbest, özel nitelikli veri yükü yok.

### 8.6 Tek kuruma satarken — ajans olmama kuralı

Tek kuruma satmanın en büyük riski ürün şirketi değil ajans olmak. Kural ilk talep gelmeden yazılır,
sonra yazılırsa işe yaramaz. Her talep üç kovadan birine girer:

1. **Ayar veya veri** — hemen yapılır, bedava, üstelik diğer müşterilere de fayda
2. **Genel ürün özelliği** — yol haritasına girer, sıraya alınır
3. **Yalnızca onlara özel kod** — ya reddedilir ya ayrı fiyatlanır; ürün koduna karışmaz

İlk müşteri bir gelir kaynağı değil **tasarım ortağıdır**. Ondan alınacak asıl şey para değil;
gerçek kullanım verisi, referans ve vaka çalışması. Fiyatı buna göre düşük tutup karşılığında
referans olmayı sözleşmeye yazın.

---

## 9. Arayüz ve tasarım sistemi

Pazarda rakip çok; ürünün ilk 30 saniyede "özenli yapılmış" hissi vermesi gerekiyor. Bu bölüm o
hissi tesadüfe bırakmamak için var.

### Temel duruş

Bu bir **operasyon aracı**. Resepsiyonist bunu günde sekiz saat kullanacak, hayran kalmak için
değil iş bitirmek için açacak. Dolayısıyla öncelik sırası: hız → yoğunluk → netlik → estetik.
Pazarlama sitesi başka bir dil konuşabilir, panel konuşamaz.

### Kaçınılacaklar — "yapay zeka çıktısı" görünümü

Aşağıdakiler bugün üretilen her üçüncü arayüzde var; hiçbiri kullanılmayacak:

- Mor–mavi degrade hero, cam efektli (glassmorphism) kartlar
- Her yere `rounded-lg`, her kartın altına aynı yumuşak gölge
- Bölüm başlıklarında emoji ikon
- Ortalanmış her şey, sonsuz dikey boşluk
- Inter'in varsayılan haliyle bırakılması
- **shadcn/ui'ın kutudan çıktığı gibi kullanılması** — temel olarak iyi, ama radius, renk, tipografi
  ve boşluk token'ları değiştirilmezse ürün diğer bin taneyle aynı görünür. İlk iş token'ları ezmek.

### Tasarım token'ları

- **Tipografi:** arayüz için **Schibsted Grotesk** veya **Onest** — ikisi de tam Türkçe karakter
  desteğine sahip (ı, İ, ğ, ş, ç, ö, ü) ve Inter'in jenerik hissini taşımıyor. Saat, fiyat, TCKN
  gibi sayısal alanlar için **Geist Mono**, ve her sayı sütununda `font-variant-numeric: tabular-nums`.
  Türkçe metin İngilizceden ~%15 uzundur; buton ve etiketler bunu kaldıracak şekilde ölçülür.
- **Renk:** tek bir marka aksanı. Durum renkleri (onaylı / bekliyor / gelmedi / iptal) aksandan
  **ayrı** semantik bir set, ve renk tek başına anlam taşımaz — her duruma bir şekil/etiket eşlik
  eder (renk körlüğü + siyah-beyaz çıktı).
- **Yoğunluk:** takvim ve liste ekranları sıkı, form ekranları rahat. İki ayrı boşluk ölçeği.
- **Radius:** küçük ve tutarlı (4–6px). Büyük radius operasyon aracını oyuncak gösterir.

### Takvim — ürünün kalbi

Kullanıcı zamanının %80'i burada geçecek, o yüzden en çok emek buraya:
gerçek bir zaman ızgarası, kaynak sütunları, sürükle-bırak taşıma, kenardan tutup süre uzatma,
şu an çizgisi, doluluk yoğunluğunu gösteren ay görünümü. Sanal liste yok — takvim zaten pencereli.

### Klavye ve etkileşim

Resepsiyonistin eli fareye gitmeden çalışabilmeli: `/` arama, `n` yeni randevu, `g d` bugüne git,
ok tuşlarıyla slot gezinme, `Esc` kapatma. Tüm etkileşimli öğelerde görünür `focus-visible` halkası.

### Zorunlu kontrol listesi

Vercel Web Interface Guidelines projenin arayüz standardı. Kurulu `web-design-guidelines` skill'i
her arayüz PR'ında çalıştırılacak. Öne çıkan maddeler:

- İkon-only butonlara `aria-label`; her form alanına gerçek `<label>`
- Eylem için `<button>`, gezinme için `<Link>` — asla `<div onClick>`
- `outline: none` yazılacaksa yerine mutlaka `focus-visible` stili
- Girişlerde doğru `type` ve `inputmode` (`tel`, `email`), `autocomplete`
- Yapıştırma engellenmez; hatalar alanın yanında gösterilir, ilk hataya odaklanılır
- Yalnızca `transform` ve `opacity` animasyonu; `transition: all` yasak; `prefers-reduced-motion`
- Yıkıcı işlem (randevu iptali) onay ya da geri alma penceresi ister — anında silme yok
- URL durumu yansıtır: filtre, sekme, seçili tarih query param'da (paylaşılabilir, geri tuşu çalışır)
- Uzun içerik taşmaz: `truncate` / `line-clamp` + flex çocuklarında `min-w-0`
- Boş durumlar tasarlanır — bugün randevusu olmayan bir klinik kırık ekran görmez
- Tarih ve para **her zaman** `Intl.DateTimeFormat('tr-TR')` / `Intl.NumberFormat('tr-TR')` ile;
  hafta pazartesi başlar; hardcoded format yok
- Sunucu-istemci tarih uyuşmazlığına (hydration) karşı koruma
- Buton metni ne olacağını söyler: "Randevuyu Onayla", "Devam" değil
- Hata mesajı çözümü de içerir: "Bu saat dolu — en yakın uygun saat 14:30"

---

## 10. MVP kapsamı

İlk sürüm artık dört değil **yedi** modül; üçü ilk kurumun satın alma şartı olduğu için
"sonra" listesinden öne alındı. Davranışları sektör şablonuna göre değişken.

1. **Takvim ve randevu yönetimi** — gün/hafta/kaynak görünümü, sürükle-bırak, çakışma kontrolü,
   durum akışı: bekliyor → onaylı → geldi → tamamlandı / gelmedi / iptal.
2. **Public randevu sayfası** — hizmet → personel → tarih → saat → bilgi. İşletme rengi ve logosu,
   mobil öncelikli, KVKK aydınlatma ve rıza akışı.
3. **Müşteri / hasta kartı** — arama, geçmiş, notlar, etiketler, sektöre özel alanlar, belge yükleme.
4. **Hatırlatma** — bildirim sistemi, hizmet bilgilendirmesi / ticari ileti ayrımıyla.
5. **Ekip ve yetki yönetimi** — kurum kendi hekim ve asistanlarını ekler, rollerini düzenler
   (Bölüm 8.2). Tıbbi not ayrı izin.
6. **Rapor motoru ve günlük program** — yarının programı gün sonu otomatik WhatsApp/e-posta,
   PDF + XLSX + yazdırma şablonu (Bölüm 8.3).
7. **Google Takvim senkronu** — hekim bazlı, tek yön, maskeleme ayarlı (Bölüm 8.4).

**MVP dışı (bilinçli olarak):** online tahsilat, native mobil uygulama, e-fatura, muhasebe
entegrasyonu, çoklu dil, **çift yönlü** takvim senkronu, stok yönetimi, e-Nabız entegrasyonu.

---

## 11. Faz planı

| Faz | İçerik | Süre |
|---|---|---|
| 0 | Repo, Supabase projesi, declarative şema, Auth, tenant onboarding, RLS + advisors CI | 1,5 hafta |
| 0.5 | **Hukuki hazırlık** — şirket, VERBİS, metinler, İYS, veri aktarımı kararı (paralel yürür) | 2 hafta |
| 1 | Şube/personel/hizmet/çalışma saati, takvim arayüzü, randevu motoru + exclusion constraint, **yetki motoru** | 4 hafta |
| 2 | Müşteri kartı, esnek alan motoru, şablon kopyalama, arama | 1,5 hafta |
| 3 | Public randevu sayfası, slot API, hold, KVKK aydınlatma + rıza akışı | 2 hafta |
| 4 | Bildirim altyapısı, akış motoru, kanal soyutlaması, SMS/WhatsApp/e-posta, İYS; IVR tabloları + kilitli panel ekranları | 2,5 hafta |
| 5 | **Rapor motoru, günlük program çıktısı, zamanlanmış dağıtım, Google Takvim senkronu** | 1,5 hafta |
| 6 | Gelişmiş raporlar + kurtarma raporu, abonelik planları, kontör defteri, audit log | 2 hafta |
| 7 | Diş dikeyi: diş haritası, tedavi planı, ödeme ve taksit takibi | 2,5 hafta |
| 8 | Sesli arama (IVR): sağlayıcı entegrasyonu, TTS, DTMF webhook, bekleme listesi bağlantısı | 2 hafta |

Toplam **19,5 hafta**; hukuki hazırlık paralel. Artışın kaynağı F1'deki yetki motoru (+1 hafta) ve
yeni F5 (rapor + takvim, 1,5 hafta) — ikisi de ilk kurumun satın alma şartı, opsiyonel değil.

**F0–F5 sonunda pilot kurumda canlıya çıkılabilir** (13 hafta). Kurumun elle yaptığı günlük program
işi bu noktada otomatikleşmiş olur; asıl satış argümanı orada devreye girer.

**F8 koşullu.** Faz 4'te panele konan "Sesli Onay — İlgileniyorum" butonu gerçek talep gösterirse
yapılır. Göstermezse sıradaki dikeye (kişisel bakım ailesi) geçmek daha kârlı. İki haftalık bir
özelliği varsayıma dayanarak yazmak yerine, aylar önceden ölçmek bedava.

### Faz 0'a paralel: satış demosu

Tek dosyalık, `localStorage` ile çalışan bir demo — kendi tasarım dilimizle. Amaç ürün hazır
olmadan üç-beş kliniğe gösterip ön talep toplamak ve arayüz varsayımlarını gerçek kullanıcıyla
test etmek. Yarım günlük iş, üretim koduna karışmaz.

---

## 12. Hukuki süreçler

> Ben hukukçu değilim. Bu bölüm mimariyi etkileyen konuları ve hangi soruları sormanız gerektiğini
> listeliyor; hukuki görüş yerine geçmez. Sağlık verisi + yurt dışı barındırma kombinasyonu
> Türkiye'de KVKK'nın en tartışmalı alanı — **canlıya çıkmadan önce KVKK odaklı bir avukatla
> görüşülmesi gerekiyor.** Ucuz bir adım değil ama sonradan mimari değiştirmekten çok daha ucuz.

### 11.1 Rol ayrımı — her şeyin temeli

| Taraf | Sıfat | Sorumluluk |
|---|---|---|
| Klinik / berber | **Veri sorumlusu** | Hastanın verisini toplama amacını belirler, aydınlatma ve rızadan sorumlu |
| TeyitRandevu | **Veri işleyen** | Onun adına saklar ve işler, talimat dışına çıkamaz |

Bu ayrım ürünün her yerini etkiliyor: aydınlatma metnini klinik verir, siz altyapıyı sunarsınız.
Her işletmeyle **veri işleyen sözleşmesi** imzalanması zorunlu — üyelik sözleşmesinin eki olarak,
kayıt akışında elektronik onayla.

### 11.2 Sağlık verisi ve yurt dışına aktarım — en kritik konu

Diş kliniği verisi KVKK m.6 anlamında **özel nitelikli kişisel veri**. Bunun iki sonucu var:

**a) VERBİS kaydı.** Ana faaliyeti özel nitelikli kişisel veri işlemek olan veri sorumluları,
çalışan sayısı ve bilanço eşiklerinden bağımsız olarak VERBİS'e kayıt olmak zorunda. Sizin kendi
sıfatınızın (kullanıcı verisi için veri sorumlusu, hasta verisi için veri işleyen) netleştirilmesi
ve buna göre kayıt yapılması gerekiyor.

**b) Yurt dışına aktarım — Supabase ve Vercel kararını doğrudan etkiler.**
Supabase ve Vercel yurt dışı sağlayıcılar; Frankfurt bölgesini seçseniz bile bu KVKK m.9 anlamında
yurt dışına aktarımdır. 2024'teki 7499 sayılı kanun değişikliğinden sonra aktarım şu yollarla mümkün:

1. Kurul'un yeterlilik kararı (bugüne kadar hiçbir ülke için verilmedi — pratikte yok)
2. **Uygun güvenceler:** standart sözleşme, taahhütname veya bağlayıcı şirket kuralları
3. Arızi haller (istisnai, süreklilik arz eden bir SaaS'a uymaz)

Pratik yol 2. madde: Kurul'un yayımladığı **standart sözleşme** imzalanır ve **imzadan itibaren
5 iş günü içinde Kurul'a bildirilir**. Bildirim yapılmaması idari para cezası sebebi.

Üç seçenek var, ve bu bir mühendislik kararı değil ticari bir karar:

| Seçenek | Artı | Eksi |
|---|---|---|
| **A. Supabase EU (Frankfurt)** | Hızlı başlangıç, düşük operasyon yükü, planlanan mimari | Standart sözleşme + Kurul bildirimi süreci; kurumsal klinik müşteride "veri nerede" itirazı |
| **B. Türkiye'de self-hosted Supabase** | Yurt dışı aktarım sorunu yok, satışta güçlü argüman | Sunucu, yedek, güncelleme, nöbet sizde; Faz 0'a ~1 hafta ekler |
| **C. Hibrit** — uygulama Vercel'de, veritabanı Türkiye'de | Vercel'in geliştirici deneyimi + veri yurt içinde | Gecikme artar, iki ortam yönetilir, en karmaşığı |

**Önerim: A ile başlayın, B'ye geçiş yolunu açık tutun.** Supabase self-hosted açık kaynak
olduğu için bu geçiş gerçekten mümkün — ama ancak Supabase'e özgü olmayan standart Postgres
özellikleriyle kalırsanız. Planın tamamı buna uygun; tek istisna Edge Functions, o da taşınabilir
küçük bir yüzey. Kurumsal bir zincir klinik "veri Türkiye'de olacak" derse, o gün B'ye geçebilmek
şirketin değerini korur.

### 11.3 Ticari ileti, İYS ve ETK — hatırlatma özelliğinin hukuku

6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun, ticari elektronik ileti için önceden
onay ve **İYS (İleti Yönetim Sistemi)** kaydı zorunlu kılıyor. Kritik ayrım:

| Mesaj | Sınıf | Onay gerekir mi |
|---|---|---|
| "Yarın 14:30 randevunuz var" | Hizmete ilişkin bilgilendirme | Hayır — mevcut hizmet ilişkisi kapsamında |
| "Randevunuz onaylandı / iptal edildi" | Hizmete ilişkin bilgilendirme | Hayır |
| "Doğum gününüz kutlu olsun, %20 indirim" | **Ticari elektronik ileti** | **Evet — onay + İYS kaydı + ret hakkı** |
| "Uzun zamandır gelmediniz, sizi bekleriz" | **Ticari elektronik ileti** | **Evet** |

**Otomatik aramalar da aynı ayrıma tabi.** "Randevunuz var, geliyor musunuz" hizmet
bilgilendirmesi; "kampanyamız var" ticari ileti ve sesli aramada da İYS onayı gerektirir. Ek
olarak arama saatleri makul olmalı — ürün tarafında izinli saat aralığı zorunlu ayar, çağrı
kaydı varsayılan kapalı ve açılırsa anons zorunlu. Sağlayıcı seçilmeden önce BTK'nın otomatik
arama kuralları avukata sorulacak.

Ürüne yansıması: her bildirim şablonunda `is_commercial` alanı olacak. Ticari işaretli şablonlar
yalnızca İYS onayı olan alıcılara gider, her mesajda ret linki bulunur, retler İYS'ye işlenir.
Bu ayrım sonradan eklenemez — veri modelinde ilk günden var (Bölüm 7).

**Ek uyarı — sağlık reklamı:** diş klinikleri Sağlık Bakanlığı'nın tanıtım ve bilgilendirme
mevzuatına tabi ve **indirim/kampanya duyurusu yapamazlar**. Yani "geri kazanım kampanyası"
özelliği berber için satılabilir, diş kliniği için müşteriyi cezaya sokabilir. Şablon kütüphanesi
sektöre göre filtrelenmeli — bu bir ürün özelliği, hukuki bir zorunluluktan doğuyor.

### 11.4 Aydınlatma, rıza ve veri hakları

- **Aydınlatma metni** ve **açık rıza** ayrı şeyler; ayrı kutu, ayrı kayıt. Tek bir "kabul ediyorum"
  onay kutusuna sığdırılamaz — özel nitelikli veride açık rıza ayrıca alınır.
- Rıza kaydı `consents` tablosunda: metnin **sürümü**, zaman damgası, IP, kanal. Metin değişirse
  eski rızaların hangi sürüme verildiği bilinmeli.
- **İlgili kişi başvurusu:** 30 gün içinde cevap. Panelde "veri talebi" akışı — dışa aktarma,
  düzeltme, silme. Silme talebinde hard delete değil anonimleştirme (randevu geçmişi ticari kayıt).
- **Veri ihlali bildirimi:** ihlali öğrendikten sonra **72 saat** içinde Kurul'a, ilgili kişilere
  en kısa sürede. Bunun bir prosedürü yazılı olmalı — ihlal anında yazılmaz.
- **Saklama ve imha politikası** yazılı olmak zorunda; hasta dosyası saklama süreleri sağlık
  mevzuatından geliyor ve ticari kayıt sürelerinden farklı.
- **Çerez politikası** ve pazarlama çerezleri için ayrı onay.

### 11.5 Ticari kurulum

- **Şirket:** limited şirket yeterli. Faturalaşma ve ödeme kuruluşu sözleşmesi için şart.
- **Ödeme:** abonelik tahsilatı için iyzico / PayTR / Param gibi lisanslı ödeme kuruluşu.
  Kart verisi **hiçbir koşulda** sizin sisteminize girmez — PCI-DSS yükünü almayın.
- **Sözleşme seti:** üyelik sözleşmesi, KVKK aydınlatma metni, veri işleyen sözleşmesi (ek),
  gizlilik politikası, çerez politikası, mesafeli satış sözleşmesi + ön bilgilendirme formu,
  iptal-iade koşulları, SLA.
- **Fatura:** e-arşiv fatura zorunluluğu; abonelik döngüsüne bağlı otomatik faturalama Faz 5'te.
- **Marka:** "TeyitRandevu" için TÜRKPATENT marka başvurusu — 9. ve 42. sınıflar. Başvuru süreci
  aylar sürüyor, ilk haftada başlatılmalı.
- **Alan adı ve e-posta:** kurumsal e-posta, SPF/DKIM/DMARC kaydı (hatırlatma e-postaları spam'e
  düşmesin — teknik bir konu ama ticari sonucu var).

### 11.6 Kritik yol

Bu maddeler Faz 0.5'te, geliştirmeyle paralel yürür ve canlıya çıkışı engelleyebilecek olanlar:

1. Şirket kuruluşu → ödeme kuruluşu sözleşmesi (en uzun süren, en erken başlatılmalı)
2. Yurt dışı aktarım kararı (A / B / C) → **mimariyi belirler, Faz 1'den önce netleşmeli**
3. Standart sözleşme + Kurul bildirimi (A seçilirse)
4. İYS üyeliği ve marka başvurusu
5. Sözleşme setinin avukat tarafından hazırlanması
6. VERBİS kaydı

---

## 13. Riskler

| Risk | Önlem |
|---|---|
| Çift rezervasyon | Veritabanı exclusion constraint; uygulama kontrolüne güvenilmez |
| RLS politikası açığı | `supabase db advisors` CI'da zorunlu; Bölüm 3 tuzak listesi kod incelemesinde |
| Yaz saati / timezone | Her yerde UTC + IANA timezone, hiçbir yerde naive datetime |
| Yurt dışı aktarım itirazı | Supabase self-hosted'a geçiş yolu açık tutulur (Bölüm 12.2) |
| İYS ihlali cezası | Şablonlarda `is_commercial` alanı zorunlu, ticari mesaj onaysız gitmez |
| Diş kliniğine kampanya SMS'i | Şablon kütüphanesi sektöre göre filtrelenir |
| SMS maliyeti kârı yer | Plan başına kredi, aşımda WhatsApp'a düşürme, kullanım sayacı |
| Arama maliyeti kârı yer | Kademeli zincir: arama yalnızca cevapsız azınlığa gider; kontör modeli, sabit fiyat yok |
| Türkçe TTS kalitesi kötü | Sağlayıcı seçilmeden önce gerçek telefonda dinleme testi; kötüyse önceden kaydedilmiş ses + değişken ekleme |
| Otomatik arama rahatsızlık verir | İzinli saat aralığı (varsayılan 09:00–20:00), en fazla 2 deneme, ilk tuşta çıkış, kolay opt-out |
| IVR'ye talep çıkmaz | Faz 4'te kilitli ekran + "İlgileniyorum" ile talep ölçülür; F7 koşullu |
| Arayüz jenerik görünür | Bölüm 9 kaçınılacaklar listesi + her PR'da tasarım incelemesi |
| Geniş kapsam, tek geliştirici | Faz sınırları katı, MVP dışı liste yazılı |
| "Her şey özelleşsin" baskısı | Özelleştirme veri seviyesinde; kod çatallanmasına izin verilmez |
| Tek kuruma özel yazılım şirketine dönüşme | Bölüm 8.6'daki üç kova kuralı, ilk talep gelmeden yazılı |
| Yetki arayüzde kalır, API'den sızar | İzin kontrolü RLS politikasında; arayüz kontrolü yalnızca görsel |
| Hasta adı hekimin kişisel Gmail'ine gider | Maskeleme varsayılanı `initials`; aydınlatma metninde açıkça yer alır |
| Google token'ı iptal edilir, senkron sessizce durur | Bağlantı `needs_reauth` işaretlenir, panelde uyarı çıkar |
| Rapor yanlış alıcıya ciro gönderir | Rapor içeriği alıcının izniyle kırpılır; rapor motoru kendi mantığını kurmaz |

---

## 14. İlk sprint (Faz 0)

1. `create-next-app` + TypeScript + Tailwind + shadcn/ui — **token'lar ilk gün ezilir** (Bölüm 9)
2. Supabase projesi (EU), CLI kurulumu, `supabase/schemas/` declarative şema
3. Çekirdek tablolar: tenants, memberships, branches, resources, services, customers, appointments
4. `private.is_tenant_member()` + RLS politikaları + RLS sütunlarına indeks
5. `supabase db advisors` CI adımı — açık varsa build kırılır
6. Supabase Auth: kayıt, giriş, davetle ekip üyesi ekleme
7. Onboarding sihirbazı: işletme adı → sektör seçimi → şablon kopyalama → çalışma saatleri
7b. İzin listesi ve sistem rolleri seed'i — yetki motorunun temeli Faz 0'da atılır
8. `lib/templates/dental.json` ve `barber.json` — iki şablonla motoru doğrula
9. Paralel: Bölüm 12.6 kritik yol maddeleri başlatılır

### Kurulu skill'ler

| Skill | Kullanım |
|---|---|
| `supabase` | Supabase işleri; güvenlik kontrol listesi, CLI, şema akışı |
| `supabase-postgres-best-practices` | Şema, indeks, RLS performansı, kilit ve bağlantı yönetimi |
| `web-design-guidelines` | Her arayüz PR'ında Vercel Web Interface Guidelines incelemesi |
| `vercel-react-best-practices` | React/Next.js performans kuralları |
| `find-skills` | Yeni ihtiyaç çıktığında skill arama |
