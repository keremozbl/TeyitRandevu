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
--   4. Yetki fonksiyonları `private` şemadadır. authenticated'ın onlara EXECUTE
--      yetkisi VARDIR ve olmak zorundadır — politika ifadeleri sorguyu atan
--      kullanıcı adına değerlendirilir. Dışarıya kapalı olmalarını sağlayan şey
--      PostgREST'in yalnızca `public` şemasını dışa açması.
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

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check ( exists (
    select 1 from public.roles r
    where r.id = role_id
      and private.allows('role.manage', r.tenant_id)
      and not r.is_protected
  ) );

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using      ( exists (
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

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using ( exists (
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

create policy branches_insert on public.branches
  for insert to authenticated
  with check ( private.allows('branch.manage', tenant_id) );

create policy branches_update on public.branches
  for update to authenticated
  using      ( private.allows('branch.manage', tenant_id) )
  with check ( private.allows('branch.manage', tenant_id) );

create policy branches_delete on public.branches
  for delete to authenticated
  using ( private.allows('branch.manage', tenant_id) );

alter table public.departments enable row level security;
alter table public.departments force row level security;
grant select, insert, update, delete on public.departments to authenticated;

create policy departments_read on public.departments
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy departments_insert on public.departments
  for insert to authenticated
  with check ( private.allows('branch.manage', tenant_id) );

create policy departments_update on public.departments
  for update to authenticated
  using      ( private.allows('branch.manage', tenant_id) )
  with check ( private.allows('branch.manage', tenant_id) );

create policy departments_delete on public.departments
  for delete to authenticated
  using ( private.allows('branch.manage', tenant_id) );

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

create policy resources_insert on public.resources
  for insert to authenticated
  with check ( private.allows('resource.manage', tenant_id, branch_id) );

create policy resources_update on public.resources
  for update to authenticated
  using      ( private.allows('resource.manage', tenant_id, branch_id) )
  with check ( private.allows('resource.manage', tenant_id, branch_id) );

create policy resources_delete on public.resources
  for delete to authenticated
  using ( private.allows('resource.manage', tenant_id, branch_id) );

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

create policy services_insert on public.services
  for insert to authenticated
  with check ( private.allows('service.manage', tenant_id) );

create policy services_update on public.services
  for update to authenticated
  using      ( private.allows('service.manage', tenant_id) )
  with check ( private.allows('service.manage', tenant_id) );

create policy services_delete on public.services
  for delete to authenticated
  using ( private.allows('service.manage', tenant_id) );

alter table public.service_resources enable row level security;
alter table public.service_resources force row level security;
grant select, insert, update, delete on public.service_resources to authenticated;

create policy service_resources_read on public.service_resources
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy service_resources_insert on public.service_resources
  for insert to authenticated
  with check ( private.allows('service.manage', tenant_id) );

create policy service_resources_update on public.service_resources
  for update to authenticated
  using      ( private.allows('service.manage', tenant_id) )
  with check ( private.allows('service.manage', tenant_id) );

create policy service_resources_delete on public.service_resources
  for delete to authenticated
  using ( private.allows('service.manage', tenant_id) );

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

create policy working_hours_insert on public.working_hours
  for insert to authenticated
  with check ( private.allows('resource.manage', tenant_id, null, resource_id) );

create policy working_hours_update on public.working_hours
  for update to authenticated
  using      ( private.allows('resource.manage', tenant_id, null, resource_id) )
  with check ( private.allows('resource.manage', tenant_id, null, resource_id) );

create policy working_hours_delete on public.working_hours
  for delete to authenticated
  using ( private.allows('resource.manage', tenant_id, null, resource_id) );

alter table public.time_off enable row level security;
alter table public.time_off force row level security;
grant select, insert, update, delete on public.time_off to authenticated;

create policy time_off_read on public.time_off
  for select to authenticated
  using ( (select private.is_tenant_member(tenant_id)) );

create policy time_off_insert on public.time_off
  for insert to authenticated
  with check ( private.allows('resource.manage', tenant_id, null, resource_id) );

create policy time_off_update on public.time_off
  for update to authenticated
  using      ( private.allows('resource.manage', tenant_id, null, resource_id) )
  with check ( private.allows('resource.manage', tenant_id, null, resource_id) );

create policy time_off_delete on public.time_off
  for delete to authenticated
  using ( private.allows('resource.manage', tenant_id, null, resource_id) );

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

create policy field_definitions_insert on public.field_definitions
  for insert to authenticated
  with check ( private.allows('settings.manage', tenant_id) );

create policy field_definitions_update on public.field_definitions
  for update to authenticated
  using      ( private.allows('settings.manage', tenant_id) )
  with check ( private.allows('settings.manage', tenant_id) );

create policy field_definitions_delete on public.field_definitions
  for delete to authenticated
  using ( private.allows('settings.manage', tenant_id) );

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

create policy appointment_items_insert on public.appointment_items
  for insert to authenticated
  with check ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and private.allows('appointment.write', a.tenant_id, a.branch_id, a.resource_id)
  ) );

create policy appointment_items_update on public.appointment_items
  for update to authenticated
  using      ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and private.allows('appointment.write', a.tenant_id, a.branch_id, a.resource_id)
  ) )
  with check ( exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and private.allows('appointment.write', a.tenant_id, a.branch_id, a.resource_id)
  ) );

create policy appointment_items_delete on public.appointment_items
  for delete to authenticated
  using ( exists (
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

create policy waitlist_insert on public.waitlist_entries
  for insert to authenticated
  with check ( private.allows('appointment.write', tenant_id, branch_id, resource_id) );

create policy waitlist_update on public.waitlist_entries
  for update to authenticated
  using      ( private.allows('appointment.write', tenant_id, branch_id, resource_id) )
  with check ( private.allows('appointment.write', tenant_id, branch_id, resource_id) );

create policy waitlist_delete on public.waitlist_entries
  for delete to authenticated
  using ( private.allows('appointment.write', tenant_id, branch_id, resource_id) );

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
