-- =============================================================================
-- `customer.erase` izni: katalog, rol şablonu ve MEVCUT kurumlara geri dolgu
-- =============================================================================
-- Declarative kaynak: supabase/seed.sql (izin kataloğu).
--
-- NEDEN MIGRATION'DA: `npm run db:seed` (supabase db push --include-seed) bu
-- değişikliği UYGULAMADI — çıktısında "Updating seed hash" yazdı, yani seed
-- dosyasının yeni özetini kaydetti ama SQL'i çalıştırmadı. Katalog 22 izinde
-- kaldı ve `anonymize_customer` sahibe bile "yetkiniz yok" dedi. Seed
-- dosyasını değiştirmek tek başına yetmiyor; kalıcı olması gereken her katalog
-- satırı migration'da da olmalı.
--
-- Ayrıca rol izinleri kurum kurulurken KOPYALANIYOR: yeni bir izin eklendiğinde
-- ÖNCEDEN kurulmuş kurumlar onu kendiliğinden almaz. Son blok o kurumların
-- sahip ve yönetici rollerine izni geriye dönük yazıyor.

insert into public.permissions (key, category, label, scopes, sort_order)
values (
  'customer.erase',
  'hasta',
  'Kaydı anonimleştir (KVKK imha)',
  array['tenant']::public.permission_scope[],
  450
)
on conflict (key) do update
  set category = excluded.category,
      label = excluded.label,
      scopes = excluded.scopes,
      sort_order = excluded.sort_order;

-- Rol şablonu: sahip ve yönetici. Diğer roller (hekim, resepsiyon, asistan,
-- muhasebe) imha yetkisi almıyor — bu bir yönetim kararı, günlük iş değil.
insert into public.role_template_permissions (role_template_key, permission_key, scope)
values
  ('owner', 'customer.erase', 'tenant'::public.permission_scope),
  ('admin', 'customer.erase', 'tenant'::public.permission_scope)
on conflict (role_template_key, permission_key) do update
  set scope = excluded.scope;

-- Mevcut kurumlar: aynı izni sahip ve yönetici rollerine ekle.
insert into public.role_permissions (role_id, permission_key, scope)
select r.id, 'customer.erase', 'tenant'::public.permission_scope
  from public.roles r
 where r.key in ('owner', 'admin')
on conflict (role_id, permission_key) do nothing;
