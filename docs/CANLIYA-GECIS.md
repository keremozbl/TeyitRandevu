# Canlıya Geçiş Kontrol Listesi

Test ortamında sorun çıkarmayan ama canlıda çıkacak şeyler. Her madde bilinçli
bir borç — hangisi olduğunu ve nasıl kapatılacağını yazıyorum ki sonradan
"neden böyle yapılmış" diye bakılmasın.

Son güncelleme: 2 Eylül 2026 · Durum: Faz 4 + pazarlama sitesi

---

## A. Zaman bombaları — tarihi olan işler

### A1. `audit_logs` bölümleri ✅ çözüldü

Tablo ay bazlı bölümlenmiş ve elle üç bölüm açılmıştı: 2026-08, 09, 10. **1 Kasım
2026'dan sonra bu tabloya yapılan her INSERT hata verecekti** — uygun bölüm
bulunamadığı için. Denetim kaydı yazan bir trigger devreye girdikten sonra bu,
hasta kaydı açmayı engelleyecek kadar yayılırdı.

`pg_cron` kuruldu (`supabase/schemas/95_cron.sql`). `audit-partitions` işi her
ayın 1'inde 03:00 UTC'de `private.ensure_audit_partitions(3)` çağırıyor: bulunan
ay ve sonraki üç ay açık tutuluyor. Üç aylık pay, işin iki ay üst üste
çalışmaması durumunda bile bölümün hazır olması için — zamanlanmış işin sessizce
durması gerçek bir olasılık. 2026-11 ve 2026-12 bölümleri fonksiyon ilk
çalıştırıldığında açıldı.

**Bilinmesi gerekenler:**

- Bölüm sınırları açıkça `+00` ile yazılıyor. `timestamptz` bir sınır, DDL'i
  çalıştıran oturumun saat diliminde yorumlanır; yanlış dilim ay başındaki
  kayıtların yanlış bölüme düşmesi demek.
- Yeni bölüm ana tablodan RLS'i miras alıyor ama `force`'u almıyor; fonksiyon
  onu elle açıyor. Bölümlere hiçbir role yetki verilmiyor.
- **Eski bölümü silen kod yok.** Saklama ve imha politikası kararlaştırılmadı
  (C tablosu); "yer açsın" diye veri silen bir iş, hukuken tutulması gereken
  kaydı silen iş olabilir.

### A2. Ücretsiz Supabase projesi 7 gün hareketsizlikte duraklatılıyor

Pilot kliniğe demo yapacağınız gün proje uykuda olabilir. Pilot başlamadan önce
ücretli plana geçilmeli — aynı zamanda yedekleme için de gerekli (bkz. B5).

### A3. KVKK yurt dışı aktarım evrakı

Frankfurt bölgesi seçildi ama standart sözleşme imzalanıp Kurul'a bildirilmedi.
Gerçek hasta verisi girmeden önce tamamlanmalı — Plan Bölüm 12.2.

### A4. Süresi dolan slot tutmaları ✅ çözüldü

Public sayfada müşteri formu doldururken slot `pending` + `hold_expires_at` ile
tutuluyor (Plan 6c). Süre dolduğunda satır ölüyor ama **tablodan düşmüyor**:
`appointments_no_overlap` kısıtı onu hâlâ dolu sayar.

Şu an temizlik yazma yolunda yapılıyor — `booking_hold` ve `create_appointment`
o kaynağın ölü tutmalarını yazmadan hemen önce siliyor
(`private.sweep_expired_holds`). Uygunluk listesi ve panel ızgarası da süresi
dolmuş tutmaları zaten görmezden geliyor. Yani **görünür bir hata üretmiyor**;
ama kimse o kaynağa randevu yazmazsa satır tabloda kalmaya devam ediyor.

`hold-sweep` işi dakikada bir `private.sweep_all_expired_holds()` çağırıyor.
Yazma yolundaki kaynak bazlı süpürme **kaldırılmadı**: iş dakikada bir çalışsa
bile aradaki 59 saniyede yazılan randevu ölü tutmaya takılabilirdi. İkisi
birlikte çalışıyor — biri doğruluk için, diğeri temizlik için.

Silinen satırda hasta verisi yok (ad ve telefon onay adımında yazılıyor) ve
bekleyen bildirimi de yok: kuyruğa yazan fonksiyon `hold_expires_at is not null`
satırında duruyor.

