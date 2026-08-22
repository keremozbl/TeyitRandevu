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
