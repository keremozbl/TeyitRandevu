/**
 * Vitrin kurumu — sitedeki "Demoyu deneyin" düğmesinin arkasındaki hesap.
 *
 * Ziyaretçi paneli gerçekten kullanabilsin diye ortak bir hesapla giriş
 * yapılıyor; kayıt, e-posta doğrulama ve kart yok. Bu hesabın gördüğü tek
 * kurum vitrin kurumudur — izolasyonu sağlayan şey RLS, arayüz değil.
 *
 * Parola ortam değişkeninden gelir ve **deposunda varsayılanı yoktur**:
 * `DEMO_PUBLIC_PAROLA` tanımlı değilse demo kapalıdır ve sayfa bunu söyler.
 * Böylece bir ortama yanlışlıkla açık bir hesap taşınmaz.
 *
 * Kerem'in kendi geliştirme hesabı ("Demo Diş Kliniği") bundan AYRI: orası
 * tek kişilik, burası herkese açık.
 */

export const DEMO_TENANT_SLUG = "vitrin-dis-klinigi";
export const DEMO_TENANT_NAME = "Vitrin Diş Kliniği";

/** Alan adı kesinleşince değişir (CANLIYA-GECIS B11). */
export const DEMO_EMAIL_DEFAULT = "vitrin@teyitrandevu.com";

export type DemoAccount = { email: string; password: string };

export function demoAccount(): DemoAccount | null {
  const password = process.env.DEMO_PUBLIC_PAROLA;
  if (!password) return null;
  return { email: process.env.DEMO_PUBLIC_EPOSTA ?? DEMO_EMAIL_DEFAULT, password };
}
