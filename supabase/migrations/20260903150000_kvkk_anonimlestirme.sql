-- =============================================================================
-- KVKK imhası: kaydın anonimleştirilmesi
-- =============================================================================
-- Declarative kaynak: supabase/schemas/97_kvkk.sql ve 40_customers.sql
-- (`customers.anonymized_at`). Docker olmadan `db diff` çalışmadığı için
-- migration elle yazılıyor (D2).
--
-- İzin kataloğuna `customer.erase` eklendi; katalog `npm run db:seed` ile
-- yeniden uygulanıyor (supabase/seed.sql). Owner ve admin katalogdaki her
-- izni aldığı için ek bir satır gerekmiyor.

alter table public.customers
  add column if not exists anonymized_at timestamptz;

comment on column public.customers.anonymized_at is
  'KVKK m.7 imhası uygulandıysa dolu. Kayıt salt okunur sayılır.';

create or replace function public.anonymize_customer(
  _tenant_id   uuid,
  _customer_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if not (select private.allows('customer.erase', _tenant_id)) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;

  select true into v_exists
    from public.customers c
   where c.id = _customer_id and c.tenant_id = _tenant_id;

  if v_exists is not true then
    raise exception 'Kayıt bulunamadı' using errcode = 'P0002';
  end if;

  delete from public.customer_medical_notes
   where customer_id = _customer_id and tenant_id = _tenant_id;

  delete from public.waitlist_entries
   where customer_id = _customer_id and tenant_id = _tenant_id;

  update public.appointments
     set notes = null,
         custom_data = '{}'::jsonb
   where customer_id = _customer_id and tenant_id = _tenant_id;

  update public.notifications
     set to_address = null,
         rendered_subject = null,
         rendered_body = null,
         payload = '{}'::jsonb
   where customer_id = _customer_id and tenant_id = _tenant_id;

  update public.consents
     set ip = null,
         user_agent = null
   where customer_id = _customer_id and tenant_id = _tenant_id;

  update public.customers
     set full_name = 'Silinen kayıt',
         phone = null,
         email = null,
         birth_date = null,
         notes = null,
         tags = '{}'::text[],
         custom_data = '{}'::jsonb,
         is_active = false,
         anonymized_at = now()
   where id = _customer_id and tenant_id = _tenant_id;
end;
$$;

revoke all on function public.anonymize_customer(uuid, uuid) from public;
grant execute on function public.anonymize_customer(uuid, uuid) to authenticated;

comment on function public.anonymize_customer(uuid, uuid) is
  'KVKK m.7 imha: kişiyi tanımlayan veriyi kaydın içinden çıkarır, ticari '
  'kaydı (randevu, rıza, bildirim satırı) bırakır. Geri alınamaz.';
