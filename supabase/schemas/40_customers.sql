-- =============================================================================
-- 40_customers — müşteri / hasta, esnek alanlar, tıbbi notlar, rıza kayıtları
-- =============================================================================

create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  -- kayıtlı olduğu şube; 'branch' kapsamlı yetkiler buna göre çözülür
  branch_id   uuid references public.branches (id) on delete set null,
  full_name   text not null check (length(btrim(full_name)) between 2 and 160),
  phone       public.phone_e164,
  email       public.email_address,
  birth_date  date check (birth_date is null or birth_date > '1900-01-01'),
  notes       text,                                   -- idari not (tıbbi DEĞİL)
  tags        text[] not null default '{}'::text[],
  -- sektör şablonundan gelen esnek alanlar: TCKN, kan grubu, alerji...
  custom_data jsonb not null default '{}'::jsonb,
  source      text,                                   -- 'panel' | 'online' | 'import'
  -- gelmeme sayacı: kapora isteme / çift rezervasyon kararlarına girdi
  no_show_count int not null default 0 check (no_show_count >= 0),
  is_active   boolean not null default true,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customers_tenant_idx on public.customers (tenant_id);
create index customers_branch_idx on public.customers (branch_id);
create index customers_phone_idx  on public.customers (tenant_id, phone) where phone is not null;

-- Ad ile arama. Türkçe için 'simple' sözlük yeterli; kök bulma yapmıyoruz,
-- isimlerde zaten istemiyoruz.
create index customers_name_search_idx on public.customers
  using gin (to_tsvector('simple', full_name));

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tıbbi notlar AYRI TABLODA.
-- Sebep: Postgres RLS satır seviyesindedir, sütun seviyesinde değil.
-- Resepsiyonun randevuyu görüp tedavi notunu görmemesi ancak notu ayrı bir
-- tabloya alıp ona ayrı politika yazarak sağlanır (Bölüm 8.2).
-- -----------------------------------------------------------------------------
create table public.customer_medical_notes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  customer_id uuid not null references public.customers (id) on delete cascade,
  -- notu hangi kaynağın (hekimin) yazdığı; 'own' kapsamı buna göre çözülür
  resource_id uuid references public.resources (id) on delete set null,
  branch_id   uuid references public.branches (id) on delete set null,
  body        text not null,
  custom_data jsonb not null default '{}'::jsonb,
  author_id   uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index customer_medical_notes_customer_idx on public.customer_medical_notes (customer_id);
create index customer_medical_notes_tenant_idx   on public.customer_medical_notes (tenant_id);
create index customer_medical_notes_resource_idx on public.customer_medical_notes (resource_id);

create trigger customer_medical_notes_set_updated_at
  before update on public.customer_medical_notes
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Esnek alan tanımları — sektör şablonundan kopyalanır, kurum düzenleyebilir
-- -----------------------------------------------------------------------------
create type public.field_entity as enum ('customer', 'appointment');
create type public.field_kind as enum
  ('text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean', 'phone');

create table public.field_definitions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  entity     public.field_entity not null,
  key        text not null check (key ~ '^[a-z][a-z0-9_]{0,40}$'),
  label      text not null,
  kind       public.field_kind not null default 'text',
  is_required boolean not null default false,
  -- select/multiselect için: [{"value":"a","label":"A"}]
  options    jsonb not null default '[]'::jsonb,
  -- tıbbi kabul edilen alanlar ayrı izne tabidir
  is_medical boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, entity, key)
);

create index field_definitions_tenant_idx on public.field_definitions (tenant_id, entity);

-- -----------------------------------------------------------------------------
-- Rıza kayıtları — KVKK. Metnin SÜRÜMÜ saklanır: metin değişince eski rızaların
-- hangi metne verildiği bilinmek zorunda (Bölüm 12.4).
-- -----------------------------------------------------------------------------
create type public.consent_kind as enum
  ('kvkk_aydinlatma', 'acik_riza_saglik', 'ticari_ileti', 'cerez');

create table public.consents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete cascade,
  kind         public.consent_kind not null,
  text_version text not null,
  granted      boolean not null,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  ip           inet,
  user_agent   text,
  channel      text                       -- 'online_booking' | 'panel' | 'sms_reply'
);

create index consents_customer_idx on public.consents (customer_id, kind);
create index consents_tenant_idx   on public.consents (tenant_id);
