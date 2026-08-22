-- =============================================================================
-- 00_foundation — uzantılar, gizli şema, ortak yardımcılar
-- =============================================================================
-- Declarative schema. Bu dosyalar şemanın TEK kaynağıdır; migration'lar
-- `supabase db diff` ile bunlardan üretilir, elle yazılmaz.

create extension if not exists btree_gist with schema extensions;

-- Yetki ve yardımcı fonksiyonlar burada durur. `public` şemada DEĞİL:
-- Postgres her yeni fonksiyona EXECUTE'u PUBLIC'e verir, `public` şemadaki bir
-- `security definer` fonksiyon herkese açık bir API uç noktasına dönüşür.
create schema if not exists private;

revoke all on schema private from public, anon;
-- authenticated'a USAGE zorunlu: RLS politikaları bu şemadaki fonksiyonları
-- çağırır ve politika ifadeleri SORGUYU ATAN KULLANICI adına değerlendirilir,
-- politikanın sahibi adına değil. USAGE olmadan her politika "permission
-- denied" ile patlar. Güvenlik şemayı gizlemekten değil, PostgREST'in yalnızca
-- `public` şemasını dışa açmasından geliyor (config.toml → api.schemas).
grant usage on schema private to postgres, service_role, authenticated;

-- -----------------------------------------------------------------------------
-- updated_at otomatiği
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ortak alan tanımları için yardımcı domainler
-- -----------------------------------------------------------------------------

-- E.164 telefon: +905551234567
create domain public.phone_e164 as text
  check (value is null or value ~ '^\+[1-9][0-9]{7,14}$');

create domain public.email_address as text
  check (value is null or value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
