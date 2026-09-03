-- =============================================================================
-- seed.sql — izin kataloğu ve rol şablonları
-- =============================================================================
-- Bunlar global veridir, tenant'a ait değildir. Onboarding sırasında rol
-- şablonları kurumun kendi rollerine KOPYALANIR; şablon sonradan değişirse
-- mevcut kurumlar etkilenmez.

-- -----------------------------------------------------------------------------
-- İzin kataloğu
-- -----------------------------------------------------------------------------
insert into public.permissions (key, category, label, scopes, sort_order) values
  ('tenant.manage',                'kurum',    'Kurum bilgilerini düzenle',        array['tenant']::public.permission_scope[],                 10),
  ('settings.manage',              'kurum',    'Ayarları ve şablonları yönet',     array['tenant']::public.permission_scope[],                 20),
  ('branch.manage',                'kurum',    'Şube ve bölüm yönetimi',           array['tenant']::public.permission_scope[],                 30),
  ('billing.manage',               'kurum',    'Abonelik ve faturalama',           array['tenant']::public.permission_scope[],                 40),
  ('audit.read',                   'kurum',    'Denetim kayıtlarını görüntüle',    array['tenant']::public.permission_scope[],                 50),

  ('staff.manage',                 'ekip',     'Personel ekle ve düzenle',         array['tenant','branch']::public.permission_scope[],       110),
  ('role.manage',                  'ekip',     'Rol ve yetki düzenle',             array['tenant']::public.permission_scope[],                120),

  ('resource.read',                'kaynak',   'Hekim ve kaynakları görüntüle',    array['tenant','branch','own']::public.permission_scope[], 210),
  ('resource.manage',              'kaynak',   'Kaynak ve çalışma saati yönet',    array['tenant','branch','own']::public.permission_scope[], 220),
  ('service.manage',               'kaynak',   'Hizmet ve fiyat yönet',            array['tenant']::public.permission_scope[],                230),

  ('appointment.read',             'randevu',  'Randevuları görüntüle',            array['tenant','branch','own']::public.permission_scope[], 310),
  ('appointment.write',            'randevu',  'Randevu oluştur ve değiştir',      array['tenant','branch','own']::public.permission_scope[], 320),

  ('customer.read',                'hasta',    'Hasta kayıtlarını görüntüle',      array['tenant','branch']::public.permission_scope[],       410),
  ('customer.write',               'hasta',    'Hasta kaydı oluştur ve düzenle',   array['tenant','branch']::public.permission_scope[],       420),
  ('customer.medical_notes.read',  'hasta',    'Tıbbi notları görüntüle',          array['tenant','branch','own']::public.permission_scope[], 430),
  ('customer.medical_notes.write', 'hasta',    'Tıbbi not yaz',                    array['tenant','branch','own']::public.permission_scope[], 440),
  ('customer.erase',               'hasta',    'Kaydı anonimleştir (KVKK imha)',   array['tenant']::public.permission_scope[],                450),

  ('report.operational.read',      'rapor',    'Program ve doluluk raporları',     array['tenant','branch','own']::public.permission_scope[], 510),
  ('report.revenue.read',          'rapor',    'Ciro ve ödeme raporları',          array['tenant','branch']::public.permission_scope[],       520),
  ('report.manage',                'rapor',    'Rapor tanımla ve zamanla',         array['tenant']::public.permission_scope[],                530),

  ('notification.read',            'bildirim', 'Gönderilen bildirimleri görüntüle', array['tenant','branch','own']::public.permission_scope[], 600),
  ('notification.template.manage', 'bildirim', 'Bildirim şablonlarını yönet',      array['tenant']::public.permission_scope[],                610),
  ('integration.calendar.connect', 'entegrasyon', 'Google Takvim bağla',           array['tenant','own']::public.permission_scope[],          710)
on conflict (key) do update
  set category = excluded.category,
      label    = excluded.label,
      scopes   = excluded.scopes,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Rol şablonları
