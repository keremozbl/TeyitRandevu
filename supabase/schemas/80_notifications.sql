-- =============================================================================
-- 80_notifications — bildirim altyapısı: şablon, akış, outbox
-- =============================================================================
-- Plan Bölüm 7. No-show'u düşüren özellik burası; ürünün satış argümanı da.
--
-- Üç tablo, üç ayrı iş:
--
--   message_templates   ne yazacağız        (metin + hukuki etiket)
--   notification_flows  ne zaman yollayacağız (tetikleyici + offset + kanal)
--   notifications       outbox: kime, ne zaman, gitti mi
--
-- Neden outbox: randevu yazan transaction içinde SMS gönderilmez (Plan 6c
-- sonu). Harici çağrı kilit tutar, yavaşlar ve hata verdiğinde randevuyu da
-- geri alır. Satır yazılır, transaction kapanır, kuyruk sonra gönderir.
--
-- Neden kuyruğa yazan kod veritabanında: randevuyu panel de açıyor, public
-- sayfa da, ileride IVR de. Üç yerde tekrarlanan bir kural er geç ikisinde
-- doğru birinde yanlış olur — durum yan etkilerinde olduğu gibi (50_appointments).
--
-- HUKUKİ AYRIM (CLAUDE.md kural 7): her şablon "hizmet bilgilendirmesi" ya da
-- "ticari ileti" olarak etiketlenir. Ticari olan, İYS onayı olmadan
-- GÖNDERİLEMEZ ve bu kısıt burada, veritabanında uygulanır — arayüzde değil.
-- Onayı olmayan ticari ileti kuyruğa `skipped` olarak düşer: sessizce yok
-- olmaz, kurum niçin gitmediğini görür.

create type public.notification_channel as enum ('sms', 'whatsapp', 'email', 'voice');

-- Hizmet bilgilendirmesi ile ticari iletinin farkı 6563 sayılı Kanun'dan gelir:
-- ilki randevunun ifasının parçası, ikincisi pazarlama. İkisi tek tabloda ama
-- ASLA tek etikette olamaz.
create type public.message_kind as enum ('service', 'commercial');

create type public.notification_status as enum (
  'scheduled',   -- kuyrukta, zamanı bekliyor
  'sending',     -- bir worker aldı (claimed)
  'sent',
  'failed',
  'cancelled',   -- randevu değişti/iptal oldu, gönderilmeden düştü
  'skipped'      -- kural gereği gönderilmedi: onay yok, adres yok, zamanı geçmiş
);

create type public.flow_trigger as enum (
  'appointment_created',
  'before_start',
  'after_end',
  'no_show',
  'birthday'
);

-- -----------------------------------------------------------------------------
-- Şablonlar — tenant'ın kendi metinleri, değişkenli.
-- Sektör şablonundan KOPYALANIR (Plan Bölüm 4): sonradan platform metni
-- değişirse mevcut kurumun mesajı değişmez.
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  key        text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name       text not null check (length(btrim(name)) between 2 and 120),
  channel    public.notification_channel not null,
  kind       public.message_kind not null default 'service',
  subject    text,                       -- yalnız e-posta
  body       text not null check (length(btrim(body)) between 2 and 1600),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

create index message_templates_tenant_idx on public.message_templates (tenant_id);

