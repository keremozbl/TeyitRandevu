-- -----------------------------------------------------------------------------
-- Durum değişikliğinin yan etkileri.
--
-- Uygulamada değil veritabanında: randevunun durumunu panel de değiştirecek,
-- public iptal bağlantısı da, ileride IVR'de "2" tuşu da. Üç yerde tekrarlanan
-- bir kural er geç ikisinde doğru birinde yanlış olur.
-- -----------------------------------------------------------------------------
create or replace function private.appointments_status_stamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'cancelled' then
      new.cancelled_at := coalesce(new.cancelled_at, now());
      new.cancelled_by := coalesce(new.cancelled_by, (select auth.uid()));
    elsif old.status = 'cancelled' then
      -- iptal geri alındı: iz bırakılmaz, kayıt yeniden yaşayan bir randevudur
      new.cancelled_at     := null;
      new.cancelled_reason := null;
      new.cancelled_by     := null;
    end if;

    if new.status = 'no_show' then
      new.no_show_at := coalesce(new.no_show_at, now());
    elsif old.status = 'no_show' then
      new.no_show_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_status_stamps on public.appointments;
create trigger appointments_status_stamps
  before update of status on public.appointments
  for each row execute function private.appointments_status_stamps();

-- customers.no_show_count türetilmiş bir sayaçtır; kullanıcının hasta kartını
-- düzenleme yetkisi olmasa da doğru kalmalı. Bu yüzden security definer —
-- fonksiyon private şemada, PostgREST dışarı açmıyor.
create or replace function private.appointments_no_show_counter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_id is null or new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'no_show' then
    update public.customers
       set no_show_count = no_show_count + 1
     where id = new.customer_id;
  elsif old.status = 'no_show' then
    update public.customers
       set no_show_count = greatest(no_show_count - 1, 0)
     where id = new.customer_id;
  end if;

  return null;
end;
$$;

drop trigger if exists appointments_no_show_counter on public.appointments;
create trigger appointments_no_show_counter
  after update of status on public.appointments
  for each row execute function private.appointments_no_show_counter();

