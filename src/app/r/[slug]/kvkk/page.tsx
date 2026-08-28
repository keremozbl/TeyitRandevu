import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getBookingPage } from "@/lib/booking/queries";
import { buildDisclosureText } from "@/lib/legal/consent-texts";

/**
 * Aydınlatma metninin yayımlandığı sayfa.
 *
 * Ayrı bir adres olması gerekiyor: rıza kaydı metnin SÜRÜMÜNÜ tutuyor ve
 * "hangi metne rıza verildi" sorusunun bir cevabı olmalı. Metin kurum adıyla
 * üretiliyor çünkü veri sorumlusu kurumun kendisi (Plan 11.1).
 */

export const metadata: Metadata = {
  title: { absolute: "KVKK Aydınlatma Metni" },
};

export default async function KvkkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getBookingPage(slug);
  if (!page) notFound();

  const branch = page.branches[0] ?? null;
  const text = buildDisclosureText(page.tenant.name, {
    address: branch?.address,
    phone: branch?.phone,
  });

  return (
    <article className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Link href={`/r/${slug}`} className="text-[13px] text-ink-2 no-underline hover:text-ink">
          <span aria-hidden="true">‹</span> Randevu sayfasına dön
        </Link>
        <h1 className="text-lg tracking-tight">{text.title}</h1>
        <p className="font-mono text-xs text-ink-3">
          Sürüm <span data-numeric>{text.version}</span>
        </p>
      </div>

      {text.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-ink">{section.heading}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="text-[13px] leading-relaxed text-ink-2">
              {paragraph}
            </p>
          ))}
          {section.items && (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-ink-2">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
