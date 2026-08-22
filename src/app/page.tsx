import { FAMILY_LABELS, listTemplates, type BusinessFamily } from "@/lib/templates";

const SETUP_STEPS = [
  { label: "Next.js iskeleti, tasarım token'ları", done: true },
  { label: "Declarative şema — 8 dosya, RLS politikaları dahil", done: true },
  { label: "Yetki motoru: izin kataloğu ve rol şablonları", done: true },
  { label: "Sektör şablonları", done: true },
  { label: "Supabase projesine bağlanma", done: false },
  { label: "Kimlik doğrulama ve kurum kurulum sihirbazı", done: false },
];

export default function Home() {
  const templates = listTemplates();
  const families = [...new Set(templates.map((t) => t.family))] as BusinessFamily[];

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16 flex flex-col gap-12">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-ink-3">
          Faz 0 · kurulum
        </p>
        <h1 className="text-4xl leading-tight tracking-tight">TeyitRandevu</h1>
        <p className="max-w-xl text-ink-2">
          Klinik ve işletmeler için randevu, hasta takibi ve otomatik hatırlatma
          sistemi. Bu sayfa geçici bir kurulum ekranıdır.
        </p>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
          Kurulum durumu
        </h2>
        <ul className="flex flex-col divide-y divide-border rounded border border-border bg-surface">
          {SETUP_STEPS.map((step) => (
            <li key={step.label} className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${
                  step.done ? "bg-st-confirmed" : "bg-st-pending"
                }`}
              />
              <span className={step.done ? "text-ink" : "text-ink-2"}>
                {step.label}
              </span>
              <span className="ml-auto font-mono text-xs text-ink-3">
                {step.done ? "hazır" : "bekliyor"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
          Sektör şablonları
        </h2>
        {families.map((family) => (
          <div key={family} className="flex flex-col gap-2">
            <h3 className="text-ink-2">{FAMILY_LABELS[family]}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {templates
                .filter((t) => t.family === family)
                .map((t) => (
                  <article
                    key={t.key}
                    className="flex flex-col gap-2 rounded border border-border bg-surface p-4"
                  >
                    <h4 className="text-base">{t.label}</h4>
                    <p className="text-sm text-ink-2">{t.description}</p>
                    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink-3">
                      <div className="flex gap-1.5">
                        <dt>hizmet</dt>
                        <dd data-numeric className="text-ink-2">
                          {t.services.length}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>alan</dt>
                        <dd data-numeric className="text-ink-2">
                          {t.customer_fields.length + t.appointment_fields.length}
                        </dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt>rol</dt>
                        <dd data-numeric className="text-ink-2">
                          {t.roles.length}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
            </div>
          </div>
        ))}
      </section>

      <footer className="border-t border-border pt-6 font-mono text-xs text-ink-3">
        Plan: docs/PLAN.md
      </footer>
    </main>
  );
}