create trigger message_templates_set_updated_at
  before update on public.message_templates
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Akışlar — "24 saat önce WhatsApp" bir satırdır, bir kod dalı değil (Plan 7.4).
-- Yeni bir hatırlatma tipi eklemek dağıtım gerektirmez.
-- -----------------------------------------------------------------------------
create table public.notification_flows (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  name           text not null check (length(btrim(name)) between 2 and 120),
  trigger        public.flow_trigger not null,
  -- Tetikleyici ana göre kayma. Negatif = önce: -1440 "bir gün önce" demek.
  offset_minutes int not null default 0 check (offset_minutes between -43200 and 43200),
  channel        public.notification_channel not null,
  template_id    uuid not null references public.message_templates (id) on delete cascade,
  -- "yalnız ilk kez gelen hastalara" gibi kurallar; şimdilik okunmuyor
  condition      jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  -- pakete bağlı özellikler ('voice' gibi); boşsa herkese açık (Plan 7.6)
  requires_feature text,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index notification_flows_tenant_idx on public.notification_flows (tenant_id, trigger)
  where is_active;
create index notification_flows_template_idx on public.notification_flows (template_id);

create trigger notification_flows_set_updated_at
  before update on public.notification_flows
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Outbox.
--
-- `to_address` ve `payload` gönderim anında değil KUYRUĞA GİRERKEN donar:
-- hasta telefonunu değiştirirse eski kuyruk satırı eski numaraya gitmeli mi
-- sorusunun cevabı "hayır" olurdu ama asıl sebep başka — mesajın içeriği
-- randevunun o anki hâlini anlatır, gönderim anındaki hâlini değil.
--
-- `kind` şablondan KOPYALANIR: şablon sonradan ticari yapılırsa kuyrukta
-- bekleyen hizmet bilgilendirmesi ticari iletiye dönüşmez.
-- -----------------------------------------------------------------------------
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  -- Yetki kapsamı için denormalize: politika appointments'a join atmasın
  branch_id      uuid references public.branches (id) on delete cascade,
  resource_id    uuid references public.resources (id) on delete set null,
  customer_id    uuid references public.customers (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete cascade,
  flow_id        uuid references public.notification_flows (id) on delete set null,
  template_id    uuid references public.message_templates (id) on delete set null,

  channel        public.notification_channel not null,
  kind           public.message_kind not null,
  status         public.notification_status not null default 'scheduled',

  scheduled_at   timestamptz not null,
  to_address     text,
  payload        jsonb not null default '{}'::jsonb,

  -- Gönderilen metnin kendisi: şablon sonradan değişse de ne gittiği bilinir.
  -- Uyuşmazlıkta "biz hatırlattık" iddiasının kanıtı bu sütun.
  rendered_subject text,
  rendered_body    text,

  attempt_count  int not null default 0,
  last_error     text,
  provider       text,
  provider_ref   text,
  cost           numeric(12,4) check (cost is null or cost >= 0),

  claimed_at     timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Aynı randevu + aynı akış iki kez kuyruğa girmez. Randevu saati değişince
  -- gönderilmemiş satır silinip yeniden yazılır.
  unique (appointment_id, flow_id)
);

-- Worker'ın sıcak yolu: zamanı gelmiş, bekleyen satırlar
create index notifications_due_idx on public.notifications (scheduled_at)
  where status = 'scheduled';

create index notifications_tenant_idx      on public.notifications (tenant_id, scheduled_at desc);
create index notifications_appointment_idx on public.notifications (appointment_id);
create index notifications_customer_idx    on public.notifications (customer_id);

create trigger notifications_set_updated_at
  before update on public.notifications
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- İYS kapısı: ticari ileti onayı var mı?
--
-- Rıza kayıtları değişmez, iptal ayrı satırla yapılır (40_customers). Bu yüzden
-- "onay var mı" sorusunun cevabı EN SON satırdır: önce onay verip sonra
-- reddeden hastaya ticari ileti gönderilemez.
-- -----------------------------------------------------------------------------
create or replace function private.has_commercial_consent(_customer_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select c.granted and c.revoked_at is null
       from public.consents c
      where c.customer_id = _customer_id
        and c.kind = 'ticari_ileti'
      order by c.granted_at desc
      limit 1),
    false
  );
$$;

-- Yalnız `security definer` fonksiyonlar ve tetikleyiciler çağırıyor; onlar
-- sahibi adına çalıştığı için kimseye ayrıca EXECUTE vermek gerekmiyor.
revoke execute on function private.has_commercial_consent(uuid) from public, anon;

