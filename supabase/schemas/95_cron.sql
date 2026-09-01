-- =============================================================================
-- 95_cron — zamanlanmış işler (pg_cron)
-- =============================================================================
-- Buradaki üç iş de "bir gün mutlaka gerekecek" değil, "yapılmazsa belli bir
-- tarihte kırılacak" işler:
--
--   audit-partitions  denetim kaydı tablosunun bölümleri 1 Kasım 2026'da
--                     bitiyor; bölüm bulunamayınca INSERT hata verir ve
--                     denetim kaydı yazan her akış (hasta kartı açmak dahil)
--                     durur. CANLIYA-GECIS A1.
--   hold-sweep        süresi dolmuş slot tutmaları satır olarak duruyor ve
--                     çakışma kısıtı onları hâlâ dolu sayıyor. CANLIYA-GECIS A4.
--   cron-history      pg_cron her çalıştırmayı cron.job_run_details'e yazar;
--                     dakikalık iş ayda ~43 bin satır demek. Kimse silmezse
--                     büyümesinin sonu yok.
--
-- Neden veritabanında, Vercel cron'unda değil: ilk ikisi veritabanının kendi
-- bakımı. Uygulama sunucusu kapalıyken, dağıtım bozukken ya da Vercel planı
-- günde bir çalıştırırken de yapılmaları gerekiyor.
--
-- İşler `postgres` rolüyle çalışır — pg_cron işi kimin planladığını (`username`)
-- kaydeder ve o rolle koşar. Bu roldeki bir işin RLS'i baypas ettiğini bilerek
-- yazıyoruz; ikisi de tek bir tabloya dokunuyor ve hiçbiri hasta verisi okumuyor.

create extension if not exists pg_cron;

-- pg_cron kendi şemasını (`cron`) kurar ve uzantının kendisi `pg_catalog`a
-- bağlanır — yer değiştiremez. `cron` şeması PostgREST'e açık değil
-- (config.toml → api.schemas yalnızca `public`), yani iş listesi dışarıdan
-- görünmez.

-- -----------------------------------------------------------------------------
-- Denetim kaydı bölümleri
--
-- `audit_logs` ay bazlı bölümlenmiş (50_appointments). Bölüm önceden açılmazsa
-- INSERT "no partition of relation found" ile patlar; bu, KVKK kaydı yazan
-- akışı değil onu tetikleyen işlemi de geri alır.
--
-- Fonksiyon içinde bulunan ayı ve sonraki `_months` ayı açar, var olanı
-- atlar. Aylık iş üç ay ileriyi tuttuğu için iki ay üst üste çalışmasa bile
-- açık kalır — zamanlanmış işin sessizce durması gerçek bir olasılık.
--
-- Sınır değerleri açıkça `+00` ile yazılıyor: `timestamptz` bir bölüm sınırı,
-- DDL'i çalıştıran oturumun saat diliminde yorumlanır. Sunucu şu an UTC ama
-- bu bir varsayım olarak kalmamalı — yanlış dilim, ay başındaki randevuların
-- yanlış bölüme düşmesi demek.
--
-- Yeni bölümde RLS ana tablodan miras alınıyor; `force` alınmıyor, o yüzden
-- burada elle açılıyor. Bölümlere kimseye yetki verilmiyor: `audit_logs`
-- üzerinden okunur (90_rls), bölümün adıyla okunmaz.
--
-- Eski bölümlerin SİLİNMESİ burada yok. Saklama süresi ve imha politikası
-- henüz kararlaştırılmadı (CANLIYA-GECIS C); "yer açsın diye" veri silen bir
-- iş, hukuken tutulması gereken kaydı silen iş olabilir.
-- -----------------------------------------------------------------------------
create or replace function private.ensure_audit_partitions(_months int default 3)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month  date := date_trunc('month', (now() at time zone 'utc'))::date;
  v_from   date;
  v_to     date;
  v_name   text;
  v_made   int := 0;
