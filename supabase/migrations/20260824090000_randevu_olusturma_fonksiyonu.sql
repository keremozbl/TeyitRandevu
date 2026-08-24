
-- -----------------------------------------------------------------------------
-- Randevu oluşturma — randevu ve (gerekiyorsa) yeni hasta kaydı TEK işlemde.
--
-- Ayrı iki çağrı olsaydı: hasta kaydı yazılır, randevu çakışma kısıtına takılır
-- ve geride öksüz bir hasta kaydı kalırdı. Resepsiyon önerilen saatle tekrar
-- denediğinde aynı hasta ikinci kez açılırdı. Transaction bunu imkânsız kılar.
--
-- `security definer` DEĞİL: RLS uygulanmalı. Fonksiyon çağıranın yetkisiyle
-- çalışır, dolayısıyla appointments_insert ve customers_insert politikaları
-- aynen geçerlidir. Yetki kontrolü burada tekrarlanmaz (Kural 3).
-- -----------------------------------------------------------------------------
create or replace function public.create_appointment(
  _tenant_id      uuid,
  _branch_id      uuid,
  _resource_id    uuid,
  _starts_at      timestamptz,
  _duration_min   int,
  _status         public.appointment_status,
  _service_id     uuid default null,
  _customer_id    uuid default null,
  _customer_name  text default null,
  _customer_phone text default null,
  _notes          text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_id uuid := _customer_id;
  v_before      int  := 0;
  v_after       int  := 0;
  v_ends_at     timestamptz;
  v_appointment uuid;
begin
  if _duration_min is null or _duration_min < 5 or _duration_min > 1440 then
    raise exception 'Randevu süresi 5 ile 1440 dakika arasında olmalı' using errcode = 'P0001';
  end if;

  -- Kaynak gerçekten bu şubenin, şube de bu kurumun mu? İki kurumda birden
  -- üyeliği olan bir kullanıcı satırları karıştıramasın.
  if not exists (
    select 1
    from public.resources r
    join public.branches b on b.id = r.branch_id
    where r.id = _resource_id and r.branch_id = _branch_id and b.tenant_id = _tenant_id
  ) then
    raise exception 'Kaynak bu şubeye ait değil' using errcode = 'P0001';
  end if;

  -- Tampon süreler hizmetten KOPYALANIR: hizmetin süresi sonradan değişirse
  -- geçmiş randevular kaymasın (50_appointments başındaki not).
  if _service_id is not null then
    select s.buffer_before_min, s.buffer_after_min
      into v_before, v_after
      from public.services s
     where s.id = _service_id and s.tenant_id = _tenant_id;

    if not found then
      raise exception 'Hizmet bu kuruma ait değil' using errcode = 'P0001';
    end if;
  end if;

  if v_customer_id is null and nullif(btrim(coalesce(_customer_name, '')), '') is not null then
    -- Aynı telefon zaten kayıtlıysa ikinci kayıt açılmaz; telefon kurum içinde
    -- hastanın pratikteki kimliği.
    if _customer_phone is not null then
      select c.id into v_customer_id
        from public.customers c
       where c.tenant_id = _tenant_id and c.phone = _customer_phone and c.is_active
       limit 1;
    end if;

    if v_customer_id is null then
      insert into public.customers (tenant_id, branch_id, full_name, phone, source, created_by)
      values (_tenant_id, _branch_id, btrim(_customer_name), _customer_phone, 'panel',
              (select auth.uid()))
      returning id into v_customer_id;
    end if;
  end if;

  v_ends_at := _starts_at + make_interval(mins => _duration_min);

  -- blocked_from / blocked_to trigger tarafından yeniden hesaplanır; NOT NULL
  -- olduğu için buraya da yazılıyor.
  insert into public.appointments (
    tenant_id, branch_id, resource_id, customer_id, service_id,
    starts_at, ends_at, buffer_before_min, buffer_after_min,
    blocked_from, blocked_to, status, notes, source, created_by
  ) values (
    _tenant_id, _branch_id, _resource_id, v_customer_id, _service_id,
    _starts_at, v_ends_at, v_before, v_after,
    _starts_at, v_ends_at, _status, nullif(btrim(coalesce(_notes, '')), ''), 'panel',
    (select auth.uid())
  )
  returning id into v_appointment;

  return v_appointment;
end;
$$;

revoke execute on function public.create_appointment(
  uuid, uuid, uuid, timestamptz, int, public.appointment_status, uuid, uuid, text, text, text
) from public;

grant execute on function public.create_appointment(
  uuid, uuid, uuid, timestamptz, int, public.appointment_status, uuid, uuid, text, text, text
) to authenticated;
