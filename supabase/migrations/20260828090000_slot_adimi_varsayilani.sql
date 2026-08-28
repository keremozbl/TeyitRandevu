-- -----------------------------------------------------------------------------
-- booking_rules varsayılanına slot_step_minutes eklenir.
--
-- Anahtar koddaki `DEFAULT_BOOKING_RULES` içinde baştan beri vardı ama
-- veritabanı varsayılanında yoktu: yeni kurulan her kurumun ayarı eksik
-- doğuyor, kod da onu 15 dakikaya düşürüyordu. İkisinin ayrışması sessiz bir
-- tutarsızlık — ayar arayüzü değeri yazacağı için artık ikisi de aynı yerde.
--
-- Mevcut satırlar da tamamlanır; `||` yalnızca eksik anahtarı ekler, var olan
-- bir değeri ezmez çünkü yalnızca anahtarı olmayan satırlar güncelleniyor.
-- -----------------------------------------------------------------------------

alter table public.tenant_settings
  alter column booking_rules set default jsonb_build_object(
    'min_lead_minutes', 120,
    'max_advance_days', 60,
    'cancel_window_minutes', 240,
    'hold_minutes', 10,
    'slot_step_minutes', 15
  );

update public.tenant_settings
   set booking_rules = booking_rules || jsonb_build_object('slot_step_minutes', 15)
 where not (booking_rules ? 'slot_step_minutes');
