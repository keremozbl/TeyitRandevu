-- `for all` politikalarını INSERT/UPDATE/DELETE üçlüsüne böler.
--
-- `for all` aynı zamanda bir SELECT politikası da yaratıyor ve her okuma
-- sorgusunda hem `_read` hem `_write` politikası değerlendiriliyordu. Takvim
-- bu tablolara sürekli vurduğu için gereksiz maliyet. Supabase performans
-- denetçisi: multiple_permissive_policies (11 tablo).

drop policy if exists role_permissions_write on public.role_permissions;

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

drop policy if exists branches_write on public.branches;

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

drop policy if exists departments_write on public.departments;

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

drop policy if exists resources_write on public.resources;

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

drop policy if exists services_write on public.services;

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

drop policy if exists service_resources_write on public.service_resources;

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

drop policy if exists working_hours_write on public.working_hours;

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

drop policy if exists time_off_write on public.time_off;

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

drop policy if exists field_definitions_write on public.field_definitions;

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

drop policy if exists appointment_items_write on public.appointment_items;

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

drop policy if exists waitlist_write on public.waitlist_entries;

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
