# Canlıya Geçiş Kontrol Listesi

Test ortamında sorun çıkarmayan ama canlıda çıkacak şeyler. Her madde bilinçli
bir borç — hangisi olduğunu ve nasıl kapatılacağını yazıyorum ki sonradan
"neden böyle yapılmış" diye bakılmasın.

Son güncelleme: 28 Ağustos 2026 · Durum: Faz 3 (public randevu sayfası canlı)

---

## A. Zaman bombaları — tarihi olan işler

### A1. `audit_logs` bölümleri 1 Kasım 2026'da bitiyor · **71 gün**

Tablo ay bazlı bölümlenmiş ve elle üç bölüm açıldı: 2026-08, 09, 10. **1 Kasım
2026'dan sonra bu tabloya yapılan her INSERT hata verecek** — uygun bölüm
bulunamadığı için. Denetim kaydı yazan bir trigger devreye girdikten sonra bu,
hasta kaydı açmayı engelleyecek kadar yayılabilir.

**Çözüm:** `pg_cron` ile her ay sonraki üç ayın bölümünü önceden açan bir iş.
Denetim kaydı yazımı devreye girmeden önce mutlaka.

```sql
-- taslak
select cron.schedule('audit-partition', '0 3 1 * *', $$
  select private.ensure_audit_partitions(3);
$$);
```

### A2. Ücretsiz Supabase projesi 7 gün hareketsizlikte duraklatılıyor

Pilot kliniğe demo yapacağınız gün proje uykuda olabilir. Pilot başlamadan önce
ücretli plana geçilmeli — aynı zamanda yedekleme için de gerekli (bkz. B5).

### A3. KVKK yurt dışı aktarım evrakı

Frankfurt bölgesi seçildi ama standart sözleşme imzalanıp Kurul'a bildirilmedi.
Gerçek hasta verisi girmeden önce tamamlanmalı — Plan Bölüm 12.2.

### A4. Süresi dolan slot tutmaları `pg_cron` ile süpürülmeli

Public sayfada müşteri formu doldururken slot `pending` + `hold_expires_at` ile
tutuluyor (Plan 6c). Süre dolduğunda satır ölüyor ama **tablodan düşmüyor**:
`appointments_no_overlap` kısıtı onu hâlâ dolu sayar.

Şu an temizlik yazma yolunda yapılıyor — `booking_hold` ve `create_appointment`
o kaynağın ölü tutmalarını yazmadan hemen önce siliyor
(`private.sweep_expired_holds`). Uygunluk listesi ve panel ızgarası da süresi
dolmuş tutmaları zaten görmezden geliyor. Yani **görünür bir hata üretmiyor**;
ama kimse o kaynağa randevu yazmazsa satır tabloda kalmaya devam ediyor.

**Çözüm:** `pg_cron` ile dakikalık bir süpürme. A1'deki bölüm işiyle aynı
`pg_cron` kurulumuna biniyor, ikisi birlikte yapılabilir.

```sql
-- taslak
select cron.schedule('hold-sweep', '* * * * *', $$
  delete from public.appointments
   where status = 'pending' and hold_expires_at is not null and hold_expires_at < now();
$$);
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

Vercel'de proje ayarından **Function Region → Frankfurt (fra1)** seçilecek.
Seçilmezse varsayılan bölge Washington olur ve her tur okyanusu geçer.

Ölçüm: `requireTenant()` istek başına `cache()` ile bir kez çalışıyor ve şube,
ayar, kaynak sorguları aynı anda atılıyor (694 ms → 532 ms). Kalan turlar
oturum doğrulaması (proxy + sayfa) ve günün verisi; bunları azaltmanın yolu
`getClaims()` ile JWT'yi yerelde doğrulamak, o da ayrı bir karar.

---

## C. KVKK — planda söz verilip henüz yapılmayanlar

Bunlar hukuki yükümlülük, "sonra bakarız" kalemi değil. Hepsi Plan Bölüm 12'de
gerekçeleriyle duruyor.

| Yükümlülük | Durum |
|---|---|
| Denetim kaydı: kim hangi hasta kaydını açtı | Tablo var, **yazan kod yok** — hasta kartı geldiğinden beri bu boşluk somut: kart açmak da tıbbi not okumak da kayıt düşürmüyor |
| Tıbbi notların sütun bazlı şifrelenmesi | Yapılmadı |
| Aydınlatma ve açık rıza akışı | ✅ **Yapıldı** — public randevu sayfasında ayrı kutu, ayrı kayıt; metin sürümü, IP, tarayıcı ve kanal `consents` tablosuna yazılıyor. Panelden açılan randevuda hâlâ yok (resepsiyon telefonla randevu alırken rıza kaydı düşmüyor) |
| Rıza metinlerinin hukukçu onayı | Metinler `src/lib/legal/consent-texts.ts` içinde ve sürümlü (`2026-08-28.1`), ama **avukat görmedi**. Özellikle iki nokta: sağlık verisinin hukuki sebebi (açık rıza mı, KVKK m.6/3 sağlık hizmeti istisnası mı) ve yurt dışı aktarım paragrafının A3 ile tutarlılığı. Metin değişince `CONSENT_VERSION` de değişmeli |
| Rıza geri alma (`revoked_at`) akışı | Sütun var, arayüz yok — hasta "rızamı geri alıyorum" dediğinde kaydı işaretleyecek bir yer yok |
| Saklama ve imha politikası, silme talebi akışı | Yapılmadı |
| Veri ihlali bildirim prosedürü (72 saat) | Yazılmadı |
| VERBİS kaydı | Yapılmadı |

Denetim kaydı en acili: hem yasal hem de A1'deki bölüm sorununu tetikleyecek
olan bu.

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

1. **A1 + A4** `pg_cron` kurulumu tek işte: denetim kaydı bölümleri ve ölü slot tutmalarının süpürülmesi
2. **B3 + B4** SMTP ve auth ayarları — pilot öncesi
3. **B2** demo hesabın ve demo kurumun silinmesi — gerçek hasta verisi girmeden önce
4. **C** KVKK kalemleri — gerçek hasta verisi girmeden önce
4b. **B8** Vercel bölgesi — ilk dağıtımda, tek kutucuk
5. **B1 + B5 + A2** anahtar yenileme, yedek, ücretli plan — pilot günü
6. **D2** Docker — elle migration yazmak sıkıntı vermeye başlarsa
