-- =============================================================================
-- 35_access — yetki çözümleme fonksiyonları
-- =============================================================================
-- Performans notu (kritik): bu fonksiyonlar YALNIZCA auth.uid() ve izin
-- anahtarına bağlıdır, satır değerlerine değil. Politikalarda `(select ...)`
-- sarmalıyla çağrıldıklarında Postgres bunları InitPlan'a çevirir ve sorgu
-- başına BİR KEZ çalıştırır. Satır değeri alan bir yetki fonksiyonu her satır
-- için yeniden çalışır ve büyük takvimlerde sorguyu kilitler.
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
-- Alt fonksiyonlar `(select ...)` ile sarmalandığı için sorgu başına bir kez
-- çalışır; bu fonksiyonun kendisi sadece dizi karşılaştırması yapar.
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
  select _tenant   = any ((select private.tenants_with(_perm)))
      or _branch   = any ((select private.branches_with(_perm)))
      or _resource = any ((select private.resources_with(_perm)));
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
