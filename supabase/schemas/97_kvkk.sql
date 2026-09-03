-- =============================================================================
-- 97_kvkk — saklama ve imha: kaydın anonimleştirilmesi
-- =============================================================================
-- KVKK m.7: sebebi ortadan kalkan kişisel veri silinir, YOK EDİLİR ya da
-- ANONİM HALE GETİRİLİR. Üçünden üçüncüsünü seçiyoruz ve sebebi ürünün kendi
-- gerçeği: randevu geçmişi aynı zamanda ticari bir kayıt (Plan 11.4). Satırı
-- tamamen silmek, kliniğin cirosunu ve vergi kaydını da silmek demek.
--
-- Bu yüzden anonimleştirme şunu yapıyor: kişiyi tanımlayan her şeyi kaydın
-- İÇİNDEN çıkarıyor, kaydın kendisini bırakıyor. Randevu duruyor, o randevuya
-- kimin geldiği artık bilinmiyor.
--
-- Neden `security definer`: temizlenecek tabloların bir kısmında bilerek
-- UPDATE/DELETE politikası YOK (`consents` düzeltilemez, `notifications`
-- kullanıcı tarafından değiştirilemez). Invoker olarak çalışan bir fonksiyon
-- o satırlara dokunamaz ve sessizce sıfır satır günceller — imha yapıldı
-- sanılır. Yetki bu yüzden fonksiyonun BAŞINDA açıkça kontrol ediliyor.
--
-- Geri alınamaz. Arayüz bunu iki adımda soruyor ve işlem denetim kaydına
-- düşüyor.

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

  -- 1. Sağlık verisi: saklanacak bir tarafı yok, siliniyor.
  delete from public.customer_medical_notes
   where customer_id = _customer_id and tenant_id = _tenant_id;

  -- 2. Bekleme listesi kaydı bir tercih beyanıdır; kişiyle birlikte gider.
  delete from public.waitlist_entries
   where customer_id = _customer_id and tenant_id = _tenant_id;

  -- 3. Randevular KALIYOR (ticari kayıt) ama üzerindeki serbest metin ve
  --    sektöre özel alanlar kişiyi anlatabilir: diş no, şikâyet, idari not.
  update public.appointments
     set notes = null,
         custom_data = '{}'::jsonb
   where customer_id = _customer_id and tenant_id = _tenant_id;

  -- 4. Gönderilen mesajın metni adı ve telefonu taşıyor. "Biz hatırlattık"
  --    kanıtı olarak satır kalıyor, içeriği gidiyor.
  update public.notifications
     set to_address = null,
         rendered_subject = null,
         rendered_body = null,
         payload = '{}'::jsonb
   where customer_id = _customer_id and tenant_id = _tenant_id;

  -- 5. Rıza kaydı KALIYOR: hangi metne, ne zaman, hangi kanaldan onay
  --    verildiği işlemenin hukuki dayanağının kanıtı. Ama IP ve tarayıcı
  --    imzası kişinin kendi verisi ve imhadan sonra tutulacak bir sebebi yok.
  update public.consents
     set ip = null,
         user_agent = null
   where customer_id = _customer_id and tenant_id = _tenant_id;

  -- 6. Kaydın kendisi. Ad zorunlu ve en az iki karakter olmak zorunda
  --    (check kısıtı), o yüzden boş bırakılmıyor; kimseyi göstermeyen sabit
  --    bir metne dönüyor.
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

-- =============================================================================
-- Silme talepleri
-- =============================================================================
-- İmha yolu açıldı ama TALEBİN KENDİSİ hiçbir yere yazılmıyordu: kişi arıyor,
-- personel düğmeye basıyor, geriye kayıt kalmıyor. Denetimde sorulan tam olarak
-- bu: talep ne zaman geldi, kim başvurdu, ne zaman cevaplandı? KVKK m.13 cevabı
-- **otuz gün** içinde vermeyi zorunlu tutuyor ve bunun kanıtı gerekiyor.
--
-- Tablo o kanıttır. Talebin nasıl geldiği (`channel`) önemli: telefonla gelen
-- talebi personel elle giriyor, randevu sayfasından gelen kendi düşüyor.

-- Tip zaten varsa (yarım kalmış bir migration) yeniden yaratmaya çalışma.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'erasure_status') then
    create type public.erasure_status as enum ('yeni', 'islendi', 'reddedildi');
  end if;
end
$$;

