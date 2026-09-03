-- =============================================================================
-- Kurum görselleri: logo kovası ve politikaları
-- =============================================================================
-- Declarative kaynak: supabase/schemas/96_storage.sql. Docker olmadan
-- `db diff` çalışmadığı için migration elle yazılıyor (D2).
--
-- Hastanın gördüğü randevu sayfası bugüne kadar her kurumda birbirinin aynısıydı:
-- `tenant_settings.branding` okunuyordu ama yüklenecek bir yer yoktu
-- (CANLIYA-GECIS E tablosundaki "Storage kovası da yok" satırı).
--
-- Kova PUBLIC. Logo zaten herkese açık bir sayfada çiziliyor; imzalı URL
-- üretmek her istek için ek bir tur ve sıfır güvenlik demekti. Buraya gizli
-- hiçbir şey konmuyor — belge ve dosya yüklemesi ayrı bir iş ve ayrı bir kova
-- olacak (E tablosu).
--
-- Yol düzeni: `<tenant_id>/<dosya>`. Yazma politikası yolun İLK parçasına
-- bakıyor, yani bir kurumun üyesi yalnızca kendi klasörüne yazabiliyor.
--
-- SVG bilerek kabul edilmiyor: içinde script taşıyabilir ve aynı origin'den
-- servis edilen bir SVG XSS yüzeyidir. PNG, JPEG ve WebP yeter.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kurum-gorsel',
  'kurum-gorsel',
  true,
  524288, -- 512 KB; logo için fazlasıyla yeterli, yavaş bağlantıyı da korur
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Politikalar
--
-- Okuma herkese açık: sayfayı gören hasta oturum açmış değil.
-- Yazma `settings.manage` iznine bağlı — kurumun logosunu değiştirmek bir
-- ayar işlemidir, randevu işlemi değil.
--
-- Yol parçası önce desene sokuluyor: `::uuid` cast'i bozuk bir yolda hata
-- fırlatır ve politikanın patlaması isteğin 500 dönmesi demektir.
-- -----------------------------------------------------------------------------

drop policy if exists kurum_gorsel_read on storage.objects;
create policy kurum_gorsel_read on storage.objects
  for select to anon, authenticated
  using ( bucket_id = 'kurum-gorsel' );

drop policy if exists kurum_gorsel_insert on storage.objects;
create policy kurum_gorsel_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'kurum-gorsel'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.allows('settings.manage', ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists kurum_gorsel_update on storage.objects;
create policy kurum_gorsel_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'kurum-gorsel'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.allows('settings.manage', ((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'kurum-gorsel'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.allows('settings.manage', ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists kurum_gorsel_delete on storage.objects;
create policy kurum_gorsel_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'kurum-gorsel'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.allows('settings.manage', ((storage.foldername(name))[1])::uuid)
  );
