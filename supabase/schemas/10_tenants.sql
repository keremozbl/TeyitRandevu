-- =============================================================================
-- 10_tenants — kiracı (işletme) ve ayarları
-- =============================================================================

create type public.business_family as enum ('saglik', 'kisisel_bakim', 'hizmet');

create type public.tenant_status as enum ('trial', 'active', 'suspended', 'cancelled');

create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) between 2 and 120),
  -- public randevu sayfasının adresi: teyitrandevu.com/r/<slug>
  slug          text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  family        public.business_family not null,
  -- aile içindeki şablon anahtarı: 'dis_klinigi', 'berber', ...
  business_type text not null,
  -- IANA timezone. Randevular UTC saklanır, gösterim bu zaman diliminde yapılır.
  timezone      text not null default 'Europe/Istanbul',
  locale        text not null default 'tr-TR',
  currency      char(3) not null default 'TRY',
  status        public.tenant_status not null default 'trial',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Ayarlar: terminoloji (hasta/müşteri), rezervasyon kuralları, marka
-- Tenant ile 1-1; ayrı tablo çünkü sık değişir ve tenants satırını şişirmesin.
-- -----------------------------------------------------------------------------
create table public.tenant_settings (
  tenant_id     uuid primary key references public.tenants (id) on delete cascade,
  terminology   jsonb not null default '{}'::jsonb,
  booking_rules jsonb not null default jsonb_build_object(
                  'min_lead_minutes', 120,      -- en erken kaç dk sonrasına randevu
                  'max_advance_days', 60,       -- en fazla kaç gün ilerisi
                  'cancel_window_minutes', 240, -- kaç dk kala müşteri iptal edemez
                  'hold_minutes', 10            -- public sayfada slot tutma süresi
                ),
  branding      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create trigger tenant_settings_set_updated_at
  before update on public.tenant_settings
  for each row execute function private.set_updated_at();