**Üçüncü iş — `cron-history`:** pg_cron her çalıştırmayı
`cron.job_run_details`'e yazıyor; dakikalık bir iş ayda ~43 bin satır demek.
Gece 03:10 UTC'de bir haftadan eski kayıtlar siliniyor. Bir hafta, "iş çalışıyor
mu, ne zaman hata verdi" sorusunu cevaplamaya yetiyor.

İşlerin durumu tek sorguyla görülür:

```sql
select jobname, schedule, active from cron.job;
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid)
 order by d.start_time desc limit 20;
```

---

## B. Canlıya çıkmadan önce mutlaka

### B1. Bütün anahtarlar yenilenecek

`publishable`, `secret` ve veritabanı parolası sohbet geçmişinde ve `.env`
dosyasında düz metin duruyor. Test için sorun değil, canlı için değil.
Settings → API → Rotate, ardından Settings → Database → Reset password.

**Ek risk:** proje klasörü OneDrive içinde. `.env` git'e gitmiyor ama
Microsoft'un bulutuna senkronlanıyor. Canlı anahtarlar burada durmamalı;
üretim değerleri yalnızca Vercel'in Environment Variables ekranında olmalı.

### B2. Demo hesap ve demo kurum silinecek

Geliştirme sırasında canlı projeye bir demo hesap ve "Demo Diş Kliniği" adında
bir kurum yazıldı (`npm run demo:seed`). Hesap yönetici API'siyle açıldığı için
e-posta doğrulaması atlandı ve parolası betikte düz metin duruyor.

```bash
npm run demo:seed -- --temizle    # kurumu, bağlı tüm kayıtları ve hesabı siler
```

Pilot kuruma açılmadan önce çalıştırılacak; demo verisi gerçek hasta
kayıtlarıyla aynı veritabanında durmamalı.

**Vitrin kurumu bundan ayrı ve silinmiyor:** `/demo` düğmesinin açtığı
"Vitrin Diş Kliniği" ürünün vitrinidir, geliştirme artığı değil (B12). Silinecek
olan yalnızca bu geliştirme hesabıdır.

### B3. Kendi SMTP'niz bağlanacak

Supabase'in varsayılan e-posta göndericisi geliştirme içindir: saatte birkaç
mesajla sınırlı ve teslimat garantisi yok. Doğrulama ve giriş bağlantıları
gitmezse kimse sisteme giremez.

Resend/Postmark bağlanacak, SPF + DKIM + DMARC kayıtları yazılacak. E-posta
şablonları da Türkçeleştirilecek — şu an Supabase'in İngilizce varsayılanları
gidiyor.

### B4. Auth ayarları canlı projede yapılandırılacak

`supabase/config.toml` **yalnızca yerel geliştirmeyi** etkiler; bulut projesi
kendi ayarlarını kullanır. Şu an bulutta:

| Ayar | Şu an | Olması gereken |
|---|---|---|
| Site URL / Redirect URLs | localhost | üretim alan adı |
| E-posta doğrulama | açık | açık kalsın |
| JWT ömrü | varsayılan (1 saat) | sağlık verisi için kısa tutulsun |
| Sızmış parola kontrolü | **kapalı** | açılsın (HaveIBeenPwned) |
| Parola politikası | 8 karakter | uzunluk + karmaşıklık artırılsın |
| MFA | kapalı | `owner` ve `admin` için zorunlu olsun |

Sağlık verisi tutan bir sistemde yönetici hesabının tek faktörle korunması
savunulabilir değil.

### B5. Yedekleme ve PITR

Ücretsiz planda anlamlı yedek yok. Hasta verisi girdiğiniz an point-in-time
recovery şart. Ayrıca geri yükleme bir kez **denenmeli** — denenmemiş yedek
yedek sayılmaz.

### B6. `rls:test` üretime karşı çalıştırılamamalı

Betik gerçek kullanıcı ve kurum oluşturup siliyor. Şu an hangi veritabanına
bağlandığını kontrol etmiyor. Üretim URL'sini görürse kendini durduran bir
koruma eklenecek.

### B7. Hata mesajları içeriyi sızdırıyor

`createTenantAction` içinde tanınmayan hatalar `error.message` olarak
kullanıcıya gösteriliyor; bu Postgres kısıt adlarını ve şema ayrıntılarını
dışarı verebilir. Canlıda: kullanıcıya genel mesaj, ayrıntı sunucu günlüğüne.

---

### B8. Vercel bölgesi Supabase bölgesiyle aynı olacak

