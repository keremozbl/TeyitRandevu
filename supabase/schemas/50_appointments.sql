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
