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
