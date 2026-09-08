/**
 * Panel menüsünün tek kaynağı.
 *
 * Menü kurumun kendi diliyle: diş kliniğinde "Hastalar", berberde
 * "Müşteriler", diyetisyende "Danışanlar". Terim `tenant_settings` içinde ve
 * üyelik sorgusuyla birlikte geliyor (session.ts) — ek sorgu yok.
 *
 * Yedi başlık düz bir şeritte artık okunmuyordu; gruplama sırayı hatırlatıyor:
 * önce günlük iş, sonra tanımlar, sonra izleme. Ayarlar hiçbir gruba ait
 * değil, en altta tek başına duruyor.
 *
 * İkonlar 16×16, `currentColor` ile çizili ve `aria-hidden`. Emoji bölüm
 * ikonu kaçınılanlar listesinde (globals.css): emoji platforma göre farklı
 * çiziliyor ve ekran okuyucuda ismini okuyor.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

export type NavGroup = {
  /** Katlanmış rayda gizlenir; ekran okuyucu için `aria-label` olarak kalır */
  caption: string;
  items: NavItem[];
};

/* --- ikonlar ---------------------------------------------------------------
   Tek `<svg>` sarmalı `Icon` içinde; buradakiler yalnızca yol. */

const Takvim = (
  <>
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.75v2.5M10.5 1.75v2.5" />
  </>
);

const Kisi = (
  <>
    <circle cx="8" cy="5.25" r="2.5" />
    <path d="M3 13.5a5 5 0 0 1 10 0" />
  </>
);

const Hizmet = (
  <>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h7" />
  </>
);

const Ekip = (
  <>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13a4.25 4.25 0 0 1 8.5 0" />
    <path d="M10.75 3.6a2.25 2.25 0 0 1 0 3.8M11.75 9.4a4.25 4.25 0 0 1 2.5 3.6" />
  </>
);

const Rapor = (
  <>
    <path d="M2.25 13.5h11.5" />
    <path d="M4.5 13.5V8.5M8 13.5V4M11.5 13.5v-3" />
  </>
);

const Bildirim = (
  <>
    <path d="M4 6.75a4 4 0 0 1 8 0c0 3 1 4 1 4H3s1-1 1-4Z" />
    <path d="M6.5 13a1.6 1.6 0 0 0 3 0" />
  </>
);

const Ayar = (
  <>
    <circle cx="8" cy="8" r="2.1" />
    <path d="M8 1.75v1.6M8 12.65v1.6M2.35 8h1.6M12.05 8h1.6M3.9 3.9l1.15 1.15M10.95 10.95l1.15 1.15M12.1 3.9l-1.15 1.15M5.05 10.95 3.9 12.1" />
  </>
);

/** Ortak sarmal: kalınlık ve uçlar her ikonda aynı olsun diye tek yerde. */
export function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function navGroups(customers: string, services: string): NavGroup[] {
  return [
    {
      caption: "Operasyon",
      items: [
        { href: "/app", label: "Takvim", icon: Takvim },
        { href: "/app/hastalar", label: customers, icon: Kisi },
      ],
    },
    {
      caption: "Tanımlar",
      items: [
        { href: "/app/hizmetler", label: services, icon: Hizmet },
        { href: "/app/ekip", label: "Ekip", icon: Ekip },
      ],
    },
    {
      caption: "İzleme",
      items: [
        { href: "/app/raporlar", label: "Raporlar", icon: Rapor },
        { href: "/app/bildirimler", label: "Bildirimler", icon: Bildirim },
      ],
    },
  ];
}

/** Hiçbir gruba ait değil: rayın dibinde, ayırıcının altında. */
export function settingsItem(): NavItem {
  return { href: "/app/ayarlar", label: "Ayarlar", icon: Ayar };
}

/** Düz liste — mobil şerit ve ⌘K araması gruplamaya ihtiyaç duymuyor. */
export function navFlat(customers: string, services: string): NavItem[] {
  return [...navGroups(customers, services).flatMap((g) => g.items), settingsItem()];
}