begin
  if _months < 0 or _months > 60 then
    raise exception 'ensure_audit_partitions: _months 0 ile 60 arasında olmalı (verilen: %)', _months;
  end if;

  for i in 0.._months loop
    v_from := (v_month + (i || ' months')::interval)::date;
    v_to   := (v_from  + interval '1 month')::date;
    v_name := 'audit_logs_' || to_char(v_from, 'YYYY_MM');

    continue when to_regclass('public.' || quote_ident(v_name)) is not null;

    execute format(
      'create table public.%I partition of public.audit_logs for values from (%L) to (%L)',
      v_name,
      to_char(v_from, 'YYYY-MM-DD') || ' 00:00:00+00',
      to_char(v_to,   'YYYY-MM-DD') || ' 00:00:00+00');
    execute format('alter table public.%I force row level security', v_name);

    v_made := v_made + 1;
  end loop;

  return v_made;
end;
$$;

-- Yalnızca zamanlanmış iş çağırır. `private` şemadaki fonksiyonlarda EXECUTE'u
-- genelde bırakıyoruz (politikalar çağıranın adına değerlendiriliyor,
-- CLAUDE.md), ama bu fonksiyon hiçbir politikadan çağrılmıyor ve DDL
-- çalıştırıyor: burada geri almanın bedeli yok.
revoke execute on function private.ensure_audit_partitions(int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ölü slot tutmalarının süpürülmesi
--
-- Kaynak bazlı süpürme (private.sweep_expired_holds) yazma yolunda çalışıyor
-- ve görünür hatayı zaten engelliyor. Kalan sorun sessiz: kimsenin randevu
-- yazmadığı bir kaynakta ölü tutma satır olarak kalıyor, `appointments`
-- büyüyor ve çakışma kısıtı olmayan bir randevuyu hesaba katmayı sürdürüyor.
--
-- Tutmada hasta verisi yok (ad ve telefon onay adımında yazılır), bekleyen
-- bildirim de yok — kuyruğa yazan fonksiyon `hold_expires_at is not null`
-- satırında duruyor (80_notifications). Yani silinen şey randevu değil, hiç
-- tamamlanmamış bir form.
-- -----------------------------------------------------------------------------
create or replace function private.sweep_all_expired_holds()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from public.appointments
   where status = 'pending'
     and hold_expires_at is not null
     and hold_expires_at < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function private.sweep_all_expired_holds() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- pg_cron çalıştırma geçmişinin budanması
--
-- Bir haftalık geçmiş, "iş çalışıyor mu, ne zaman hata verdi" sorusuna cevap
-- vermeye yeter. Daha uzunu tanı değeri katmadan tablo büyütür.
-- -----------------------------------------------------------------------------
create or replace function private.prune_cron_history(_days int default 7)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from cron.job_run_details
   where end_time < now() - make_interval(days => _days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function private.prune_cron_history(int) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- İşler
--
-- `cron.schedule` ada göre çalışır: aynı adla yeniden çağrılması işi günceller,
-- ikinci bir kopya oluşturmaz. Bu dosya böylece tekrar uygulanabilir kalır.
--
-- Saatler UTC. 03:00 UTC = Türkiye'de 06:00; ayın ilk gününde klinik kapalı
-- olsun diye değil, `create table ... partition of` ana tabloda kısa süreli
-- ACCESS EXCLUSIVE kilit aldığı için sakin saat seçildi.
-- -----------------------------------------------------------------------------

-- Her ayın 1'inde: bulunan ay + 3 ay ileri.
select cron.schedule('audit-partitions', '0 3 1 * *',
  $job$ select private.ensure_audit_partitions(3); $job$);

-- Dakikada bir: süresi dolmuş tutmalar. Tutma süresi kurum ayarından geliyor
-- (varsayılan birkaç dakika), o yüzden daha seyrek bir iş slot'u gereksiz yere
-- dolu tutardı.
select cron.schedule('hold-sweep', '* * * * *',
  $job$ select private.sweep_all_expired_holds(); $job$);

-- Her gece: bir haftadan eski çalıştırma kaydı.
select cron.schedule('cron-history', '10 3 * * *',
  $job$ select private.prune_cron_history(7); $job$);