-- -----------------------------------------------------------------------------
-- Randevunun bildirimlerini kuyruğa yazar.
--
-- `security definer`: kuyruğa yazma bir YAN ETKİDİR, kullanıcının yetkisi
-- değil. Public sayfadan randevu alan hasta `anon`dur ve notifications
-- tablosunda hiçbir yetkisi yoktur; hatırlatması yine de kuyruğa girmelidir.
--
-- Idempotent: gönderilmemiş satırları silip yeniden yazar. Randevu saati
-- değiştiğinde eski hatırlatma yanlış saati söylerdi.
-- -----------------------------------------------------------------------------
create or replace function private.queue_appointment_notifications(
  _appointment_id uuid,
  _include_created boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app      public.appointments;
  v_tenant   public.tenants;
  v_branch   public.branches;
  v_customer public.customers;
  v_service  text;
  v_resource text;
  v_tz       text;
  v_flow     record;
  v_when     timestamptz;
  v_address  text;
  v_status   public.notification_status;
  v_error    text;
  v_payload  jsonb;
begin
  select * into v_app from public.appointments a where a.id = _appointment_id;
  if v_app.id is null then
    return;
  end if;

  -- Randevu iptal edildiyse bekleyen her mesaj düşer — ama silinmez:
  -- kurum "hatırlatma niçin gitmedi" sorusunun cevabını ekranda görmeli.
  if v_app.status = 'cancelled' then
    update public.notifications
       set status = 'cancelled', last_error = 'Randevu iptal edildi'
     where appointment_id = _appointment_id and status = 'scheduled';
    return;
  end if;

  -- Tutma henüz randevu değil (public sayfada form dolduruluyor); hastanın
  -- kaydı bile yok. Onay adımı bu fonksiyonu yeniden çağıracak.
  if v_app.hold_expires_at is not null or v_app.customer_id is null then
    return;
  end if;

  -- Gönderilmemiş hatırlatmalar düşer ve aşağıda yeniden kurulur: randevu
  -- saati değiştiyse eski metin yanlış saati söyler.
  --
  -- "Randevunuz oluşturuldu" mesajı bunun DIŞINDA: o randevunun ilk yazılma
  -- anına aittir ve güncellemede yeniden üretilmez. Silinseydi, oluşturup
  -- hemen düzenleyen resepsiyon hastaya hiç teyit göndermemiş olurdu.
  delete from public.notifications n
   using public.notification_flows f
   where n.appointment_id = _appointment_id
     and n.status = 'scheduled'
     and f.id = n.flow_id
     and (_include_created or f.trigger <> 'appointment_created');

  select * into v_tenant   from public.tenants   t where t.id = v_app.tenant_id;
  select * into v_branch   from public.branches  b where b.id = v_app.branch_id;
  select * into v_customer from public.customers c where c.id = v_app.customer_id;

  select s.name into v_service from public.services s where s.id = v_app.service_id;
  select btrim(concat_ws(' ', r.title, r.name)) into v_resource
    from public.resources r where r.id = v_app.resource_id;

  v_tz := coalesce(nullif(btrim(coalesce(v_branch.timezone, '')), ''), v_tenant.timezone);

  -- Metnin değişkenleri. Tarih ve saat BURADA BİÇİMLENDİRİLMEZ: Türkçe tarih
  -- biçimi Intl'in işi (CLAUDE.md kural 6), SQL yalnız ham anı ve zaman
  -- dilimini taşır.
  v_payload := jsonb_build_object(
    'musteri_adi',  v_customer.full_name,
    'kurum_adi',    v_tenant.name,
    'sube_adi',     v_branch.name,
    'sube_adresi',  v_branch.address,
    'sube_telefon', v_branch.phone,
    'hekim_adi',    v_resource,
    'hizmet_adi',   v_service,
    'baslangic',    v_app.starts_at,
    'bitis',        v_app.ends_at,
    'zaman_dilimi', v_tz,
    -- Public randevu sayfasının yolu; tam adresi gönderim anında uygulama kurar
    'randevu_yolu', '/r/' || v_tenant.slug || '/randevu/' || v_app.public_token
  );

  for v_flow in
    select f.id, f.trigger, f.offset_minutes, f.channel, f.template_id,
           t.kind, t.is_active as template_active
      from public.notification_flows f
      join public.message_templates t on t.id = f.template_id
     where f.tenant_id = v_app.tenant_id
       and f.is_active
       and t.is_active
       and f.trigger in ('appointment_created', 'before_start', 'after_end', 'no_show')
  loop
    -- Zamanı
    v_when := case v_flow.trigger
      when 'appointment_created' then now()
      when 'before_start'        then v_app.starts_at + make_interval(mins => v_flow.offset_minutes)
      when 'after_end'           then v_app.ends_at   + make_interval(mins => v_flow.offset_minutes)
      when 'no_show'             then now()
    end;

    -- Oluşturma bildirimi yalnız randevu ilk yazıldığında; güncellemede değil.
    if v_flow.trigger = 'appointment_created' and not _include_created then
      continue;
    end if;

    -- "Gelmedi" akışı yalnız o duruma geçildiğinde.
    if v_flow.trigger = 'no_show' and v_app.status <> 'no_show' then
      continue;
    end if;
    if v_flow.trigger <> 'no_show' and v_app.status = 'no_show' then
      continue;
    end if;

    -- Zamanı geçmiş hatırlatma kuyruğa girmez: iki saat kala alınan randevu
    -- için "yarın randevunuz var" mesajı üretmenin anlamı yok.
    if v_when < now() - interval '5 minutes' then
      continue;
    end if;

    v_address := case v_flow.channel
      when 'email' then v_customer.email
      else v_customer.phone
    end;

    v_status := 'scheduled';
    v_error  := null;

    if v_address is null then
      v_status := 'skipped';
      v_error  := case v_flow.channel
        when 'email' then 'Hastanın e-posta adresi yok'
        else 'Hastanın telefon numarası yok'
      end;
    elsif v_flow.kind = 'commercial'
          and not private.has_commercial_consent(v_app.customer_id) then
      -- CLAUDE.md kural 7: ticari ileti İYS onayı olmadan gönderilemez.
      -- Satır yine de yazılır ki kurum niçin gitmediğini görebilsin.
      v_status := 'skipped';
      v_error  := 'Ticari ileti onayı yok (İYS)';
    end if;

    insert into public.notifications (
      tenant_id, branch_id, resource_id, customer_id, appointment_id,
      flow_id, template_id, channel, kind, status, scheduled_at,
      to_address, payload, last_error
    ) values (
      v_app.tenant_id, v_app.branch_id, v_app.resource_id, v_app.customer_id, v_app.id,
      v_flow.id, v_flow.template_id, v_flow.channel, v_flow.kind, v_status, v_when,
      v_address, v_payload, v_error
    )
    on conflict (appointment_id, flow_id) do nothing;
  end loop;
end;
$$;

revoke execute on function private.queue_appointment_notifications(uuid, boolean) from public, anon;

-- -----------------------------------------------------------------------------
-- Tetikleyiciler. Randevuyu kim yazarsa yazsın kuyruk dolar.
-- -----------------------------------------------------------------------------
create or replace function private.appointments_queue_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.queue_appointment_notifications(new.id, tg_op = 'INSERT');
  return null;
end;
$$;

create trigger appointments_notify_insert
  after insert on public.appointments
  for each row execute function private.appointments_queue_notifications();

-- Saat, kaynak, hasta ya da durum değişince kuyruk yeniden kurulur. `notes`
-- değişikliği tetiklemez: mesajın içeriğine girmiyor.
create trigger appointments_notify_update
  after update of starts_at, ends_at, status, customer_id, resource_id, hold_expires_at
  on public.appointments
  for each row execute function private.appointments_queue_notifications();

-- -----------------------------------------------------------------------------
-- Worker'ın kuyruktan satır alması.
--
-- `for update skip locked`: iki worker aynı anda çalışsa bile aynı mesajı iki
-- kez göndermez — kilitli satırı ikinci worker atlar. Bu, kuyruk desenindeki
-- tek kritik satırdır (Plan 7.1).
--
-- İYS kapısı burada TEKRAR kontrol edilir: satır kuyruğa girdikten sonra hasta
-- onayını geri almış olabilir. Rızanın geri alınması bekleyen mesajı da
-- durdurmalı.
-- -----------------------------------------------------------------------------
create or replace function public.claim_notifications(_limit int default 20)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.notifications n
     set status        = 'sending',
         claimed_at    = now(),
         attempt_count = n.attempt_count + 1
   where n.id in (
     select d.id
       from public.notifications d
      where d.status = 'scheduled'
        and d.scheduled_at <= now()
        and d.to_address is not null
        and (
          d.kind = 'service'
          or (d.customer_id is not null and private.has_commercial_consent(d.customer_id))
        )
      order by d.scheduled_at
      for update skip locked
      limit greatest(coalesce(_limit, 20), 1)
   )
  returning n.*;
end;
$$;

-- Bu fonksiyon `public` şemada çünkü PostgREST yalnızca onu dışa açıyor ve
-- worker'ın çağırabilmesi gerek. Korumayı şema değil YETKİ sağlıyor: EXECUTE
-- yalnız `service_role`da, yani yalnızca sunucudaki güvenilir kodda. `anon` ya
-- da `authenticated` bir JWT ile çağırırsa "permission denied" alır.
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_notifications(int) to service_role;

-- -----------------------------------------------------------------------------
-- Sektör şablonundaki varsayılan bildirimlerin kuruma kopyalanması.
--
-- Şablon REFERANS DEĞİL KOPYA (Plan Bölüm 4): platform metni sonradan
-- değişirse kurumun mesajı değişmez. Metinler `src/lib/templates/*.json`
-- içinde durur ve buraya `_defaults` olarak gelir — Türkçe pazarlama metni
-- migration dosyasına gömülmez.
--
-- Kurum başına bir kez: zaten akışı olan kuruma dokunmaz, çünkü kurum kendi
-- metnini düzenlemiş olabilir.
--
-- `public` şemada ama EXECUTE yalnız `service_role`da: PostgREST sadece
-- `public`i açıyor ve demo/destek betiklerinin çağırabilmesi gerekiyor.
-- -----------------------------------------------------------------------------
create or replace function public.install_notification_defaults(
  _tenant   uuid,
  _defaults jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item     jsonb;
  v_template uuid;
  v_kind     public.message_kind;
  v_order    int := 0;
  v_count    int := 0;
begin
  if exists (select 1 from public.notification_flows f where f.tenant_id = _tenant) then
    return 0;
  end if;

  for v_item in select jsonb_array_elements(coalesce(_defaults, '[]'::jsonb))
  loop
    v_kind := case
      when coalesce((v_item ->> 'is_commercial')::boolean, false) then 'commercial'
      else 'service'
    end;

    insert into public.message_templates (tenant_id, key, name, channel, kind, subject, body)
    values (
      _tenant,
      v_item ->> 'key',
      v_item ->> 'name',
      (v_item ->> 'channel')::public.notification_channel,
      v_kind,
      v_item ->> 'subject',
      v_item ->> 'body'
    )
    on conflict (tenant_id, key) do update set name = excluded.name
    returning id into v_template;

    v_order := v_order + 10;

    insert into public.notification_flows (
      tenant_id, name, trigger, offset_minutes, channel, template_id, sort_order, is_active
    ) values (
      _tenant,
      v_item ->> 'name',
      (v_item ->> 'trigger')::public.flow_trigger,
      coalesce((v_item ->> 'offset_minutes')::int, 0),
      (v_item ->> 'channel')::public.notification_channel,
      v_template,
      v_order,
      -- Doğum günü akışı KAPALI kurulur: onu tetikleyecek günlük tarama henüz
      -- yok. Açık görünüp çalışmayan bir akış, kurumun gönderdiğini sandığı
      -- ama gitmeyen mesaj demektir.
      (v_item ->> 'trigger') <> 'birthday'
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.install_notification_defaults(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.install_notification_defaults(uuid, jsonb) to service_role;
