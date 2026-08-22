-- İlk migration — supabase/schemas/*.sql dosyalarından sırayla üretildi.
-- ŞEMANIN KAYNAĞI supabase/schemas/ — bu dosya türetilmiş çıktıdır.


-- ###########################################################################
-- schemas/00_foundation.sql
-- ###########################################################################

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

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

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


-- ###########################################################################
-- schemas/10_tenants.sql
-- ###########################################################################

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


-- ###########################################################################
-- schemas/20_rbac.sql
-- ###########################################################################

-- =============================================================================
-- 20_rbac — izinler, rol şablonları, roller
-- =============================================================================
-- Tasarım: izinler KODDA sabit (bu tablo bir katalog), roller TENANT'IN VERİSİ.
-- Kurum sistem rolünü kopyalayıp kendine göre düzenleyebilir.
-- Kapsam (scope) izinden ayrı bir eksendir: "appointment.read" tek başına
-- anlamsızdır — kendi randevuları mı, şubesindeki mi, kurumun tamamı mı?

create type public.permission_scope as enum ('own', 'branch', 'tenant');

-- -----------------------------------------------------------------------------
-- İzin kataloğu — global, tenant'a ait değil. Sadece okunur.
-- -----------------------------------------------------------------------------
create table public.permissions (
  key        text primary key check (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  category   text not null,
  label      text not null,
  -- bu izin hangi kapsamlarla anlamlı? ör. settings.manage sadece 'tenant'
  scopes     public.permission_scope[] not null default array['tenant']::public.permission_scope[],
  sort_order int not null default 0
);

-- -----------------------------------------------------------------------------
-- Rol şablonları — global. Onboarding bunları tenant'ın kendi rollerine KOPYALAR.
-- Şablon sonradan değişirse mevcut kurumlar etkilenmez (Bölüm 4 ilkesi).
-- -----------------------------------------------------------------------------
create table public.role_templates (
  key         text primary key,
  label       text not null,
  description text,
  -- hangi işletme ailelerinde bu rol sunulur; boş = hepsi
  families    public.business_family[] not null default '{}'::public.business_family[],
  sort_order  int not null default 0
);

create table public.role_template_permissions (
  role_template_key text not null references public.role_templates (key) on delete cascade,
  permission_key    text not null references public.permissions (key) on delete cascade,
  scope             public.permission_scope not null,
  primary key (role_template_key, permission_key)
);

create index role_template_permissions_permission_idx
  on public.role_template_permissions (permission_key);

-- -----------------------------------------------------------------------------
-- Tenant'ın kendi rolleri
-- -----------------------------------------------------------------------------
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  key          text not null check (key ~ '^[a-z_]{2,40}$'),
  label        text not null,
  -- şablondan gelen roller: silinemez, adı değişebilir, izinleri düzenlenebilir
  is_system    boolean not null default false,
  -- owner rolü hiçbir koşulda kısıtlanamaz; arayüz bunu düzenlemeye kapatır
  is_protected boolean not null default false,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, key)
);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  scope          public.permission_scope not null,
  primary key (role_id, permission_key)
);

create index role_permissions_permission_idx on public.role_permissions (permission_key);


-- ###########################################################################
-- schemas/30_org.sql
-- ###########################################################################

-- =============================================================================
-- 30_org — şube, bölüm, kaynak, hizmet, çalışma saatleri, üyelik
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Şube — tek şubeli klinikte de vardır, sadece arayüzde görünmez.
-- "Özellik var, görünmüyor" ilkesi (Bölüm 8.1).
-- -----------------------------------------------------------------------------
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  address    text,
  phone      public.phone_e164,
  -- şube kendi zaman diliminde olabilir; boşsa tenant'ınki geçerli
  timezone   text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index branches_tenant_idx on public.branches (tenant_id);

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Bölüm / branş — poliklinik için. Tek klinikte boş kalır.
-- Şimdi eklemek bedava; sonradan tablo eklemek pahalı.
-- -----------------------------------------------------------------------------
create table public.departments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index departments_tenant_idx on public.departments (tenant_id);

-- -----------------------------------------------------------------------------
-- Kaynak — randevunun üzerine düştüğü şey: hekim, koltuk/ünit, oda, cihaz.
-- Diş kliniğinde hem hekim hem ünit kaynaktır ve ikisi birden gerekir.
-- -----------------------------------------------------------------------------
create type public.resource_kind as enum ('staff', 'room', 'device');

create table public.resources (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  branch_id     uuid not null references public.branches (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  kind          public.resource_kind not null default 'staff',
  -- personel kaynağı bir kullanıcıya bağlıysa o kullanıcı kendi takvimini görür
  user_id       uuid references auth.users (id) on delete set null,
  name          text not null check (length(btrim(name)) between 1 and 120),
  title         text,                       -- "Dt.", "Uzm. Dr.", "Usta"
  color         text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  is_bookable   boolean not null default true,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index resources_tenant_idx     on public.resources (tenant_id);
create index resources_branch_idx     on public.resources (branch_id);
create index resources_department_idx on public.resources (department_id);
create index resources_user_idx       on public.resources (user_id) where user_id is not null;

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Üyelik — kullanıcının bir kuruma bağlanması ve yetki kapsamı
-- -----------------------------------------------------------------------------
create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  role_id      uuid not null references public.roles (id) on delete restrict,
  -- 'branch' kapsamlı izinler bu listeyle sınırlanır; boş = tüm şubeler
  branch_ids   uuid[] not null default '{}'::uuid[],
  -- kullanıcı bir hekimse kendi kaynağı; 'own' kapsamı buna göre çözülür
  resource_id  uuid references public.resources (id) on delete set null,
  -- asistan bağımsız çalışmaz: bağlı olduğu hekimlerin kapsamında görür
  assistant_of uuid[] not null default '{}'::uuid[],
  is_active    boolean not null default true,
  invited_at   timestamptz,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, tenant_id)
);

-- RLS politikalarındaki en sıcak yol: (user_id, tenant_id) araması
create index memberships_user_tenant_idx on public.memberships (user_id, tenant_id)
  where is_active;
create index memberships_tenant_idx      on public.memberships (tenant_id);
create index memberships_role_idx        on public.memberships (role_id);
create index memberships_resource_idx    on public.memberships (resource_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Hizmet / tedavi
-- -----------------------------------------------------------------------------
create table public.services (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references public.tenants (id) on delete cascade,
  name               text not null check (length(btrim(name)) between 1 and 160),
  category           text,
  duration_min       int not null check (duration_min between 5 and 1440),
  -- randevu öncesi/sonrası bloke süre: hazırlık, temizlik, sterilizasyon
  buffer_before_min  int not null default 0 check (buffer_before_min between 0 and 240),
  buffer_after_min   int not null default 0 check (buffer_after_min between 0 and 240),
  price              numeric(12,2) check (price is null or price >= 0),
  vat_rate           numeric(5,2) not null default 20 check (vat_rate between 0 and 100),
  is_online_bookable boolean not null default true,
  is_active          boolean not null default true,
  color              text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  custom_data        jsonb not null default '{}'::jsonb,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index services_tenant_idx on public.services (tenant_id);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function private.set_updated_at();

-- Hangi hizmeti hangi kaynak verebilir
-- tenant_id burada bilinçli bir denormalizasyon: RLS politikasının services
-- tablosuna join atmasını engeller, politika satır başına ucuz kalır.
create table public.service_resources (
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  service_id  uuid not null references public.services (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  primary key (service_id, resource_id)
);

create index service_resources_resource_idx on public.service_resources (resource_id);
create index service_resources_tenant_idx   on public.service_resources (tenant_id);

-- -----------------------------------------------------------------------------
-- Çalışma saatleri — haftalık şablon. 0 = pazar (Postgres dow ile uyumlu).
-- Uygunluk hesaplanır, slot tablosu TUTULMAZ (Bölüm 6a).
-- -----------------------------------------------------------------------------
create table public.working_hours (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  starts_at   time not null,
  ends_at     time not null,
  constraint working_hours_order check (ends_at > starts_at)
);

create index working_hours_resource_idx on public.working_hours (resource_id, weekday);
create index working_hours_tenant_idx   on public.working_hours (tenant_id);

-- -----------------------------------------------------------------------------
-- İzin / kapalı zaman — tatil, kongre, mola, arıza
-- -----------------------------------------------------------------------------
create table public.time_off (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint time_off_order check (ends_at > starts_at)
);

create index time_off_resource_range_idx on public.time_off (resource_id, starts_at, ends_at);
create index time_off_tenant_idx         on public.time_off (tenant_id);


-- ###########################################################################
-- schemas/35_access.sql
-- ###########################################################################

-- =============================================================================
-- 35_access — yetki çözümleme fonksiyonları
-- =============================================================================
-- Performans notu (kritik): bu fonksiyonlar YALNIZCA auth.uid() ve izin
-- anahtarına bağlıdır, satır değerlerine değil. Bu yüzden planlayıcı onları
-- sorgu başına bir kez hesaplayabilir. Satır değeri alan bir yetki fonksiyonu
-- her satır için yeniden çalışır ve büyük takvimlerde sorguyu kilitler.
--
-- Güvenlik notu: hepsi `security definer` — memberships/role_permissions
-- tablolarını RLS'e takılmadan okumaları gerekir. Bu yüzden her biri kendi
-- içinde `auth.uid()` kontrolü yapar ve `private` şemada durur; EXECUTE
-- yetkisi public rollerden geri alınır.

-- -----------------------------------------------------------------------------
-- Üyelik — tenant izolasyonunun temel kontrolü
-- -----------------------------------------------------------------------------
create or replace function private.member_tenants()
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(m.tenant_id), '{}'::uuid[])
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.is_active;
$$;

create or replace function private.is_tenant_member(_tenant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid())
      and m.tenant_id = _tenant_id
      and m.is_active
  );
$$;

-- -----------------------------------------------------------------------------
-- Kapsam çözümleme
-- -----------------------------------------------------------------------------

-- Kullanıcının bu izne 'tenant' kapsamında sahip olduğu kurumlar
create or replace function private.tenants_with(_perm text)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.tenant_id), '{}'::uuid[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and rp.permission_key = _perm
    and rp.scope = 'tenant';
$$;

-- 'branch' kapsamındaki şubeler.
-- membership.branch_ids boşsa "kurumdaki tüm şubeler" demektir — zincire yeni
-- şube eklendiğinde herkesin yetkisini tek tek güncellemek zorunda kalmayalım.
create or replace function private.branches_with(_perm text)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct b.id), '{}'::uuid[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  join public.branches b on b.tenant_id = m.tenant_id
  where m.user_id = (select auth.uid())
    and m.is_active
    and rp.permission_key = _perm
    and rp.scope = 'branch'
    and (cardinality(m.branch_ids) = 0 or b.id = any (m.branch_ids));
$$;

-- 'own' kapsamındaki kaynaklar: kullanıcının kendi kaynağı + asistanı olduğu
-- hekimlerin kaynakları.
create or replace function private.resources_with(_perm text)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct r), '{}'::uuid[])
  from public.memberships m
  join public.role_permissions rp on rp.role_id = m.role_id
  cross join lateral unnest(
    array_remove(m.assistant_of || array[m.resource_id], null)
  ) as r
  where m.user_id = (select auth.uid())
    and m.is_active
    and rp.permission_key = _perm
    and rp.scope = 'own';
$$;

-- -----------------------------------------------------------------------------
-- Tek çağrıda okuma kontrolü.
-- Politikalarda kullanım:
--   using ( private.allows('appointment.read', tenant_id, branch_id, resource_id) )
-- Bu fonksiyon `security definer` DEĞİL ve tek SELECT'ten oluşuyor; Postgres
-- onu çağıran sorguya satır içi açar (inline). Açıldıktan sonra içindeki alt
-- sorgular satırdan bağımsız kalır ve planlayıcı bunları sorgu başına bir kez
-- hesaplar.
-- -----------------------------------------------------------------------------
create or replace function private.allows(
  _perm     text,
  _tenant   uuid,
  _branch   uuid default null,
  _resource uuid default null
)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- `= any ((select f()))` YAZILAMAZ: Postgres bunu ANY(alt sorgu) olarak
  -- ayrıştırır ve satırlar uuid[] olduğu için `uuid = uuid[]` hatası verir.
  -- `unnest` ile satırlara açmak hem tip olarak doğru hem de uncorrelated
  -- alt sorgu olduğu için planlayıcı tarafından bir kez hesaplanır.
  select _tenant   = any (select unnest(private.tenants_with(_perm)))
      or _branch   = any (select unnest(private.branches_with(_perm)))
      or _resource = any (select unnest(private.resources_with(_perm)));
$$;

-- -----------------------------------------------------------------------------
-- EXECUTE yetkilerini kapat. Bu fonksiyonlar yalnızca politikaların içinden
-- çağrılır; kimse doğrudan çağırıp yetki haritasını dışarı sızdıramaz.
-- (Politika içinden çağrı, politikanın sahibi adına çalıştığı için etkilenmez.)
-- -----------------------------------------------------------------------------
revoke execute on function private.member_tenants()          from public, anon, authenticated;
revoke execute on function private.is_tenant_member(uuid)     from public, anon, authenticated;
revoke execute on function private.tenants_with(text)         from public, anon, authenticated;
revoke execute on function private.branches_with(text)        from public, anon, authenticated;
revoke execute on function private.resources_with(text)       from public, anon, authenticated;
revoke execute on function private.allows(text, uuid, uuid, uuid) from public, anon, authenticated;


-- ###########################################################################
-- schemas/40_customers.sql
-- ###########################################################################

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


-- ###########################################################################
-- schemas/50_appointments.sql
-- ###########################################################################

-- =============================================================================
-- 50_appointments — randevu motoru
-- =============================================================================

create type public.appointment_status as enum (
  'pending',    -- onay bekliyor / public sayfada tutuluyor (hold)
  'confirmed',
  'arrived',
  'completed',
  'no_show',
  'cancelled'
);

create table public.appointments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  branch_id     uuid not null references public.branches (id) on delete cascade,
  resource_id   uuid not null references public.resources (id) on delete restrict,
  customer_id   uuid references public.customers (id) on delete set null,
  service_id    uuid references public.services (id) on delete set null,

  starts_at     timestamptz not null,
  ends_at       timestamptz not null,

  -- Tampon süreler randevu oluşturulurken hizmetten KOPYALANIR.
  -- Hizmetin süresi sonradan değişirse geçmiş randevular kaymaz.
  buffer_before_min int not null default 0 check (buffer_before_min between 0 and 240),
  buffer_after_min  int not null default 0 check (buffer_after_min between 0 and 240),

  -- Tamponlar dahil gerçekten meşgul olan aralık. Trigger doldurur; çakışma
  -- kısıtı bunun üzerinde çalışır. Generated column kullanılamıyor çünkü
  -- timestamptz + interval aritmetiği IMMUTABLE değil.
  blocked_from  timestamptz not null,
  blocked_to    timestamptz not null,

  status        public.appointment_status not null default 'pending',
  price         numeric(12,2) check (price is null or price >= 0),
  notes         text,
  custom_data   jsonb not null default '{}'::jsonb,

  -- public sayfada slot tutma: süresi dolan pending kayıtları pg_cron siler
  hold_expires_at   timestamptz,

  cancelled_at      timestamptz,
  cancelled_reason  text,
  cancelled_by      uuid references auth.users (id) on delete set null,
  no_show_at        timestamptz,

  source        text not null default 'panel',   -- 'panel' | 'online' | 'import'
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint appointments_time_order check (ends_at > starts_at),
  constraint appointments_blocked_order check (blocked_to > blocked_from)
);

-- -----------------------------------------------------------------------------
-- ÇAKIŞMA ENGELİ — planın en kritik satırı (Bölüm 6b).
-- Uygulama katmanında "önce kontrol et sonra yaz" iki eşzamanlı istekte çift
-- rezervasyon üretir. Bu kısıt onu veritabanı seviyesinde imkânsız kılar.
-- İptal ve gelmedi durumları yer kaplamaz.
-- -----------------------------------------------------------------------------
alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(blocked_from, blocked_to, '[)') with &&
  )
  where (status not in ('cancelled', 'no_show'));

-- Takvim sorgusunun sıcak yolu: bir kaynağın belirli tarih aralığı
create index appointments_resource_time_idx
  on public.appointments (resource_id, starts_at)
  where status not in ('cancelled', 'no_show');

create index appointments_tenant_time_idx on public.appointments (tenant_id, starts_at);
create index appointments_branch_idx      on public.appointments (branch_id);
create index appointments_customer_idx    on public.appointments (customer_id);
create index appointments_service_idx     on public.appointments (service_id);

-- Süresi dolmuş hold temizliği için dar indeks
create index appointments_hold_idx on public.appointments (hold_expires_at)
  where status = 'pending' and hold_expires_at is not null;

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- blocked_from / blocked_to otomatiği
-- -----------------------------------------------------------------------------
create or replace function private.appointments_set_blocked_range()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.blocked_from := new.starts_at - make_interval(mins => new.buffer_before_min);
  new.blocked_to   := new.ends_at   + make_interval(mins => new.buffer_after_min);
  return new;
end;
$$;

create trigger appointments_blocked_range
  before insert or update of starts_at, ends_at, buffer_before_min, buffer_after_min
  on public.appointments
  for each row execute function private.appointments_set_blocked_range();

-- -----------------------------------------------------------------------------
-- Çoklu hizmet — bir randevuda birden fazla işlem
-- -----------------------------------------------------------------------------
create table public.appointment_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  service_id     uuid references public.services (id) on delete set null,
  name_snapshot  text not null,              -- hizmet adı sonradan değişse de kayıt bozulmaz
  price          numeric(12,2) check (price is null or price >= 0),
  quantity       int not null default 1 check (quantity > 0)
);

create index appointment_items_appointment_idx on public.appointment_items (appointment_id);
create index appointment_items_tenant_idx      on public.appointment_items (tenant_id);

-- -----------------------------------------------------------------------------
-- Bekleme listesi — iptal olan slotun anında dolması için (Bölüm 7.7).
-- Sesli aramanın karşılığı budur: arama zaman kazandırır, bu para kazandırır.
-- -----------------------------------------------------------------------------
create table public.waitlist_entries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  branch_id    uuid not null references public.branches (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  service_id   uuid references public.services (id) on delete set null,
  resource_id  uuid references public.resources (id) on delete set null,  -- tercih; boş = fark etmez
  earliest_at  timestamptz,
  latest_at    timestamptz,
  -- hangi haftagünleri uygun; boş = hepsi
  weekdays     smallint[] not null default '{}'::smallint[],
  is_active    boolean not null default true,
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index waitlist_active_idx on public.waitlist_entries (tenant_id, service_id)
  where is_active;
create index waitlist_customer_idx on public.waitlist_entries (customer_id);
create index waitlist_branch_idx   on public.waitlist_entries (branch_id);

-- -----------------------------------------------------------------------------
-- Denetim kaydı — kim hangi hasta kaydını açtı. KVKK için zorunlu (Bölüm 12.4).
-- Hızla büyür; ay bazlı bölümleme sonradan değil şimdi kurulur.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id         uuid not null default gen_random_uuid(),
  tenant_id  uuid not null,
  actor_id   uuid,
  action     text not null,            -- 'read' | 'create' | 'update' | 'delete' | 'export'
  entity     text not null,            -- 'customer' | 'appointment' | ...
  entity_id  uuid,
  diff       jsonb,
  ip         inet,
  at         timestamptz not null default now(),
  primary key (id, at)
) partition by range (at);

create index audit_logs_tenant_at_idx on public.audit_logs (tenant_id, at desc);
create index audit_logs_entity_idx    on public.audit_logs (entity, entity_id);

-- İlk bölümler. Yeni ayların bölümü pg_cron ile önceden açılır.
create table public.audit_logs_2026_08 partition of public.audit_logs
  for values from ('2026-08-01') to ('2026-09-01');
create table public.audit_logs_2026_09 partition of public.audit_logs
  for values from ('2026-09-01') to ('2026-10-01');
create table public.audit_logs_2026_10 partition of public.audit_logs
  for values from ('2026-10-01') to ('2026-11-01');


-- ###########################################################################
-- schemas/60_onboarding.sql
-- ###########################################################################

-- =============================================================================
-- 60_onboarding — kurum kurulumu
-- =============================================================================
-- `tenants` tablosunda INSERT politikası yok: kurum oluşturmak tek satırlık bir
-- ekleme değil, yedi tabloya yayılan atomik bir işlem. Buradan geçer.
--
-- Bu fonksiyon bilinçli olarak `public` şemadadır — RPC ile çağrılabilmesi
-- gerekiyor. `security definer` olduğu için iki koruma zorunlu:
--   1. İlk iş `auth.uid()` kontrolü (anonim çağrı reddedilir),
--   2. EXECUTE yalnızca `authenticated` rolüne verilir, PUBLIC ve anon'dan alınır.

create or replace function public.create_tenant_from_template(
  _name          text,
  _slug          text,
  _family        public.business_family,
  _business_type text,
  _timezone      text,
  _payload       jsonb          -- sektör şablonunun içeriği (src/lib/templates)
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user      uuid := (select auth.uid());
  v_tenant    uuid;
  v_branch    uuid;
  v_owner_role uuid;
  v_resource  uuid;
  v_service   uuid;
  v_item      jsonb;
  v_wh        jsonb := _payload -> 'working_hours';
  v_weekday   int;
  v_staff     uuid[] := '{}'::uuid[];
begin
  if v_user is null then
    raise exception 'Oturum açılmamış' using errcode = '28000';
  end if;

  -- Kötüye kullanım freni: bir kullanıcı sınırsız kurum açamaz.
  if (select count(*) from public.memberships m where m.user_id = v_user) >= 5 then
    raise exception 'Kurum sayısı sınırına ulaşıldı' using errcode = 'P0001';
  end if;

  -- ---------------------------------------------------------------------------
  -- Kurum ve ayarlar
  -- ---------------------------------------------------------------------------
  insert into public.tenants (name, slug, family, business_type, timezone)
  values (btrim(_name), lower(btrim(_slug)), _family, _business_type,
          coalesce(nullif(btrim(_timezone), ''), 'Europe/Istanbul'))
  returning id into v_tenant;

  insert into public.tenant_settings (tenant_id, terminology, booking_rules)
  values (
    v_tenant,
    coalesce(_payload -> 'terminology', '{}'::jsonb),
    coalesce(_payload -> 'booking_rules', '{}'::jsonb)
  );

  -- ---------------------------------------------------------------------------
  -- Roller — şablondan KOPYALANIR. Şablon sonradan değişirse bu kurum etkilenmez.
  -- ---------------------------------------------------------------------------
  insert into public.roles (tenant_id, key, label, is_system, is_protected, sort_order)
  select v_tenant, rt.key, rt.label, true, rt.key = 'owner', rt.sort_order
  from public.role_templates rt
  where cardinality(rt.families) = 0 or _family = any (rt.families);

  insert into public.role_permissions (role_id, permission_key, scope)
  select r.id, rtp.permission_key, rtp.scope
  from public.roles r
  join public.role_template_permissions rtp on rtp.role_template_key = r.key
  where r.tenant_id = v_tenant;

  select id into v_owner_role
  from public.roles where tenant_id = v_tenant and key = 'owner';

  -- Kurumu açan kişi sahiptir.
  insert into public.memberships (user_id, tenant_id, role_id, accepted_at)
  values (v_user, v_tenant, v_owner_role, now());

  -- ---------------------------------------------------------------------------
  -- Varsayılan şube — tek şubeli kurumda arayüzde hiç görünmez
  -- ---------------------------------------------------------------------------
  insert into public.branches (tenant_id, name)
  values (v_tenant, coalesce(nullif(btrim(_payload ->> 'branch_name'), ''), 'Merkez'))
  returning id into v_branch;

  -- ---------------------------------------------------------------------------
  -- Kaynaklar
  -- ---------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(_payload -> 'resources', '[]'::jsonb))
  loop
    insert into public.resources (tenant_id, branch_id, kind, name, title, color)
    values (
      v_tenant, v_branch,
      coalesce((v_item ->> 'kind')::public.resource_kind, 'staff'),
      v_item ->> 'name',
      v_item ->> 'title',
      v_item ->> 'color'
    )
    returning id into v_resource;

    if coalesce(v_item ->> 'kind', 'staff') = 'staff' then
      v_staff := v_staff || v_resource;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Hizmetler; her hizmet başlangıçta tüm personel kaynaklarına bağlanır
  -- ---------------------------------------------------------------------------
  for v_item in select * from jsonb_array_elements(coalesce(_payload -> 'services', '[]'::jsonb))
  loop
    insert into public.services (
      tenant_id, name, category, duration_min,
      buffer_before_min, buffer_after_min, price
    )
    values (
      v_tenant,
      v_item ->> 'name',
      v_item ->> 'category',
      (v_item ->> 'duration_min')::int,
      coalesce((v_item ->> 'buffer_before_min')::int, 0),
      coalesce((v_item ->> 'buffer_after_min')::int, 0),
      (v_item ->> 'price')::numeric
    )
    returning id into v_service;

    insert into public.service_resources (tenant_id, service_id, resource_id)
    select v_tenant, v_service, unnest(v_staff);
  end loop;

  -- ---------------------------------------------------------------------------
  -- Çalışma saatleri. Öğle arası varsa gün iki parçaya bölünür — arayı ayrı bir
  -- "kapalı" kaydı olarak tutmak yerine iki çalışma aralığı yazmak, slot
  -- hesabını basitleştiriyor.
  -- ---------------------------------------------------------------------------
  if v_wh is not null and cardinality(v_staff) > 0 then
    foreach v_resource in array v_staff loop
      for v_weekday in
        select (jsonb_array_elements_text(coalesce(v_wh -> 'weekdays', '[]'::jsonb)))::int
      loop
        if v_wh -> 'break' is null or v_wh -> 'break' = 'null'::jsonb then
          insert into public.working_hours (tenant_id, resource_id, weekday, starts_at, ends_at)
          values (v_tenant, v_resource, v_weekday,
                  (v_wh ->> 'starts_at')::time, (v_wh ->> 'ends_at')::time);
        else
          insert into public.working_hours (tenant_id, resource_id, weekday, starts_at, ends_at)
          values (v_tenant, v_resource, v_weekday,
                  (v_wh ->> 'starts_at')::time, (v_wh -> 'break' ->> 'starts_at')::time);
          insert into public.working_hours (tenant_id, resource_id, weekday, starts_at, ends_at)
          values (v_tenant, v_resource, v_weekday,
                  (v_wh -> 'break' ->> 'ends_at')::time, (v_wh ->> 'ends_at')::time);
        end if;
      end loop;
    end loop;
  end if;

  -- ---------------------------------------------------------------------------
  -- Esnek alanlar
  -- ---------------------------------------------------------------------------
  for v_item in
    select jsonb_array_elements(coalesce(_payload -> 'customer_fields', '[]'::jsonb))
  loop
    insert into public.field_definitions
      (tenant_id, entity, key, label, kind, is_required, is_medical, options, sort_order)
    values (
      v_tenant, 'customer', v_item ->> 'key', v_item ->> 'label',
      coalesce((v_item ->> 'kind')::public.field_kind, 'text'),
      coalesce((v_item ->> 'is_required')::boolean, false),
      coalesce((v_item ->> 'is_medical')::boolean, false),
      coalesce(v_item -> 'options', '[]'::jsonb),
      coalesce((v_item ->> 'sort_order')::int, 0)
    );
  end loop;

  for v_item in
    select jsonb_array_elements(coalesce(_payload -> 'appointment_fields', '[]'::jsonb))
  loop
    insert into public.field_definitions
      (tenant_id, entity, key, label, kind, is_required, is_medical, options, sort_order)
    values (
      v_tenant, 'appointment', v_item ->> 'key', v_item ->> 'label',
      coalesce((v_item ->> 'kind')::public.field_kind, 'text'),
      coalesce((v_item ->> 'is_required')::boolean, false),
      coalesce((v_item ->> 'is_medical')::boolean, false),
      coalesce(v_item -> 'options', '[]'::jsonb),
      coalesce((v_item ->> 'sort_order')::int, 0)
    );
  end loop;

  return v_tenant;
end;
$$;

revoke execute on function public.create_tenant_from_template(text, text, public.business_family, text, text, jsonb)
  from public, anon;
grant execute on function public.create_tenant_from_template(text, text, public.business_family, text, text, jsonb)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Slug müsaitlik kontrolü. Kurulum sihirbazı bunu canlı olarak sorar.
-- `tenants` tablosunu okutmadan yalnızca boolean döndürür.
-- -----------------------------------------------------------------------------
create or replace function public.is_slug_available(_slug text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select not exists (
    select 1 from public.tenants t where t.slug = lower(btrim(_slug))
  );
$$;

revoke execute on function public.is_slug_available(text) from public;
grant execute on function public.is_slug_available(text) to authenticated, anon;


-- ###########################################################################
-- schemas/90_rls.sql
-- ###########################################################################

-- =============================================================================
-- 90_rls — Row Level Security politikaları
-- =============================================================================
-- Kurallar (Bölüm 3 tuzak listesi):
--   1. `to authenticated` TEK BAŞINA yetki değildir — her politikada sahiplik
--      ya da üyelik koşulu bulunur. Aksi halde giriş yapan herkes her satırı
--      görür (BOLA / IDOR).
--   2. UPDATE politikaları hem `using` hem `with check` alır. `with check`
--      olmadan kullanıcı satırın tenant_id'sini başkasına atayabilir.
--   3. Her tabloda SELECT politikası vardır; SELECT politikası olmayan bir
--      tabloda UPDATE sessizce 0 satır döner, hata vermez.
--   4. Yetki fonksiyonları `private` şemadadır ve EXECUTE'ları geri alınmıştır.
--
-- anon rolüne HİÇBİR tabloda yetki verilmez. Public randevu sayfası veriye
-- doğrudan değil, denetimli `security definer` RPC'ler üzerinden erişecek.

-- -----------------------------------------------------------------------------
-- Varsayılanı kapat
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- -----------------------------------------------------------------------------
-- tenants
-- -----------------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenants force row level security;
grant select, update on public.tenants to authenticated;

create policy tenants_member_read on public.tenants
  for select to authenticated
  using ( (select private.is_tenant_member(id)) );

create policy tenants_manage on public.tenants
  for update to authenticated
  using      ( private.allows('tenant.manage', id) )
  with check ( private.allows('tenant.manage', id) );

-- INSERT yok: kurum oluşturma yalnızca onboarding RPC'si üzerinden.

-- -----------------------------------------------------------------------------
-- tenant_settings
-- -----------------------------------------------------------------------------
alter table public.tenant_settings enable row level security;
alter table public.tenant_settings force row level security;
grant select, insert, update on public.tenant_settings to authenticated;

create policy tenant_settings_read on public.tenant_settings
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy tenant_settings_write on public.tenant_settings
  for update to authenticated
  using      ( private.allows('settings.manage', tenant_id) )
  with check ( private.allows('settings.manage', tenant_id) );

create policy tenant_settings_insert on public.tenant_settings
  for insert to authenticated
  with check ( private.allows('settings.manage', tenant_id) );

-- -----------------------------------------------------------------------------
-- Global kataloglar — tenant verisi değil, herkes okuyabilir, kimse yazamaz
-- -----------------------------------------------------------------------------
alter table public.permissions enable row level security;
alter table public.role_templates enable row level security;
alter table public.role_template_permissions enable row level security;

grant select on public.permissions               to authenticated;
grant select on public.role_templates            to authenticated;
grant select on public.role_template_permissions to authenticated;

create policy permissions_read on public.permissions
  for select to authenticated using ( true );
create policy role_templates_read on public.role_templates
  for select to authenticated using ( true );
create policy role_template_permissions_read on public.role_template_permissions
  for select to authenticated using ( true );

-- -----------------------------------------------------------------------------
-- roles / role_permissions
-- -----------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.roles force row level security;
grant select, insert, update, delete on public.roles to authenticated;

create policy roles_read on public.roles
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy roles_insert on public.roles
  for insert to authenticated
  with check ( private.allows('role.manage', tenant_id) );

create policy roles_update on public.roles
  for update to authenticated
  using      ( private.allows('role.manage', tenant_id) and not is_protected )
  with check ( private.allows('role.manage', tenant_id) and not is_protected );

create policy roles_delete on public.roles
  for delete to authenticated
  using ( private.allows('role.manage', tenant_id) and not is_system );

alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;
grant select, insert, update, delete on public.role_permissions to authenticated;

create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using ( exists (
    select 1 from public.roles r
    where r.id = role_id and (select private.is_tenant_member(r.tenant_id))
  ) );

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using ( exists (
    select 1 from public.roles r
    where r.id = role_id
      and private.allows('role.manage', r.tenant_id)
      and not r.is_protected
  ) )
  with check ( exists (
    select 1 from public.roles r
    where r.id = role_id
      and private.allows('role.manage', r.tenant_id)
      and not r.is_protected
  ) );

-- -----------------------------------------------------------------------------
-- memberships
-- Kullanıcı kendi üyeliklerini HER ZAMAN görür — hangi kurumlara bağlı olduğunu
-- bilmesi gerekir. Başkalarınınkini görmek staff.manage ister.
-- -----------------------------------------------------------------------------
alter table public.memberships enable row level security;
alter table public.memberships force row level security;
grant select, insert, update, delete on public.memberships to authenticated;

create policy memberships_read on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.allows('staff.manage', tenant_id)
  );

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check ( private.allows('staff.manage', tenant_id) );

create policy memberships_update on public.memberships
  for update to authenticated
  using      ( private.allows('staff.manage', tenant_id) )
  with check ( private.allows('staff.manage', tenant_id) );

create policy memberships_delete on public.memberships
  for delete to authenticated
  using ( private.allows('staff.manage', tenant_id) );

-- -----------------------------------------------------------------------------
-- branches / departments
-- -----------------------------------------------------------------------------
alter table public.branches enable row level security;
alter table public.branches force row level security;
grant select, insert, update, delete on public.branches to authenticated;

create policy branches_read on public.branches
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy branches_write on public.branches
  for all to authenticated
  using      ( private.allows('branch.manage', tenant_id) )
  with check ( private.allows('branch.manage', tenant_id) );

alter table public.departments enable row level security;
alter table public.departments force row level security;
grant select, insert, update, delete on public.departments to authenticated;

create policy departments_read on public.departments
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy departments_write on public.departments
  for all to authenticated
  using      ( private.allows('branch.manage', tenant_id) )
  with check ( private.allows('branch.manage', tenant_id) );

-- -----------------------------------------------------------------------------
-- resources
-- 'own' kapsamı için kaynağın kendi id'si geçirilir: hekim kendi kaydını görür.
-- -----------------------------------------------------------------------------
alter table public.resources enable row level security;
alter table public.resources force row level security;
grant select, insert, update, delete on public.resources to authenticated;

create policy resources_read on public.resources
  for select to authenticated
  using ( private.allows('resource.read', tenant_id, branch_id, id) );

create policy resources_write on public.resources
  for all to authenticated
  using      ( private.allows('resource.manage', tenant_id, branch_id) )
  with check ( private.allows('resource.manage', tenant_id, branch_id) );

-- -----------------------------------------------------------------------------
-- services / service_resources
-- Hizmet listesi kurum içinde herkese açık: randevu alan herkesin görmesi gerek.
-- -----------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.services force row level security;
grant select, insert, update, delete on public.services to authenticated;

create policy services_read on public.services
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy services_write on public.services
  for all to authenticated
  using      ( private.allows('service.manage', tenant_id) )
  with check ( private.allows('service.manage', tenant_id) );

alter table public.service_resources enable row level security;
alter table public.service_resources force row level security;
grant select, insert, update, delete on public.service_resources to authenticated;

create policy service_resources_read on public.service_resources
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy service_resources_write on public.service_resources
  for all to authenticated
  using      ( private.allows('service.manage', tenant_id) )
  with check ( private.allows('service.manage', tenant_id) );

-- -----------------------------------------------------------------------------
-- working_hours / time_off
-- Okuma kurum içinde serbest: slot hesabı için herkesin görmesi gerekiyor.
-- -----------------------------------------------------------------------------
alter table public.working_hours enable row level security;
alter table public.working_hours force row level security;
grant select, insert, update, delete on public.working_hours to authenticated;

create policy working_hours_read on public.working_hours
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy working_hours_write on public.working_hours
  for all to authenticated
  using      ( private.allows('resource.manage', tenant_id, null, resource_id) )
  with check ( private.allows('resource.manage', tenant_id, null, resource_id) );

alter table public.time_off enable row level security;
alter table public.time_off force row level security;
grant select, insert, update, delete on public.time_off to authenticated;

create policy time_off_read on public.time_off
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy time_off_write on public.time_off
  for all to authenticated
  using      ( private.allows('resource.manage', tenant_id, null, resource_id) )
  with check ( private.allows('resource.manage', tenant_id, null, resource_id) );

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customers force row level security;
grant select, insert, update, delete on public.customers to authenticated;

create policy customers_read on public.customers
  for select to authenticated
  using ( private.allows('customer.read', tenant_id, branch_id) );

create policy customers_insert on public.customers
  for insert to authenticated
  with check ( private.allows('customer.write', tenant_id, branch_id) );

create policy customers_update on public.customers
  for update to authenticated
  using      ( private.allows('customer.write', tenant_id, branch_id) )
  with check ( private.allows('customer.write', tenant_id, branch_id) );

-- DELETE politikası yok: hasta kaydı silinmez, anonimleştirilir (KVKK).

-- -----------------------------------------------------------------------------
-- customer_medical_notes — ayrı tablo, ayrı izin.
-- Resepsiyon randevuyu görür, bu tabloyu GÖRMEZ.
-- -----------------------------------------------------------------------------
alter table public.customer_medical_notes enable row level security;
alter table public.customer_medical_notes force row level security;
grant select, insert, update on public.customer_medical_notes to authenticated;

create policy medical_notes_read on public.customer_medical_notes
  for select to authenticated
  using ( private.allows('customer.medical_notes.read', tenant_id, branch_id, resource_id) );

create policy medical_notes_insert on public.customer_medical_notes
  for insert to authenticated
  with check ( private.allows('customer.medical_notes.write', tenant_id, branch_id, resource_id) );

create policy medical_notes_update on public.customer_medical_notes
  for update to authenticated
  using      ( private.allows('customer.medical_notes.write', tenant_id, branch_id, resource_id) )
  with check ( private.allows('customer.medical_notes.write', tenant_id, branch_id, resource_id) );

-- -----------------------------------------------------------------------------
-- field_definitions
-- -----------------------------------------------------------------------------
alter table public.field_definitions enable row level security;
alter table public.field_definitions force row level security;
grant select, insert, update, delete on public.field_definitions to authenticated;

create policy field_definitions_read on public.field_definitions
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy field_definitions_write on public.field_definitions
  for all to authenticated
  using      ( private.allows('settings.manage', tenant_id) )
  with check ( private.allows('settings.manage', tenant_id) );

-- -----------------------------------------------------------------------------
-- consents — rıza kayıtları değiştirilemez; iptal ayrı satırla yapılır
-- -----------------------------------------------------------------------------
alter table public.consents enable row level security;
alter table public.consents force row level security;
grant select, insert on public.consents to authenticated;

create policy consents_read on public.consents
  for select to authenticated
  using ( private.allows('customer.read', tenant_id) );

create policy consents_insert on public.consents
  for insert to authenticated
  with check ( private.allows('customer.write', tenant_id) );

-- -----------------------------------------------------------------------------
-- appointments — üç kapsam da geçerli: kurum, şube, kendi kaynağı
-- -----------------------------------------------------------------------------
alter table public.appointments enable row level security;
alter table public.appointments force row level security;
grant select, insert, update on public.appointments to authenticated;

create policy appointments_read on public.appointments
  for select to authenticated
  using ( private.allows('appointment.read', tenant_id, branch_id, resource_id) );

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check ( private.allows('appointment.write', tenant_id, branch_id, resource_id) );

create policy appointments_update on public.appointments
  for update to authenticated
  using      ( private.allows('appointment.write', tenant_id, branch_id, resource_id) )
  with check ( private.allows('appointment.write', tenant_id, branch_id, resource_id) );

-- DELETE yok: randevu silinmez, iptal edilir. Geçmiş kayıt aynı zamanda
-- ticari ve tıbbi kayıttır.

-- -----------------------------------------------------------------------------
-- appointment_items
-- -----------------------------------------------------------------------------
alter table public.appointment_items enable row level security;
alter table public.appointment_items force row level security;
grant select, insert, update, delete on public.appointment_items to authenticated;

create policy appointment_items_read on public.appointment_items
  for select to authenticated
  using ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and private.allows('appointment.read', a.tenant_id, a.branch_id, a.resource_id)
  ) );

create policy appointment_items_write on public.appointment_items
  for all to authenticated
  using ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and private.allows('appointment.write', a.tenant_id, a.branch_id, a.resource_id)
  ) )
  with check ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and private.allows('appointment.write', a.tenant_id, a.branch_id, a.resource_id)
  ) );

-- -----------------------------------------------------------------------------
-- waitlist_entries
-- -----------------------------------------------------------------------------
alter table public.waitlist_entries enable row level security;
alter table public.waitlist_entries force row level security;
grant select, insert, update, delete on public.waitlist_entries to authenticated;

create policy waitlist_read on public.waitlist_entries
  for select to authenticated
  using ( private.allows('appointment.read', tenant_id, branch_id, resource_id) );

create policy waitlist_write on public.waitlist_entries
  for all to authenticated
  using      ( private.allows('appointment.write', tenant_id, branch_id, resource_id) )
  with check ( private.allows('appointment.write', tenant_id, branch_id, resource_id) );

-- -----------------------------------------------------------------------------
-- audit_logs — okunur, yazılmaz. Kayıtları yalnızca güvenilir sunucu kodu
-- (service_role) ve trigger'lar üretir.
-- -----------------------------------------------------------------------------
alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;
grant select on public.audit_logs to authenticated;

create policy audit_logs_read on public.audit_logs
  for select to authenticated
  using ( private.allows('audit.read', tenant_id) );
