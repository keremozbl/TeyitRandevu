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
