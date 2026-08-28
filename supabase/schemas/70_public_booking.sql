-- =============================================================================
-- 70_public_booking — public randevu sayfasının veri kapısı
-- =============================================================================
-- `anon` rolünün HİÇBİR tabloda yetkisi yok (90_rls başındaki not). Public
-- randevu sayfası veriye bu dosyadaki `security definer` fonksiyonlar üzerinden
-- erişir: her biri ne döndüreceğini tek tek seçer, hasta adı ya da not gibi
-- alanlar dışarı hiç çıkmaz.
--
-- Neden RPC, neden `anon`a tablo yetkisi değil:
--   Bir tabloya `anon` SELECT verirsek politikayı doğru yazsak bile PostgREST
--   sütunların tamamını, `or` filtrelerini ve gömülü ilişkileri açar. Randevu
--   saatlerini vermek isterken hasta listesini vermiş oluruz. Fonksiyon ise
--   sözleşmesi sabit tek bir kapı.
--
-- Üç kural bu dosyanın tamamında geçerli:
--   1. Her fonksiyon `set search_path = ''` ile yazılır ve her nesne şemasıyla
--      birlikte anılır — arama yolu oyunuyla başka bir tabloya yönlendirilemesin.
--   2. Beklenen sonuçlar (dolu slot, süresi dolmuş tutma, iptal penceresi)
--      hata DEĞİL, `{"ok": false, "reason": "..."}` döner; arayüz bunları
--      Türkçeye çevirir. `raise` yalnızca kötüye kullanım ve geçersiz girdi için.
--   3. Kurallar (ön süre, ileri tarih sınırı, çalışma saati) BURADA da
--      uygulanır. Tarayıcıdan gelen hiçbir şeye güvenilmez: slot listesini
--      hesaplayan kod istemcide çalışıyor, kimse onu kullanmak zorunda değil.
--
-- Çakışma güvencesi yine `appointments_no_overlap` kısıtıdır (Kural 1); bu
-- dosya onun yerine geçmez, yalnız reddi insanın anlayacağı bir cevaba çevirir.

-- -----------------------------------------------------------------------------
-- Kurumun public sayfasının açılış verisi: hizmetler, hekimler, kurallar.
--
-- Yalnızca yayında olan kurumlar: `suspended` ve `cancelled` kurumun sayfası
-- kapalıdır, aksi halde abonelik bitince randevu almaya devam edilir.
-- -----------------------------------------------------------------------------
create or replace function public.booking_page(_slug text)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', t.id,
      'name', t.name,
      'slug', t.slug,
      'timezone', t.timezone,
      'locale', t.locale,
      'currency', t.currency,
      'family', t.family,
      'business_type', t.business_type
    ),
    'branding', coalesce(s.branding, '{}'::jsonb),
    'terminology', coalesce(s.terminology, '{}'::jsonb),
    'rules', coalesce(s.booking_rules, '{}'::jsonb),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'name', b.name, 'address', b.address,
               'phone', b.phone, 'timezone', b.timezone
             ) order by b.name)
        from public.branches b
       where b.tenant_id = t.id and b.is_active
    ), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'branch_id', r.branch_id, 'name', r.name,
               'title', r.title, 'color', r.color, 'kind', r.kind
             ) order by r.sort_order, r.name)
        from public.resources r
       where r.tenant_id = t.id and r.is_active and r.is_bookable
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', sv.id, 'name', sv.name, 'category', sv.category,
               'duration_min', sv.duration_min,
               'buffer_before_min', sv.buffer_before_min,
               'buffer_after_min', sv.buffer_after_min,
               'price', sv.price,
               -- boş dizi = "bu hizmeti her kaynak verebilir"
               'resource_ids', coalesce((
                 select jsonb_agg(sr.resource_id)
                   from public.service_resources sr
                   join public.resources r2 on r2.id = sr.resource_id
                  where sr.service_id = sv.id and r2.is_active and r2.is_bookable
               ), '[]'::jsonb)
             ) order by sv.sort_order, sv.name)
        from public.services sv
       where sv.tenant_id = t.id and sv.is_active and sv.is_online_bookable
    ), '[]'::jsonb)
  )
  from public.tenants t
  left join public.tenant_settings s on s.tenant_id = t.id
  where t.slug = lower(btrim(_slug))
    and t.status in ('trial', 'active');
