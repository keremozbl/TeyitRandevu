import type { User } from "@supabase/supabase-js";

/**
 * Canlı demo.
 *
 * Ziyaretçi `/demo` sayfasında sektörünü seçip düğmeye bastığında ona ÖZEL bir
 * hesap açılıyor, kurulum sihirbazından geçiyor ve kendi kurumunun takvimine
 * iniyor. Ortak bir demo kurumu değil: iki ziyaretçi birbirinin randevusunu
 * silemez, kimse "demoyu bozamaz" ve ekranda gördüğü kurum gerçekten kendi
 * kurduğu kurumdur.
 *
 * Hesap geçicidir: `app_metadata.demo` işaretli olur ve `npm run demo:temizle`
 * eskiyenleri kurumlarıyla birlikte siler.
 *
 * `DEMO_KAPALI=1` demoyu kapatır — sayfa "kapalı" der, düğme çizilmez.
 */

/** Demo hesaplarının e-posta alanı. Gerçek posta almaz, alması da gerekmez. */
export const DEMO_EMAIL_DOMAIN = "vitrin.teyitrandevu.com";
export const DEMO_EMAIL_PREFIX = "vitrin-";

/** Bu süreden eski demo hesapları temizlik betiğinde silinir. */
export const DEMO_TTL_HOURS = 24;

/* Eski, elle kurulan ortak vitrin kurumu — `npm run demo:seed -- --vitrin`
   hâlâ bunu kuruyor ve panel banner'ı onu da demo sayıyor. */
export const DEMO_TENANT_SLUG = "vitrin-dis-klinigi";
export const DEMO_TENANT_NAME = "Vitrin Diş Kliniği";
export const DEMO_EMAIL_DEFAULT = "vitrin@teyitrandevu.com";

export function isDemoEnabled(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.DEMO_KAPALI !== "1";
}

/**
 * Demo hesabı mı?
 *
 * `app_metadata` okunuyor, `user_metadata` DEĞİL: ikincisini kullanıcı kendisi
 * değiştirebilir (CLAUDE.md, RLS tablosu). Buradaki işaret yalnızca servis
 * rolüyle yazılır.
 */
export function isDemoUser(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.demo === true;
}

export function demoCredentials(): { email: string; password: string } {
  const id = crypto.randomUUID();
  return {
    email: `${DEMO_EMAIL_PREFIX}${id}@${DEMO_EMAIL_DOMAIN}`,
    // Parola hiçbir yerde saklanmıyor: bir kez giriş için üretiliyor ve
    // oturum cookie'sine dönüşüyor.
    password: `Vt-${crypto.randomUUID()}`,
  };
}
