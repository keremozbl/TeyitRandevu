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
-- EXECUTE yetkileri
--
-- authenticated'ın bu fonksiyonları çağırabilmesi ZORUNLU: RLS politika
-- ifadeleri sorguyu atan kullanıcı adına değerlendirilir. EXECUTE geri
-- alınırsa politikalar "permission denied for function" ile patlar ve
-- uygulama tamamen durur.
--
-- Bu bir güvenlik açığı değil: fonksiyonlar yalnızca çağıranın KENDİ yetki
-- haritasını döndürür — zaten bildiği bilgiyi. Başka kiracının verisine
-- açılan bir pencere değiller. Dışarıdan RPC ile çağrılamamalarını sağlayan
-- şey de bu grant değil, PostgREST'in yalnızca `public` şemasını dışa
-- açması (config.toml → api.schemas).
-- -----------------------------------------------------------------------------
revoke execute on function private.member_tenants()               from public, anon;
revoke execute on function private.is_tenant_member(uuid)         from public, anon;
revoke execute on function private.tenants_with(text)             from public, anon;
revoke execute on function private.branches_with(text)            from public, anon;
revoke execute on function private.resources_with(text)           from public, anon;
revoke execute on function private.allows(text, uuid, uuid, uuid) from public, anon;

grant execute on function private.member_tenants()               to authenticated;
grant execute on function private.is_tenant_member(uuid)         to authenticated;
grant execute on function private.tenants_with(text)             to authenticated;
grant execute on function private.branches_with(text)            to authenticated;
grant execute on function private.resources_with(text)           to authenticated;
grant execute on function private.allows(text, uuid, uuid, uuid) to authenticated;