$$;

revoke execute on function public.booking_page(text) from public;
grant execute on function public.booking_page(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Uygunluk hesabının HAM GİRDİSİ: çalışma saatleri, izinler, dolu aralıklar.
--
-- Slot listesini bu fonksiyon üretmez. Üretse motor iki yerde olurdu — biri
-- SQL'de public sayfa için, biri TypeScript'te panel için — ve ikisi er geç
-- ayrışırdı. Uygunluk tek bir yerde hesaplanır (`src/lib/domain/availability.ts`),
-- burası ona veriyi verir.
--
-- Dışarı çıkan tek şey ZAMAN ARALIĞI: kimin randevusu olduğu, hangi hizmet
-- olduğu, hatta randevu mu izin mi olduğu bile ayrımsız. "Dolu" yeter.
--
-- Süresi dolmuş tutmalar dolu SAYILMAZ: onlar ölü satır, birazdan silinecek.
-- -----------------------------------------------------------------------------
create or replace function public.booking_availability(
  _slug         text,
  _resource_ids uuid[],
  _from         timestamptz,
  _to           timestamptz
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_ids    uuid[];
begin
  select t.id into v_tenant
    from public.tenants t
   where t.slug = lower(btrim(_slug)) and t.status in ('trial', 'active');

  if v_tenant is null then
    return null;
  end if;

  if _from is null or _to is null or _to <= _from then
    raise exception 'Geçersiz tarih aralığı' using errcode = 'P0001';
  end if;

  -- Sayfa en fazla `max_advance_days` kadar ileri bakar; buradaki tavan
  -- kazımaya karşı: tek istekle yılların takvimi çekilmesin.
  if _to - _from > interval '70 days' then
    raise exception 'Tarih aralığı en fazla 70 gün olabilir' using errcode = 'P0001';
  end if;

  -- Kaynaklar gerçekten bu kurumun mu: başka kurumun id'si listeye konursa
  -- burada düşer, sorguya hiç girmez.
  select coalesce(array_agg(r.id), '{}'::uuid[]) into v_ids
    from public.resources r
   where r.tenant_id = v_tenant
     and r.is_active and r.is_bookable
     and r.id = any (coalesce(_resource_ids, '{}'::uuid[]));

  return jsonb_build_object(
    'working_hours', coalesce((
      select jsonb_agg(jsonb_build_object(
               'resource_id', w.resource_id, 'weekday', w.weekday,
               'starts_at', w.starts_at, 'ends_at', w.ends_at))
        from public.working_hours w
       where w.resource_id = any (v_ids)
    ), '[]'::jsonb),
    'time_off', coalesce((
      select jsonb_agg(jsonb_build_object(
               'resource_id', o.resource_id,
               'starts_at', o.starts_at, 'ends_at', o.ends_at))
        from public.time_off o
       where o.resource_id = any (v_ids)
         and o.starts_at < _to and o.ends_at > _from
    ), '[]'::jsonb),
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object(
               'resource_id', a.resource_id,
               'blocked_from', a.blocked_from, 'blocked_to', a.blocked_to))
        from public.appointments a
       where a.resource_id = any (v_ids)
         and a.status not in ('cancelled', 'no_show')
         and a.blocked_from < _to and a.blocked_to > _from
         and (a.hold_expires_at is null or a.hold_expires_at > now())
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.booking_availability(text, uuid[], timestamptz, timestamptz) from public;
grant execute on function public.booking_availability(text, uuid[], timestamptz, timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Slot tutma (hold) — Plan 6c.
--
-- Müşteri saati seçtiği anda slot `pending` + `hold_expires_at` ile tutulur;
-- formu doldururken slot elinden alınmaz. Tutma kaydında hasta verisi yoktur:
-- ad, telefon ve rıza kayıtları onay adımında yazılır.
--
-- Kurallar burada da uygulanır — ön süre, ileri tarih sınırı, çalışma saati,
-- kaynak-hizmet eşleşmesi. İstemcideki slot listesi bir kolaylık, kapı değil.
-- -----------------------------------------------------------------------------
create or replace function public.booking_hold(
  _slug        text,
  _service_id  uuid,
  _resource_id uuid,
  _starts_at   timestamptz,
  _ip          inet default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant     public.tenants;
  v_rules      jsonb;
  v_hold_min   int;
  v_lead_min   int;
  v_advance    int;
  v_service    public.services;
  v_resource   public.resources;
  v_branch     public.branches;
  v_tz         text;
  v_ends_at    timestamptz;
  v_local      timestamp;
  v_start_min  numeric;
  v_end_min    numeric;
  v_weekday    smallint;
  v_open       boolean;
  v_token      uuid;
  v_expires    timestamptz;
begin
  select * into v_tenant
    from public.tenants t
   where t.slug = lower(btrim(_slug)) and t.status in ('trial', 'active');
  if v_tenant.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select coalesce(s.booking_rules, '{}'::jsonb) into v_rules
    from public.tenant_settings s where s.tenant_id = v_tenant.id;

  v_hold_min := coalesce((v_rules ->> 'hold_minutes')::int, 10);
  v_lead_min := coalesce((v_rules ->> 'min_lead_minutes')::int, 120);
  v_advance  := coalesce((v_rules ->> 'max_advance_days')::int, 60);

  select * into v_service
    from public.services s
   where s.id = _service_id and s.tenant_id = v_tenant.id
     and s.is_active and s.is_online_bookable;
  if v_service.id is null then
    return jsonb_build_object('ok', false, 'reason', 'service_unavailable');
  end if;

  select * into v_resource
    from public.resources r
   where r.id = _resource_id and r.tenant_id = v_tenant.id
     and r.is_active and r.is_bookable;
  if v_resource.id is null then
    return jsonb_build_object('ok', false, 'reason', 'resource_unavailable');
  end if;

  -- Hizmet-kaynak eşlemesi varsa uyulur; hiç satır yoksa "her kaynak verebilir".
  if exists (select 1 from public.service_resources sr where sr.service_id = v_service.id)
     and not exists (
       select 1 from public.service_resources sr
        where sr.service_id = v_service.id and sr.resource_id = v_resource.id
     )
  then
    return jsonb_build_object('ok', false, 'reason', 'resource_unavailable');
  end if;

  select * into v_branch from public.branches b
   where b.id = v_resource.branch_id and b.is_active;
  if v_branch.id is null then
    return jsonb_build_object('ok', false, 'reason', 'resource_unavailable');
  end if;

  v_tz := coalesce(nullif(btrim(coalesce(v_branch.timezone, '')), ''), v_tenant.timezone);
  v_ends_at := _starts_at + make_interval(mins => v_service.duration_min);

  -- Rezervasyon penceresi
  if _starts_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'in_past');
  end if;
  if _starts_at < now() + make_interval(mins => v_lead_min) then
    return jsonb_build_object('ok', false, 'reason', 'too_soon', 'min_lead_minutes', v_lead_min);
  end if;
  if (_starts_at at time zone v_tz)::date
       > ((now() at time zone v_tz)::date + v_advance) then
    return jsonb_build_object('ok', false, 'reason', 'too_far', 'max_advance_days', v_advance);
  end if;

  -- Çalışma saati kontrolü. Karşılaştırma gün başından itibaren DAKİKA
  -- üzerinden: `time` sütunu 24:00:00 kabul ediyor, `::time` cast'i gece
  -- yarısını 00:00 yapıp kapanışı yanlış geçirirdi.
  v_local     := _starts_at at time zone v_tz;
  v_weekday   := extract(dow from v_local)::smallint;
  v_start_min := extract(epoch from (v_local - date_trunc('day', v_local))) / 60;
  v_end_min   := v_start_min + v_service.duration_min;

  select exists (
    select 1 from public.working_hours w
     where w.resource_id = v_resource.id
       and w.weekday = v_weekday
       and v_start_min >= extract(epoch from w.starts_at) / 60
       and v_end_min   <= extract(epoch from w.ends_at) / 60
  ) into v_open;

  if not v_open then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if exists (
    select 1 from public.time_off o
     where o.resource_id = v_resource.id
       and o.starts_at < v_ends_at and o.ends_at > _starts_at
  ) then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  -- Kaba kuvvete karşı: aynı adresten aynı anda yaşayan tutma sayısı.
  -- Onay adımındaki telefon başına günlük sınır ayrı (booking_confirm).
  if _ip is not null and (
    select count(*) from public.appointments a
     where a.tenant_id = v_tenant.id
       and a.status = 'pending'
       and a.hold_expires_at is not null
       and a.hold_expires_at > now()
       and a.custom_data ->> 'hold_ip' = host(_ip)
  ) >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Ölü tutmalar çakışma kısıtını yanıltmasın diye yazmadan hemen önce süpürülür.
  perform private.sweep_expired_holds(v_resource.id);

  v_expires := now() + make_interval(mins => v_hold_min);

  begin
    insert into public.appointments (
      tenant_id, branch_id, resource_id, service_id,
      starts_at, ends_at, buffer_before_min, buffer_after_min,
      blocked_from, blocked_to, status, hold_expires_at, source, custom_data
    ) values (
      v_tenant.id, v_branch.id, v_resource.id, v_service.id,
      _starts_at, v_ends_at, v_service.buffer_before_min, v_service.buffer_after_min,
      _starts_at, v_ends_at, 'pending', v_expires, 'online',
      case when _ip is null then '{}'::jsonb
           else jsonb_build_object('hold_ip', host(_ip)) end
    )
    returning public_token into v_token;
  exception
    -- Çakışma kısıtı: aynı slotu iki kişi aynı anda seçti. Kısıt kazandı,
    -- uygulama kaybetti — doğrusu bu (Kural 1).
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'expires_at', v_expires,
    'starts_at', _starts_at,
    'ends_at', v_ends_at
  );
end;
$$;

revoke execute on function public.booking_hold(text, uuid, uuid, timestamptz, inet) from public;
grant execute on function public.booking_hold(text, uuid, uuid, timestamptz, inet) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Onay — hasta kaydı, randevu ve RIZA KAYITLARI tek transaction'da.
--
-- Rıza ayrı satırlarla yazılır ve metnin SÜRÜMÜ saklanır (Plan 11.4): metin
-- değişince eski rızaların hangi metne verildiği bilinmek zorunda. Aydınlatma
-- ile açık rıza AYRI kayıtlardır, tek kutuya sığdırılamaz.
--
-- Ticari ileti onayı isteğe bağlıdır ve verilmese de satırı yazılır: "onay
-- verilmedi" de kanıtlanması gereken bir olgudur (İYS).
--
-- Randevu `pending` kalır — online gelen randevuyu klinik onaylar. Doğrudan
-- `confirmed` yapmak, kliniğin görmediği bir randevuyu taahhüt saymak olurdu.
-- -----------------------------------------------------------------------------
create or replace function public.booking_confirm(
  _token      uuid,
  _full_name  text,
  _phone      text,
  _email      text default null,
  _note       text default null,
  _consents   jsonb default '[]'::jsonb,
  _ip         inet default null,
  _user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_tenant      public.tenants;
  v_name        text := btrim(coalesce(_full_name, ''));
  v_phone       text := nullif(btrim(coalesce(_phone, '')), '');
  v_email       text := nullif(btrim(coalesce(_email, '')), '');
  v_customer    uuid;
  v_item        jsonb;
  v_kind        text;
  v_daily       int;
begin
  select * into v_appointment
    from public.appointments a where a.public_token = _token;

  if v_appointment.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Zaten onaylanmış: kullanıcı geri tuşuna bastı ya da formu iki kez yolladı.
  -- İkinci bir randevu açmak yerine aynı randevuya götürülür.
  if v_appointment.hold_expires_at is null then
    return jsonb_build_object('ok', true, 'reason', 'already_confirmed', 'token', _token);
  end if;

  if v_appointment.hold_expires_at < now() then
    delete from public.appointments where id = v_appointment.id;
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if length(v_name) < 2 or length(v_name) > 160 then
    return jsonb_build_object('ok', false, 'reason', 'name_invalid');
  end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return jsonb_build_object('ok', false, 'reason', 'phone_invalid');
  end if;

  -- Aydınlatma ve açık rıza zorunlu; ikisi de sürümüyle birlikte gelmeli.
  for v_kind in select unnest(array['kvkk_aydinlatma', 'acik_riza_saglik']) loop
    if not exists (
      select 1 from jsonb_array_elements(coalesce(_consents, '[]'::jsonb)) c
       where c ->> 'kind' = v_kind
         and (c ->> 'granted')::boolean is true
         and length(coalesce(c ->> 'text_version', '')) between 1 and 40
    ) then
      return jsonb_build_object('ok', false, 'reason', 'consent_required');
    end if;
  end loop;

  select * into v_tenant from public.tenants t where t.id = v_appointment.tenant_id;

  -- Spam freni: aynı numaradan aynı gün en fazla üç online randevu (Plan 6c).
  select count(*) into v_daily
    from public.appointments a
    join public.customers c on c.id = a.customer_id
   where a.tenant_id = v_appointment.tenant_id
     and a.source = 'online'
     and a.status not in ('cancelled', 'no_show')
     and c.phone = v_phone
     and a.created_at > now() - interval '1 day';

  if v_daily >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  -- Telefon kurum içinde hastanın pratikteki kimliği: aynı numara kayıtlıysa
  -- ikinci kart açılmaz (create_appointment ile aynı kural).
  select c.id into v_customer
    from public.customers c
   where c.tenant_id = v_appointment.tenant_id and c.phone = v_phone and c.is_active
   limit 1;

  if v_customer is null then
    insert into public.customers (tenant_id, branch_id, full_name, phone, email, source)
    values (v_appointment.tenant_id, v_appointment.branch_id, v_name, v_phone, v_email, 'online')
    returning id into v_customer;
  elsif v_email is not null then
    -- Var olan kaydın adı DEĞİŞTİRİLMEZ (panelde düzeltilmiş olabilir);
    -- yalnız boş duran e-posta doldurulur.
    update public.customers
       set email = coalesce(email, v_email)
     where id = v_customer;
  end if;

  update public.appointments
     set customer_id     = v_customer,
         notes           = nullif(btrim(coalesce(_note, '')), ''),
         hold_expires_at = null,
         custom_data     = custom_data - 'hold_ip'
   where id = v_appointment.id;

  -- Rıza kayıtları: her tür ayrı satır, metin sürümüyle. Reddedilen ticari
  -- ileti onayı da yazılır.
  for v_item in select * from jsonb_array_elements(coalesce(_consents, '[]'::jsonb)) loop
    if (v_item ->> 'kind') in ('kvkk_aydinlatma', 'acik_riza_saglik', 'ticari_ileti', 'cerez') then
      insert into public.consents (
        tenant_id, customer_id, kind, text_version, granted, ip, user_agent, channel
      ) values (
        v_appointment.tenant_id, v_customer,
        (v_item ->> 'kind')::public.consent_kind,
        left(coalesce(v_item ->> 'text_version', 'bilinmiyor'), 40),
        coalesce((v_item ->> 'granted')::boolean, false),
        _ip, left(coalesce(_user_agent, ''), 400), 'online_booking'
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'token', _token);
end;
$$;

revoke execute on function public.booking_confirm(uuid, text, text, text, text, jsonb, inet, text) from public;
grant execute on function public.booking_confirm(uuid, text, text, text, text, jsonb, inet, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Randevunun public görünümü. Bağlantıdaki token sırdır: onu bilen randevuyu
-- alan kişidir. Yine de dışarı yalnız o randevunun kendi bilgileri çıkar —
-- hasta kartı, not ya da başka randevu değil.
-- -----------------------------------------------------------------------------
create or replace function public.booking_lookup(_token uuid)
returns jsonb
language sql
security definer
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', true,
    'token', a.public_token,
    'status', a.status,
    -- tutma hâlâ yaşıyorsa form adımındayız; boşsa randevu onaylanmış
    'hold_expires_at', a.hold_expires_at,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'timezone', coalesce(nullif(btrim(coalesce(b.timezone, '')), ''), t.timezone),
    'cancel_window_minutes',
      coalesce((s.booking_rules ->> 'cancel_window_minutes')::int, 240),
    'tenant', jsonb_build_object('name', t.name, 'slug', t.slug),
    'branch', jsonb_build_object('name', b.name, 'address', b.address, 'phone', b.phone),
    'service', case when sv.id is null then null
                    else jsonb_build_object('id', sv.id, 'name', sv.name,
                                            'duration_min', sv.duration_min) end,
    'resource', jsonb_build_object('name', r.name, 'title', r.title),
    'customer', case when c.id is null then null
                     else jsonb_build_object('full_name', c.full_name, 'phone', c.phone) end
  )
  from public.appointments a
  join public.tenants t  on t.id = a.tenant_id
  join public.branches b on b.id = a.branch_id
  join public.resources r on r.id = a.resource_id
  left join public.tenant_settings s on s.tenant_id = a.tenant_id
  left join public.services sv on sv.id = a.service_id
  left join public.customers c on c.id = a.customer_id
  where a.public_token = _token;
$$;

revoke execute on function public.booking_lookup(uuid) from public;
grant execute on function public.booking_lookup(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Müşterinin kendi randevusunu iptali. İptal penceresi kurumun kuralı:
-- "dört saat kala iptal edilemez" telefonla aranmayı gerektirir, çünkü o saat
-- artık doldurulamaz.
--
-- Durum yan etkileri (cancelled_at damgası) trigger'da; burada tekrarlanmaz.
-- -----------------------------------------------------------------------------
create or replace function public.booking_cancel(_token uuid, _reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_window      int;
begin
  select * into v_appointment
    from public.appointments a where a.public_token = _token;

  if v_appointment.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_appointment.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'reason', 'already_cancelled');
  end if;

  if v_appointment.status in ('arrived', 'completed', 'no_show') then
    return jsonb_build_object('ok', false, 'reason', 'not_cancellable');
  end if;

  select coalesce((s.booking_rules ->> 'cancel_window_minutes')::int, 240) into v_window
    from public.tenant_settings s where s.tenant_id = v_appointment.tenant_id;

  -- Onaylanmamış tutma her zaman bırakılabilir: henüz randevu bile değil.
  if v_appointment.hold_expires_at is null
     and v_appointment.starts_at < now() + make_interval(mins => coalesce(v_window, 240))
  then
    return jsonb_build_object('ok', false, 'reason', 'cancel_window',
                              'cancel_window_minutes', coalesce(v_window, 240));
  end if;

  update public.appointments
     set status           = 'cancelled',
         cancelled_reason = nullif(btrim(coalesce(_reason, '')), '')
   where id = v_appointment.id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.booking_cancel(uuid, text) from public;
grant execute on function public.booking_cancel(uuid, text) to anon, authenticated;
