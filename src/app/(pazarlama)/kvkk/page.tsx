import type { Metadata } from "next";

import { buildSiteNotice } from "@/lib/legal/site-texts";

/**
 * Sitenin kendi aydınlatma metni.
 *
 * Kliniklerin hasta aydınlatması bundan AYRI ve her kurumun kendi randevu
 * sayfasında (`/r/<slug>/kvkk`): orada veri sorumlusu kurumdur, burada
 * TeyitRandevu.
 */

export const metadata: Metadata = {
  title: "Aydınlatma metni",
  description:
    "TeyitRandevu sitesinde paylaşılan kişisel verilerin işlenmesine ilişkin aydınlatma metni.",
};

export default function SiteKvkkSayfasi() {
  const text = buildSiteNotice();

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <article className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-pretty text-2xl leading-tight tracking-tight">{text.title}</h1>
          <p className="font-mono text-[12px] text-ink-3">
            Sürüm <span data-numeric>{text.version}</span>
          </p>
        </div>

        {text.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold text-ink">{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph} className="text-[14px] leading-relaxed text-ink-2">
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[14px] leading-relaxed text-ink-2">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
