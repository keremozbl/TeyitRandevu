import type { Metadata } from "next";

import { Container, Eyebrow, H1, LEAD } from "@/components/marketing/ui";
import { SITE_CONTACT } from "@/lib/legal/site-texts";
import { PRODUCT } from "@/lib/marketing/content";
import { listTemplates } from "@/lib/templates";

import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "İletişim",
  description:
    "TeyitRandevu demo talebi: işletmenizi anlatın, sistemi birlikte gezelim. Pilot kurumlarla çalışıyoruz.",
};

const STEPS = [
  "İşletmenizin gününü dinliyoruz: kaç kişi çalışıyor, randevuyu kim yazıyor, program nasıl hazırlanıyor.",
  "Sistemi sizin verinizle kuruyoruz — hizmetler, uzmanlar, çalışma saatleri.",
  "Bir haftalık gerçek kullanım sonrası eksikleri konuşuyoruz.",
];

export default function IletisimSayfasi() {
  return (
    <Container className="py-14">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-16">
        <div className="flex max-w-xl flex-col gap-8">
          <div className="flex flex-col gap-4">
            <Eyebrow>Demo talebi</Eyebrow>
            <h1 className={H1}>İşletmenizi anlatın</h1>
            <p className={LEAD}>
              Sistemi birlikte gezelim. Görüşme yaklaşık yarım saat sürüyor ve satış sunumu değil:
              kendi gününüzü sistemde kurup neyin işinize yaramadığını söylüyorsunuz.
            </p>
          </div>

          <DemoForm
            source="iletisim"
            sectors={listTemplates().map((template) => ({
              key: template.key,
              label: template.label,
            }))}
          />
        </div>

        <aside className="flex flex-col gap-7 lg:pt-2">
          <section className="flex flex-col gap-2 rounded-lg border border-brand-line bg-brand-tint p-4">
            <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-2">
              Doğrudan yazın
            </h2>
            <a
              href={`mailto:${SITE_CONTACT.email}`}
              className="break-words text-[15px] font-medium text-ink underline underline-offset-2"
            >
              {SITE_CONTACT.email}
            </a>
            {SITE_CONTACT.phone && (
              <a href={`tel:${SITE_CONTACT.phone}`} className="text-[15px] text-ink">
                {SITE_CONTACT.phone}
              </a>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-3">
              Görüşmede ne oluyor
            </h2>
            <ol className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span data-numeric className="font-mono text-[13px] text-brand">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <p className="border-t border-border pt-5 text-[13px] leading-relaxed text-ink-3">
            {PRODUCT.stage}
          </p>
        </aside>
      </div>
    </Container>
  );
}
