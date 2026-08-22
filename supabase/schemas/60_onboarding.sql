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