create table public.erasure_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  -- Eşleşen kayıt bulunduysa dolu: tek tıkla anonimleştirmeyi bu sağlıyor.
  -- Telefonla gelen talepte önce boş olabilir, personel sonra eşleştirir.
  customer_id   uuid references public.customers (id) on delete set null,

  -- Başvuranın beyanı. Kayıt eşleşmese bile kimin başvurduğu yazılı kalmalı.
  full_name     text not null check (length(btrim(full_name)) between 2 and 160),
  phone         public.phone_e164,
  email         public.email_address,
  note          text,

  channel       text not null check (channel in ('randevu_sayfasi', 'telefon', 'eposta', 'kapida')),
  status        public.erasure_status not null default 'yeni',

  -- KVKK m.13: en geç otuz gün. Sayaç ekranda buradan çiziliyor.
  --
  -- `generated always as (created_at + interval '30 days')` DEĞİL: timestamptz
  -- ile interval toplamı oturumun zaman dilimine bağlı olduğu için Postgres
  -- onu immutable saymıyor ve tabloyu yaratmıyor. Varsayılan olarak yazmak
  -- aynı sonucu veriyor; değer satır yazılırken bir kez hesaplanıyor.
  due_at        timestamptz not null default (now() + interval '30 days'),

  resolution    text,
  resolved_at   timestamptz,
  resolved_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index erasure_requests_tenant_idx on public.erasure_requests (tenant_id, status, created_at desc);
create index erasure_requests_customer_idx on public.erasure_requests (customer_id);

-- Aynı kişi için açık talep bir tane: düğmeye iki kez basmak iki satır
-- üretmesin, personel aynı işi iki kez görmesin.
create unique index erasure_requests_open_customer_idx
  on public.erasure_requests (customer_id)
  where status = 'yeni' and customer_id is not null;

alter table public.erasure_requests enable row level security;
alter table public.erasure_requests force row level security;
grant select, insert, update on public.erasure_requests to authenticated;

-- Talep, kişinin adını ve telefonunu taşıyor: imha yetkisi olan görüyor.
-- `customer.erase` zaten yalnızca sahip ve yöneticide.
create policy erasure_requests_read on public.erasure_requests
  for select to authenticated
  using ( (select private.allows('customer.erase', tenant_id)) );

create policy erasure_requests_insert on public.erasure_requests
  for insert to authenticated
  with check ( (select private.allows('customer.erase', tenant_id)) );

create policy erasure_requests_update on public.erasure_requests
  for update to authenticated
  using      ( (select private.allows('customer.erase', tenant_id)) )
  with check ( (select private.allows('customer.erase', tenant_id)) );

-- -----------------------------------------------------------------------------
-- Randevu sayfasından talep
--
-- `anon` rolüne tabloda yetki YOK (CLAUDE.md kural 8); tek kapı bu fonksiyon.
-- Kimlik doğrulaması gerekmiyor çünkü token zaten kişiye ait: bağlantı SMS ile
-- ona gitti ve randevusunu görüntülemesini de o sağlıyor.
-- -----------------------------------------------------------------------------

create or replace function public.booking_request_erasure(_token uuid, _note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_customer    public.customers;
begin
  select * into v_appointment
    from public.appointments a where a.public_token = _token;

  if v_appointment.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_appointment.customer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_customer
    from public.customers c where c.id = v_appointment.customer_id;

  if v_customer.anonymized_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_anonymized');
  end if;

  -- Açık talep zaten varsa yenisi açılmıyor; kişi düğmeye tekrar bastıysa
  -- cevabı "talebiniz duruyor" olmalı, ikinci bir satır değil.
  if exists (
    select 1 from public.erasure_requests r
     where r.customer_id = v_customer.id and r.status = 'yeni'
  ) then
    return jsonb_build_object('ok', true, 'reason', 'already_open');
  end if;

  insert into public.erasure_requests (
    tenant_id, customer_id, full_name, phone, email, note, channel
  )
  values (
    v_customer.tenant_id, v_customer.id, v_customer.full_name, v_customer.phone,
    v_customer.email, nullif(btrim(coalesce(_note, '')), ''), 'randevu_sayfasi'
  );

  return jsonb_build_object('ok', true, 'reason', 'created');
end;
$$;

revoke all on function public.booking_request_erasure(uuid, text) from public;
grant execute on function public.booking_request_erasure(uuid, text) to anon, authenticated;

comment on function public.booking_request_erasure(uuid, text) is
  'Randevu bağlantısındaki token ile silme talebi bırakır. Kimlik doğrulaması '
  'token''ın kendisidir; anon rolünün tabloda yetkisi yoktur.';