Supabase projesi **eu-central-1** (Frankfurt). Sayfa süresi kod hızından çok
sunucu ile veritabanı arasındaki tur sayısına bağlı: `/app` beş altı kez sıraya
giriyor. Bu makinede tur başına ~110 ms ölçüldü, yani üretim derlemesinde bile
sayfa ~530 ms. Aynı istekler Frankfurt'taki bir fonksiyondan atıldığında tur
birkaç milisaniyeye iner.

`vercel.json` içine `"regions": ["fra1"]` yazıldı; ilk dağıtımda proje
ayarlarından da doğrulanacak. Seçilmezse varsayılan bölge Washington olur ve
her tur okyanusu geçer.

Ölçüm: `requireTenant()` istek başına `cache()` ile bir kez çalışıyor ve şube,
ayar, kaynak sorguları aynı anda atılıyor (694 ms → 532 ms). Kalan turlar
oturum doğrulaması (proxy + sayfa) ve günün verisi; bunları azaltmanın yolu
`getClaims()` ile JWT'yi yerelde doğrulamak, o da ayrı bir karar.

### B9. SMS / WhatsApp sağlayıcı sözleşmesi

Bildirim altyapısının tamamı çalışıyor — kuyruk, zamanlama, şablon, İYS kapısı,
yeniden deneme — ama **gerçek bir sağlayıcı bağlı değil**. Tek uygulama
`src/lib/notifications/providers.ts` içindeki `log`: mesajı üretir, kuyruğa
yazar, sunucu günlüğüne basar, **göndermez**. Panel bunu her satırda açıkça
söylüyor ("log · gerçekten gönderilmedi").

Hatırlatma bu ürünün asıl satış argümanı; pilot kurum bunsuz canlıya
çıkamaz. Yapılacak iş bir `MessageProvider` uygulaması eklemek ve
`PROVIDERS` eşlemesinde kanalı ona bağlamak.

| Kanal | Aday | Not |
|---|---|---|
| SMS | NetGSM, İletimerkezi, Verimor | Türkçe karakter mesajı UCS-2'ye düşürüyor: 70 karakter/parça, iki katı fiyat. Şablon ekranı parça sayısını gösteriyor |
| WhatsApp | WhatsApp Cloud API, 360dialog | Şablon onayı Meta tarafında günler sürüyor, erken başlatılmalı |
| E-posta | Resend | B3 ile aynı iş: SPF/DKIM/DMARC |

**İYS üyeliği** ticari ileti göndermenin ön şartı; kayıt olmadan kampanya
mesajı gönderilemez (hatırlatma gönderilebilir, o hizmet bilgilendirmesi).

### B10. Kuyruk zamanlayıcısı Vercel'de yapılandırılacak

`vercel.json` içinde `/api/bildirim/gonder` beş dakikada bir çağrılıyor.
İki şart var:

1. **CRON_SECRET** Vercel'in Environment Variables ekranına yazılacak. Yoksa
   uç nokta 503 döner ve kuyruk hiç boşalmaz — bilinçli: korumasız çalışmaz.
2. **NEXT_PUBLIC_SITE_URL** üretim alan adına ayarlanacak. Hatırlatma
   mesajındaki randevu bağlantısı bu kökle kuruluyor; boş kalırsa hastaya
   `/r/klinik/randevu/…` diye tıklanamaz bir yol gider.
3. **Dakikalık cron Pro planı istiyor.** Hobby planında cron günde bir kez
   çalışır; "iki saat kala hatırlatma" o planda anlamsız olur. Pilot öncesi
   plan yükseltmesi zaten A2 ve B5 için de gerekiyor.

**Alternatif — artık hazır:** `pg_cron` kuruldu (A1/A4), yani kuyruk Vercel Pro
olmadan da beş dakikada bir boşaltılabilir. Eksik olan tek şey uç noktanın
dışarıdan erişilebilir bir adreste olması; bu yüzden iş **kurulmadı**, ilk
dağıtımdan sonra eklenecek:

```sql
create extension if not exists pg_net;

select cron.schedule('notification-drain', '*/5 * * * *', $$
  select net.http_post(
    url     := 'https://<alan-adı>/api/bildirim/gonder',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret')));
$$);
```