-- -----------------------------------------------------------------------------
insert into public.role_templates (key, label, description, families, sort_order) values
  ('owner',      'Sahip',            'Tam yetki. Kısıtlanamaz, silinemez.',                         '{}', 10),
  ('admin',      'Yönetici',         'Faturalama dışında her şey: ekip, ayarlar, tüm raporlar.',    '{}', 20),
  ('hekim',      'Hekim',            'Kendi takvimi ve hastalarının tıbbi kaydı.',                  array['saglik']::public.business_family[], 30),
  ('asistan',    'Asistan',          'Bağlı olduğu hekimin takvimi ve hastaları.',                  array['saglik']::public.business_family[], 40),
  ('uygulayici', 'Uygulayıcı',       'Kendi takvimi ve müşterileri.',                               array['kisisel_bakim','hizmet']::public.business_family[], 30),
  ('resepsiyon', 'Resepsiyon',       'Tüm takvim ve randevu işlemleri. Tıbbi nota erişemez.',       '{}', 50),
  ('muhasebe',   'Muhasebe',         'Ciro ve ödeme raporları. Hasta dosyası göremez.',             '{}', 60)
on conflict (key) do update
  set label = excluded.label, description = excluded.description,
      families = excluded.families, sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- Şablon izinleri
-- -----------------------------------------------------------------------------
delete from public.role_template_permissions;

-- owner: katalogdaki her izin, en geniş kapsamda
insert into public.role_template_permissions (role_template_key, permission_key, scope)
select 'owner', key, 'tenant'::public.permission_scope from public.permissions;

-- admin: faturalama ve kurum silme hariç her şey
insert into public.role_template_permissions (role_template_key, permission_key, scope)
select 'admin', key, 'tenant'::public.permission_scope
from public.permissions
where key not in ('billing.manage', 'tenant.manage');

-- hekim: kendi kaynağı üzerinden çalışır, hasta listesini kurum genelinde görür
insert into public.role_template_permissions (role_template_key, permission_key, scope) values
  ('hekim', 'appointment.read',             'own'),
  ('hekim', 'appointment.write',            'own'),
  ('hekim', 'resource.read',                'own'),
  ('hekim', 'resource.manage',              'own'),
  ('hekim', 'customer.read',                'tenant'),
  ('hekim', 'customer.write',               'tenant'),
  ('hekim', 'customer.medical_notes.read',  'own'),
  ('hekim', 'customer.medical_notes.write', 'own'),
  ('hekim', 'report.operational.read',      'own'),
  ('hekim', 'notification.read',            'own'),
  ('hekim', 'integration.calendar.connect', 'own');

-- uygulayıcı: hekimin sağlık dışı karşılığı, tıbbi not yok
insert into public.role_template_permissions (role_template_key, permission_key, scope) values
  ('uygulayici', 'appointment.read',             'own'),
  ('uygulayici', 'appointment.write',            'own'),
  ('uygulayici', 'resource.read',                'own'),
  ('uygulayici', 'resource.manage',              'own'),
  ('uygulayici', 'customer.read',                'tenant'),
  ('uygulayici', 'customer.write',               'tenant'),
  ('uygulayici', 'report.operational.read',      'own'),
  ('uygulayici', 'notification.read',            'own'),
  ('uygulayici', 'integration.calendar.connect', 'own');

-- asistan: bağlı olduğu hekimin kapsamında, tıbbi notu okur ama yazmaz
insert into public.role_template_permissions (role_template_key, permission_key, scope) values
  ('asistan', 'appointment.read',            'own'),
  ('asistan', 'appointment.write',           'own'),
  ('asistan', 'resource.read',               'own'),
  ('asistan', 'customer.read',               'tenant'),
  ('asistan', 'customer.write',              'tenant'),
  ('asistan', 'customer.medical_notes.read', 'own'),
  ('asistan', 'report.operational.read',     'own'),
  ('asistan', 'notification.read',           'own');

-- resepsiyon: takvimin tamamı, tıbbi not YOK — bu bir KVKK gereği (Bölüm 8.2)
insert into public.role_template_permissions (role_template_key, permission_key, scope) values
  ('resepsiyon', 'appointment.read',        'tenant'),
  ('resepsiyon', 'appointment.write',       'tenant'),
  ('resepsiyon', 'resource.read',           'tenant'),
  ('resepsiyon', 'customer.read',           'tenant'),
  ('resepsiyon', 'customer.write',          'tenant'),
  ('resepsiyon', 'report.operational.read', 'tenant'),
  ('resepsiyon', 'notification.read',       'tenant');

-- muhasebe: sayılar evet, hasta dosyası hayır
insert into public.role_template_permissions (role_template_key, permission_key, scope) values
  ('muhasebe', 'report.revenue.read',     'tenant'),
  ('muhasebe', 'report.operational.read', 'tenant');
