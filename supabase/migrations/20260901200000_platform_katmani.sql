-- =============================================================================
-- Platform katmanı: demo talepleri ve platform yöneticisi
-- =============================================================================
-- Declarative kaynak: supabase/schemas/85_platform.sql ve 90_rls.sql (sondaki
-- iki politika bloğu). Docker olmadan `db diff` çalışmadığı için migration
-- elle yazılıyor (D2).
--
-- Pazarlama sitesindeki demo formunun yazdığı tablo. Kiracıya ait DEĞİL:
-- satış verisi, ve o veride veri sorumlusu TeyitRandevu'dur.

-- =============================================================================
-- 85_platform — platformun kendi verisi: demo talepleri ve platform yöneticisi
-- =============================================================================
-- Buradaki iki tablo, şimdiye kadarki her tablodan FARKLI bir şeye ait: bir
-- kuruma değil, TeyitRandevu'nun kendisine.
--
-- Bu ayrım hukuki olarak da geçerli. Hasta verisinde kurum veri sorumlusu,
-- TeyitRandevu veri işleyendir (Plan 11.1). Pazarlama sitesindeki demo
-- talebinde roller yer değiştirir: talebi bırakan kişinin verisinde **veri
-- sorumlusu TeyitRandevu'dur.** Bu yüzden rıza kaydı `consents` tablosuna
-- yazılmaz — o tablo kiracıya bağlıdır (`tenant_id not null`) ve oradaki her
-- satır bir kurumun sorumluluğundadır. Talebin kendi onayı kendi satırında
-- durur.
--
-- NEDEN KİRACI PANELİNE KOYULMUYOR: demo talepleri satış verisidir. Kiracı
-- ekranında gösterilseydi, her klinik sahibi diğer kliniklerin talebini
-- görürdü. `private.allows()` bu soruyu cevaplayamaz çünkü sorunun içinde
-- kurum yok.

-- -----------------------------------------------------------------------------
-- Platform yöneticisi
--
-- Kiracı rol sisteminden tamamen ayrı ve bilerek ilkel: satırı olan
-- yöneticidir, yoksa değildir. Rol, kapsam, izin katalogu yok — platform
-- tarafında yetkilendirilecek ikinci bir kişi çıkana kadar hepsi erken
-- soyutlama olurdu.
--
-- Satır YALNIZCA servis rolüyle eklenir: kendini yönetici yapabilen bir
-- politika, yetkinin kendisini anlamsız kılardı.
-- -----------------------------------------------------------------------------
create table public.platform_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  label      text,
  created_at timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins p
     where p.user_id = (select auth.uid())
  );
$$;

-- `authenticated` çağırabilmeli: politika ifadeleri sorguyu atan kullanıcı
-- adına değerlendirilir (CLAUDE.md, canlıda öğrenilen kural 1).
revoke execute on function private.is_platform_admin() from public, anon;
grant execute on function private.is_platform_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Demo talepleri
--
-- Pazarlama sitesindeki formun tek çıktısı. Yazma yolu `submit_demo_request`
-- fonksiyonu; `anon` rolünün bu tabloda hiçbir yetkisi yok (Kural 8).
--
-- Rıza alanları satırın içinde: ticari ileti onayı 6563'e tabidir ve
-- "demo istiyorum" demek, kampanya maili almayı kabul etmek DEĞİLDİR. İkisi
-- ayrı kutu, ayrı sütun. Onay yoksa bu kişiye yalnızca talebinin cevabı
-- yazılabilir — o hizmet bilgilendirmesidir.
-- -----------------------------------------------------------------------------
create type public.demo_request_status as enum (
  'new',        -- kuyrukta
  'contacted',  -- dönüş yapıldı
  'qualified',  -- pilot adayı
  'closed'      -- kapandı (oldu ya da olmadı)
);

create table public.demo_requests (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  org_name       text,
  email          text not null,
  phone          text,
  business_type  text,                       -- 'dis_klinigi' | 'diger' — serbest
  message        text,
  status         public.demo_request_status not null default 'new',
  -- Aydınlatma her zaman gösterilir; sürümü kayda geçer.
  notice_version text not null,
  -- Ticari ileti onayı İSTEĞE BAĞLI: yokluğu talebi engellemez.
  marketing_ok   boolean not null default false,
  ip             inet,
  user_agent     text,
  source         text,                       -- hangi sayfadan geldiği
  internal_note  text,                       -- satış notu; ziyaretçi görmez
  created_at     timestamptz not null default now(),
  handled_at     timestamptz
);