Sırrın SQL'e düz metin gömülmemesi için `alter database postgres set
app.cron_secret = '...'` ile ayarlanır; Vault de bir seçenek. `pg_net` çağrıyı
asenkron yapar, yanıtı `net._http_response` tablosunda tutar ve o tablonun da
budanması gerekir.

### B11. Pazarlama sitesi yayına çıkmadan doldurulacaklar

Site kuruldu (`src/app/(pazarlama)`) ama **bu hâliyle yayına alınamaz**: içinde
gerçek olmayan üç şey var ve üçü de kod değil, ticari karar.

| Ne | Şu an | Nerede |
|---|---|---|
| Alan adı | yok; `NEXT_PUBLIC_SITE_URL` boşsa `localhost` | `src/lib/marketing/site-url.ts` — sitemap, robots ve paylaşım kartı buradan besleniyor |
| Tüzel kişi ve iletişim | `iletisim@teyitrandevu.com` **uydurma**, adres ve telefon `null` | `SITE_CONTACT`, `src/lib/legal/site-texts.ts` |
| Fiyatlar | **temsilî** — 890 / 1.890 / görüşelim | `PLANS` ve `PRICING_IS_DRAFT`, `src/lib/marketing/content.ts` |

`PRICING_IS_DRAFT` true olduğu sürece fiyat sayfası "fiyatlar temsilidir"
uyarısını çiziyor. Gerçek fiyat belirlenince bayrak kapatılır. **Paket
özellikleri hiçbir yerde uygulanmıyor:** `PLANS[].includes` ve `limits` şu an
yalnızca metin; kotayı zorlayan kod faturalama modülüyle gelecek (E tablosu,
kontör defteri).

**Veri merkezinin nerede olduğu pazarlama sitesinde bilerek YAZMIYOR** (2 Eylül,
Kerem'in kararı: bu konu birebir görüşmede anlatılıyor). Aydınlatma metninde
KALIYOR ve kalmalı — yurt dışına aktarım KVKK m.9 gereği orada yazılmak
zorunda (`lib/legal/site-texts.ts`, `consent-texts.ts`). Siteye geri
eklenmesin; `lib/marketing/content.ts` başındaki not bunu söylüyor.

Ayrıca yayın öncesi: aydınlatma metni (`SITE_NOTICE_VERSION`) avukat
görmedi — hasta rıza metinleriyle aynı kalem (C tablosu).

**Demo talepleri kiracı panelinde DEĞİL.** Satış verisi hiçbir kuruma ait
olmadığı için ayrı bir platform katmanı kuruldu:

- `demo_requests` — formun tek çıktısı; yazma yolu `public.submit_demo_request`
  (`anon`a tablo yetkisi yok, Kural 8), günde aynı IP'den 5 talep sınırı.
- `platform_admins` — kiracı rol sisteminden bağımsız, bilerek ilkel: satırı
  olan yöneticidir. Satır yalnızca servis rolüyle eklenir:
  `npm run platform:admin ekle <e-posta>`.
- Ekran `/yonetim/talepler`, yetkisi olmayana 404.

Ticari ileti onayı talebin kendi satırında (`marketing_ok`): "demo istiyorum"
demek kampanya maili almayı kabul etmek değildir. Bu talepte veri sorumlusu
**TeyitRandevu'dur** — hasta verisindeki rolün tersi (Plan 11.1), rıza kaydı da
o yüzden kiracıya bağlı `consents` tablosuna yazılmıyor.


---

### B12. Canlı demo (vitrin kurumu) — yayın öncesi üç iş

Site ziyaretçisi `/demo` sayfasındaki düğmeyle kayıt olmadan panele giriyor:
sunucu, ortak bir hesapla `signInWithPassword` çağırıp `/app`'e yönlendiriyor.
Ayrıcalıklı istemci yok; ziyaretçinin yalnızca vitrin kurumunu görmesini
sağlayan şey RLS. Kurulum:

```bash
npm run demo:seed -- --vitrin              # kurar ve bugünü tazeler (idempotent)
npm run demo:seed -- --vitrin --temizle    # kurumu ve hesabı siler
```

| Ortam değişkeni | Ne işe yarar |
|---|---|
| `DEMO_PUBLIC_PAROLA` | **zorunlu**; tanımlı değilse `/demo` "canlı demo kapalı" der ve giriş düğmesi çizilmez. Deposunda varsayılanı yok. |
| `DEMO_PUBLIC_EPOSTA` | isteğe bağlı; varsayılan `vitrin@teyitrandevu.com` (alan adı B11 ile değişecek) |

Yayın öncesi kapatılacak üç açık:

1. **Periyodik sıfırlama yok.** Ziyaretçiler kurumu bozacak (randevu silecek,
   ayar değiştirecek). Bugün tek çare betiği elle çalıştırmak. Gereken:
   `--vitrin` kurulumunu günlük çalıştıran bir iş — Vercel cron + `CRON_SECRET`
   korumalı bir route (B10'daki kuyruk zamanlayıcısıyla aynı desen) ya da
   pg_cron. Betiğin randevu yazan bölümü bunun için `src/lib/demo/` altına
   taşınmalı; şu an yalnız betikte.
2. **Vercel'de `DEMO_PUBLIC_PAROLA` tanımlanacak.** Tanımlanmazsa demo sessizce
   kapalı açılır — sayfa bunu söylüyor ama ana sayfadaki birincil CTA oraya
   gidiyor.
3. **Kötüye kullanım sınırı yok.** Hesap ortak olduğu için her tıklama aynı
   kullanıcıya bir Supabase Auth girişi demek; yoğun trafikte Auth hız sınırına
   çarpar. En azından IP başına giriş sınırı (`submit_demo_request`'teki günlük
   5 talep sınırıyla aynı fikir) gerekiyor.

Ayrıca vitrin kurumunda denetim kaydı ziyaretçilerin okumalarıyla doluyor; bu
kurum saklama politikasının (C tablosu) ilk müşterisi olacak.

## C. KVKK — planda söz verilip henüz yapılmayanlar

Bunlar hukuki yükümlülük, "sonra bakarız" kalemi değil. Hepsi Plan Bölüm 12'de
gerekçeleriyle duruyor.

| Yükümlülük | Durum |
|---|---|
| Denetim kaydı: kim hangi hasta kaydını açtı | ✅ **Yapıldı** — hasta kartı açma, tıbbi not okuma ve yazma, hasta kaydı açma ve değiştirme, program dosyasının indirilmesi ve denetim ekranının kendisi kayıt düşürüyor. Kayıt servis rolüyle ve yanıttan SONRA yazılıyor (`src/lib/audit/log.ts`); değişikliklerde alan **adları** yazılıyor, değerleri değil. Ekran: `/app/ayarlar/denetim`, `audit.read` izniyle. Takvim görüntüleme bilerek kayıt üretmiyor — orada tıbbi veri yok ve her yenileme bir satır yazsaydı liste okunamazdı |
| Tıbbi notların sütun bazlı şifrelenmesi | Yapılmadı |
| Aydınlatma ve açık rıza akışı | ✅ **Yapıldı** — public randevu sayfasında ayrı kutu, ayrı kayıt; metin sürümü, IP, tarayıcı ve kanal `consents` tablosuna yazılıyor. Panelde de: hasta kartındaki "Rıza kayıtları" bölümünden üç rıza ayrı ayrı `channel = 'panel'` olarak düşülüyor. O kayıt, rızanın klinikte sözlü ya da imzayla alındığını belgeler — hasta metni ekranda okumadı ve arayüz bunu açıkça söylüyor. Kaydı kimin düştüğü denetim kaydında |
| Rıza metinlerinin hukukçu onayı | Metinler `src/lib/legal/consent-texts.ts` içinde ve sürümlü (`2026-08-28.1`), ama **avukat görmedi**. Özellikle iki nokta: sağlık verisinin hukuki sebebi (açık rıza mı, KVKK m.6/3 sağlık hizmeti istisnası mı) ve yurt dışı aktarım paragrafının A3 ile tutarlılığı. Metin değişince `CONSENT_VERSION` de değişmeli |
| Rıza geri alma (`revoked_at`) akışı | ✅ **Yapıldı** — hasta kartındaki "Geri al" düğmesi. Geri alma satırı DEĞİŞTİRMEZ, yeni satır yazar (`granted = false`, `revoked_at` dolu): `consents` üzerinde UPDATE politikası yok ve verilmiş bir rızanın düzeltilebilmesi kaydın kanıt değerini sıfırlardı. Ticari ileti kapısı en son satıra baktığı için geri alma anında etki eder — `rls:test` bunu doğruluyor: geri almadan sonraki randevunun ticari iletisi `skipped`, hatırlatması etkilenmiyor |
| Saklama ve imha politikası, silme talebi akışı | Yapılmadı — **sıradaki kalem.** İki karar bekliyor: (1) saklama süreleri (hasta dosyası sağlık mevzuatından, randevu ve ticari kayıt zamanaşımından, denetim kaydı ayrı) — bunlar avukata sorulacak, koda sabit yazılmadan önce; (2) silme = **anonimleştirme**, hard delete değil: randevu geçmişi ticari kayıt (Plan 11.4). Politika yazılmadan `audit_logs` bölümlerini silen bir iş de yazılamaz (A1) |
| Veri ihlali bildirim prosedürü (72 saat) | Yazılmadı |
| VERBİS kaydı | Yapılmadı |

Denetim kaydı yazıldı; sıradaki en acil kalem **saklama ve imha politikası**.
İki sebeple: `audit_logs` artık gerçekten büyüyor ve bölüm silen bir iş
politikasız yazılamaz (A1), ayrıca hasta "kaydımı silin" dediğinde işletilecek
bir akış hâlâ yok.

**Denetim kaydında bilinçli olarak OLMAYANLAR** — hepsi ayrı birer karar:

| Olmayan | Neden |
|---|---|
| Takvim ve randevu görüntüleme | Takvimde tıbbi veri yok; her ekran yenilemesi satır yazsaydı liste okunamaz hâle gelirdi |
| Hasta listesi ve arama | Kartın açılması kaydediliyor; listede yalnızca ad ve telefon var |
| Randevu oluşturma/değiştirme | Randevu tablosunun kendisi zaten kim ne zaman yazdı bilgisini taşıyor (`created_at`, durum damgaları) |
| Silme kayıtları | Hasta kaydı zaten silinemiyor (DELETE politikası yok); tıbbi not silme arayüzü de yok |
| Kaydın değiştirilemezliğinin kanıtı (hash zinciri) | Tabloya yalnızca servis rolü yazıyor ve UPDATE/DELETE politikası yok; zincir, veritabanı yöneticisine karşı koruma demek — o eşik ayrı bir karar |

---

## D. Geliştirme altyapısı borcu

### D1. TypeScript tipleri ✅ çözüldü

Docker'a gerek kalmadı: `supabase gen types --project-id` doğrudan Management
API'sine gidiyor. Personal access token ile 26 tablo ve iki RPC tipli üretildi.

**Tek bakım maddesi:** token 30 gün geçerli, **~21 Eylül 2026'da yenilenmeli**.
Süresi dolarsa yalnızca `npm run db:types` etkilenir; uygulama, veritabanı ve
giriş çalışmaya devam eder. Yenileme:
https://supabase.com/dashboard/account/tokens → `.env` içindeki
`SUPABASE_ACCESS_TOKEN` güncellenir.

### D2. Migration'lar elle yazılıyor

`supabase db diff` hâlâ Docker istiyor — tip üretiminin aksine bu gerçekten
bir gölge veritabanı kuruyor. Şu an `supabase/schemas/*.sql` (kaynak) ve
`supabase/migrations/*.sql` (uygulanan) elle senkron tutuluyor. **İkisi
sessizce ayrışabilir** — biri düzeltilip diğeri unutulursa yeni bir ortam
kurulduğunda farklı bir şema çıkar.

Kalan tek Docker gerekçesi bu ve tüm Supabase yığınını değil yalnızca bir
Postgres container'ı kaldırıyor; ileride kurulursa hafif çalışır. O zamana
kadar kural: şema dosyasını değiştiren her commit aynı commit'te migration da
içermeli.

**Ek not:** bu makinede 14,6 GB boş disk ve 7,8 GB RAM var. Docker Desktop
kurulacaksa önce yer açılmalı.

### D3. İlk migration birleştirmeyle üretildi

`20260822120000_ilk_sema.sql` declarative dosyaların sıralı birleşimi. Boş
veritabanında doğru sonucu verdi ve doğrulandı, ama `db diff` çıktısı değil.
Bilinmesi yeterli.

---

## E. Bilinçli borç — şimdilik sorun değil

| Konu | Neden şimdilik yeterli | Ne zaman dönülür |
|---|---|---|
| Kullanıcı başına 5 kurum limiti | Keyfi ama makul bir fren | Kurumsal müşteride gevşetilir |
| `is_slug_available` anon'a açık | Slug'lar zaten public randevu sayfasında | Gerekmez |
| Onboarding RPC'sinde hız sınırı yok | 5 kurum limiti yeterli fren | Kötüye kullanım görülürse |
| `business_type` şablon anahtarına FK'siz | Şablonlar kodda, tablo değil | Şablonlar veritabanına taşınırsa |
| Tenant değiştirici arayüzü yok | Çoğu kullanıcı tek kurumda | Çok kurumlu kullanıcı çıkınca |
| `audit_logs` bölümlerinde politika yok | İzin verilmemiş = erişim yok | Gerekmez |
| Doğum günü akışı KAPALI kuruluyor | Tetiklemek için günlük bir tarama gerekiyor (randevuya bağlı değil, hastaya bağlı); kuyruğa yazan tetikleyici randevu tablosunda. Açık görünüp çalışmayan akış, kurumun gönderdiğini sandığı ama gitmeyen mesaj demek | **Engeli kalktı** (`pg_cron` kuruldu): günlük tarama fonksiyonu + `birthday` işi yazılabilir. Yine de sağlayıcısız gönderim yok (B9) |
| Üretilen tipler her ay bir bölüm tablosu daha içerecek | `gen types` `public` şemasındaki her tabloyu yazıyor, `audit_logs_2026_11` gibi bölümler de dahil. Kod bu tipleri kullanmıyor; gürültü, hata değil | `db:types` çıktısı okunmaz hale gelirse bölümleri ayrı bir şemaya taşımak |
| Kademeli onay zinciri yok: cevap alınca zincirden çıkarma, kanal yükseltme | Akış motoru satırları bağımsız işliyor; "cevap geldi mi" sorusunun cevabı için gelen mesaj/DTMF webhook'u gerekiyor ve hiçbir sağlayıcı bağlı değil (B9). Zincirin kendisi Plan 7.2'nin asıl farkı | Sağlayıcı bağlanınca, IVR'den önce |
| IVR tabloları (`ivr_scripts`, `call_sessions`) kurulmadı | Plan 7.5 bunları Faz 4'te istiyordu ama `voice` kanalı zaten sağlayıcısız; boş tablo şema gürültüsünden başka şey değil | Sesli arama talebi ölçülünce (Plan 11, F8 koşullu) |
| Kendi hesabını getir (`tenant_providers`) yok | Plan 7.3'te "ilk günden" deniyor ama kimlik bilgilerini Vault'ta tutmak bir sağlayıcı entegrasyonu olmadan test edilemez | İlk BYO talebinde — büyük klinik kendi NetGSM sözleşmesini isteyince |
| Kontör defteri ve kota yok (`credit_ledger`, `plan_features`) | Faturalama modülü hiç yok; gönderim ücreti `notifications.cost` sütununa yazılıyor, defter sonradan bu satırlardan kurulabilir | Abonelik ve faturalama modülünde |
| Bekleme listesi otomatiği yok | Tablo var (`waitlist_entries`), boşalan slotu teklif eden akış yok; teklif göndermek için sağlayıcı gerekiyor (B9) | Sağlayıcı bağlandıktan sonra — Plan 7.7 |
| Panelden elle mesaj gönderme yok | `notifications` tablosunda INSERT politikası bilerek yok: elle mesaj, hizmet/ticari ayrımını atlamanın yolu olurdu | Gerekirse şablon seçtiren, türü şablondan alan bir akışla |
| Public sayfada hız sınırı kabaca: aynı IP'den en fazla 5 canlı slot tutması, aynı telefondan günde 3 online randevu | Tablo ya da Redis istemeyen, tek sorgulu iki fren; kötüye kullanımın gerçek maliyeti (klinik takviminin doldurulması) bu iki eşikle sınırlanıyor | Gerçek bir kötüye kullanım görülünce ya da CAPTCHA gerekince |
| Hizmet-kaynak eşlemesi için arayüz yok | Kurulum sihirbazı her hizmeti tüm personel kaynaklarına bağlıyor; **sonradan eklenen hekim hiçbir hizmete bağlı olmuyor ve public sayfada hiç görünmüyor**. Panelden randevu vermek çalışmaya devam ediyor | İkinci hekim eklenip online randevuya açılmak istendiğinde |
| Online randevu `pending` kalıyor, otomatik onay yok | Kliniğin görmediği randevuyu "onaylı" saymak yanlış olurdu; panelde onay bekleyen olarak görünüyor | Bildirim kanalları gelince: otomatik onay + teyit mesajı birlikte anlamlı |
| Public sayfada kurum logosu ve rengi kullanılmıyor | `tenant_settings.branding` okunuyor ama çizilmiyor; Storage kovası da yok (logo yüklenecek yer) | Belge yükleme ile aynı işte — Storage kurulduğunda |
| Hasta kartında belge yükleme yok | Storage kovası ve politikaları henüz kurulmadı; kart belgesiz de işe yarıyor | Röntgen/onam formu istendiğinde |
| Listede "sıradaki randevu" en fazla 300 ileri randevu tarar | Klinik ölçeğinde ileri tarihli randevu bunun altında; aşılırsa bazı satırda saat boş görünür, yanlış görünmez | Randevu hacmi büyüyünce tek sorguluk bir görünüm |
| Arayüz terminolojisi sabit ("Hasta") | `tenant_settings.terminology` yazılıyor ama okunmuyor; ilk dikey diş kliniği | Berber ya da başka dikey canlıya çıkınca |
| Excel dosyasında biçim yok: başlık kalın değil, ücret para biçiminde değil | Dosya açılıyor, sütun genişlikleri var, sayı sayı olarak gidiyor — Excel toplayabiliyor. Stil için `styles.xml` gerekiyor | Zamanlanmış gönderimle birlikte |
| Rapor zamanlaması yok: `report_definitions`, `report_schedules`, `report_runs` tabloları kurulmadı | Gönderim için bildirim kanalı altyapısı (Plan Bölüm 7) zaten yok; ekran ve dosya aynı satırlardan besleniyor, zamanlama üçüncü bir kod yolu açmayacak | Bildirim kanalları geldiğinde |
| PDF çıktısı yok | Tarayıcının yazdır komutu A4 düzeninde PDF veriyor; sunucuda PDF üretmek ayrı bir bağımlılık | E-postayla PDF eki istendiğinde |
| Hizmet fiyatı KDV dahil mi hariç mi belirsiz | `price` ve `vat_rate` ayrı tutuluyor ama fatura üretilmediği için ayrım henüz görünmüyor | Ödeme ve fatura modülünde |
| Şube düzenleme arayüzü yok | Kurulum sihirbazı ilk şubeyi açıyor; tek şubeli kurumda kavram arayüzde hiç görünmüyor | Zincir müşteri geldiğinde |
| Kullanıcı daveti yok | Davet e-postası kurumun SMTP'sini istiyor (B3); rol ve izin düzenleme onsuz da çalışıyor | SMTP bağlanınca |
| Üyelik düzenleme yok: rol değiştirme, şube kapsamı, hekim eşlemesi | Tek kullanıcılı kurumda gereksiz; ikinci kullanıcı olmadan test edilemiyor da | İkinci kullanıcı eklenince — davetle birlikte |
| Kullanıcı e-postası servis rolüyle çözülüyor | `auth.users` PostgREST'e kapalı ve `profiles` tablosu yok; kimlikler RLS'ten geçmiş üyelik satırlarından geliyor, servis rolü yalnızca id→e-posta çeviriyor | Denetim kaydı ya da "notu kim yazdı" gerektiğinde `profiles` tablosu |
| Yeni rol oluşturma ve rol silme yok | Şablondan gelen altı rol düzenlenebiliyor; kurum kendi rolünü kurmak isteyene kadar yeterli | Kurum kendi rolünü istediğinde |
| Kaynak silme yok, pasife alma var | `appointments.resource_id` `restrict`; geçmişi olan kaynak zaten silinemez, silinebilseydi takvim geçmişi eksilirdi | Gerekmez |
| Hasta kaydı silinemiyor, anonimleştirme de yok | DELETE politikası bilerek yok (KVKK: kayıt silinmez); ama imha talebi akışı da yok — C tablosundaki kalem | Silme talebi geldiğinde |
| Izgarada sürükleme yalnız fare ve kalemle | Dokunmatikte sürükleme ile kaydırma aynı hareket; düzenleme formu her cihazda çalışıyor | Tablet kullanımı yaygınlaşınca — uzun basıp sürükleme |
| Sürüklenen randevu ızgaranın dışına taşınamaz | Izgara mesai saatlerinden üretiliyor; mesai dışı randevu zaten istisna | Nöbet/acil kaydı sıkça gerekirse |

---

## Sıra önerisi

1. ~~**A1 + A4** `pg_cron` kurulumu~~ — ✅ 1 Eylül 2026
1b. **B11** alan adı, tüzel kişi ve gerçek fiyat — site yayına çıkacaksa bunlar önce
2. **B9 + B10** bildirim sağlayıcısı ve kuyruk zamanlayıcısı — hatırlatma ürünün asıl satış argümanı
3. **B3 + B4** SMTP ve auth ayarları — pilot öncesi
4. **B2** demo hesabın ve demo kurumun silinmesi — gerçek hasta verisi girmeden önce
5. **C** KVKK kalemleri — gerçek hasta verisi girmeden önce
5b. **B8** Vercel bölgesi — ilk dağıtımda, tek kutucuk
6. **B1 + B5 + A2** anahtar yenileme, yedek, ücretli plan — pilot günü
7. **D2** Docker — elle migration yazmak sıkıntı vermeye başlarsa
