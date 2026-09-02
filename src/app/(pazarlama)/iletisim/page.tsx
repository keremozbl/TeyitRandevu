import type { Metadata } from "next";

import { SITE_CONTACT } from "@/lib/legal/site-texts";
import { PRODUCT } from "@/lib/marketing/content";

import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "İletişim",
  description:
    "TeyitRandevu demo talebi: kliniğinizi anlatın, sistemi birlikte gezelim. Pilot kurumlarla çalışıyoruz.",
};

export default function IletisimSayfasi() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <div className="flex max-w-xl flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-pretty text-3xl leading-tight tracking-tight">Demo isteyin</h1>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Kliniğinizi anlatın, sistemi birlikte gezelim. Görüşme yaklaşık yarım saat sürüyor
              ve satış sunumu değil: kendi gününüzü sistemde kurup neyin işinize yaramadığını
              söylüyorsunuz.
            </p>
          </div>

          <DemoForm source="iletisim" />
        </div>

        <aside className="flex flex-col gap-6 lg:pt-4">
          <section className="flex flex-col gap-2">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-3">
              Doğrudan yazın
            </h2>
            <a
              href={`mailto:${SITE_CONTACT.email}`}
              className="text-[14px] text-ink underline underline-offset-2"
            >
              {SITE_CONTACT.email}
            </a>
            {SITE_CONTACT.phone && (
              <a href={`tel:${SITE_CONTACT.phone}`} className="text-[14px] text-ink">
                {SITE_CONTACT.phone}
              </a>
            )}
          </section>

          <section className="flex flex-col gap-2 border-t border-border pt-5">
            <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-3">
              Görüşmede ne oluyor
            </h2>
            <ol className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-2">
              <li className="flex gap-2.5">
                <span data-numeric className="text-ink-3">
                  1
                </span>
                Kliniğinizin gününü dinliyoruz: kaç hekim, randevuyu kim yazıyor, program nasıl
                hazırlanıyor.
              </li>
              <li className="flex gap-2.5">
                <span data-numeric className="text-ink-3">
                  2
                </span>
                Sistemi sizin verinizle kuruyoruz — hizmetler, hekimler, çalışma saatleri.
              </li>
              <li className="flex gap-2.5">
                <span data-numeric className="text-ink-3">
                  3
                </span>
                Bir haftalık gerçek kullanım sonrası eksikleri konuşuyoruz.
              </li>
            </ol>
          </section>

          <p className="border-t border-border pt-5 text-[12px] leading-relaxed text-ink-3">
            {PRODUCT.stage}
          </p>
        </aside>
      </div>
    </div>
  );
}