create index demo_requests_new_idx on public.demo_requests (created_at desc)
  where status = 'new';
create index demo_requests_created_idx on public.demo_requests (created_at desc);

-- -----------------------------------------------------------------------------
-- Formun tek kapısı.
--
-- Doğrulama burada da yapılır: tarayıcıdaki `required` bir kolaylık, kapı
-- değil. Beklenen retler hata değil `{"ok": false, "reason": ...}` döner —
-- 70_public_booking ile aynı sözleşme.
--
-- Hız sınırı aynı adresten günde 5 talep. Tablo ya da Redis istemeyen tek
-- sorguluk fren; formun asıl maliyeti (satış kuyruğunun çöple dolması) bu
-- eşikle sınırlı kalır.
-- -----------------------------------------------------------------------------
create or replace function public.submit_demo_request(
  _full_name      text,
  _email          text,
  _notice_version text,
  _org_name       text default null,
  _phone          text default null,
  _business_type  text default null,
  _message        text default null,
  _marketing_ok   boolean default false,
  _source         text default null,
  _ip             inet default null,
  _user_agent     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := nullif(btrim(coalesce(_full_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(_email, '')), ''));
  v_id    uuid;
begin
  if v_name is null or length(v_name) < 2 or length(v_name) > 160 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  -- Kasıtlı olarak gevşek: e-posta doğrulamasının tek gerçek yolu mesaj
  -- göndermektir. Buradaki kontrol yalnızca yazım hatasını yakalar.
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  if length(coalesce(_message, '')) > 4000 then
    return jsonb_build_object('ok', false, 'reason', 'message_too_long');
  end if;

  if _notice_version is null or length(btrim(_notice_version)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'missing_notice');
  end if;

  if _ip is not null and (
    select count(*) from public.demo_requests d
     where d.ip = _ip and d.created_at > now() - interval '1 day'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.demo_requests (
    full_name, org_name, email, phone, business_type, message,
    notice_version, marketing_ok, ip, user_agent, source
  )
  values (
    v_name,
    nullif(btrim(coalesce(_org_name, '')), ''),
    v_email,
    nullif(btrim(coalesce(_phone, '')), ''),
    nullif(btrim(coalesce(_business_type, '')), ''),
    nullif(btrim(coalesce(_message, '')), ''),
    btrim(_notice_version),
    coalesce(_marketing_ok, false),
    _ip,
    left(coalesce(_user_agent, ''), 400),
    nullif(btrim(coalesce(_source, '')), '')
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke execute on function public.submit_demo_request(
  text, text, text, text, text, text, text, boolean, text, inet, text
) from public;
grant execute on function public.submit_demo_request(
  text, text, text, text, text, text, text, boolean, text, inet, text
) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- platform_admins — kim platform yöneticisi
--
-- Kendi satırını okuyabilir, kimse yazamaz. Yönetici eklemek servis rolüyle
-- yapılır (scripts/platform-admin.mjs): kendini yönetici yapabilen bir
-- politika, yetkiyi anlamsız kılardı.
-- -----------------------------------------------------------------------------
alter table public.platform_admins enable row level security;
alter table public.platform_admins force row level security;
grant select on public.platform_admins to authenticated;

create policy platform_admins_read on public.platform_admins
  for select to authenticated
  using ( (select auth.uid()) = user_id );

-- -----------------------------------------------------------------------------
-- demo_requests — platformun satış kuyruğu, hiçbir kuruma ait değil
--
-- INSERT politikası YOK: yazma yolu `public.submit_demo_request`. Formu
-- dolduran kişi `anon`dur ve anon'un bu tabloda yetkisi yoktur (Kural 8).
--
-- Okuma ve durum güncelleme yalnız platform yöneticisinde. `private.allows()`
-- burada kullanılamaz: o fonksiyon "hangi kurumda" sorusunu sorar, bu satırın
-- kurumu yoktur.
-- -----------------------------------------------------------------------------
alter table public.demo_requests enable row level security;
alter table public.demo_requests force row level security;
grant select, update on public.demo_requests to authenticated;

create policy demo_requests_read on public.demo_requests
  for select to authenticated
  using ( (select private.is_platform_admin()) );

create policy demo_requests_update on public.demo_requests
  for update to authenticated
  using      ( (select private.is_platform_admin()) )
  with check ( (select private.is_platform_admin()) );
