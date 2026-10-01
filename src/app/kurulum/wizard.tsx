"use client";

import { useActionState, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SectorIllustration } from "@/components/marketing/sector-illustration";
import {
  createTenantAction,
  type OnboardingState,
} from "@/lib/onboarding/actions";
import { FAMILY_LABELS, type SectorTemplate } from "@/lib/templates";
import { bookingUrlPrefix } from "@/lib/booking/share";
import { slugify } from "@/lib/utils/slug";

const EMPTY: OnboardingState = {};

// Hafta pazartesi başlar — Türkiye'de takvim böyle okunur.
const WEEKDAYS = [
  { value: 1, short: "Pzt" },
  { value: 2, short: "Sal" },
  { value: 3, short: "Çar" },
  { value: 4, short: "Per" },
  { value: 5, short: "Cum" },
  { value: 6, short: "Cmt" },
  { value: 0, short: "Paz" },
];

/**
 * Adımlar kimlikle taşınıyor, indeksle değil.
 *
 * Siteden sektör seçilerek gelindiğinde "Sektör" adımı listeden düşüyor —
 * ziyaretçi aynı soruyu iki kez cevaplamasın. İndeks kaydığı için adım
 * gövdeleri `step === 1` gibi sayılara değil, `current` kimliğine bakar.
 */
const ALL_STEPS = [
  { id: "kurum", label: "Kurum" },
  { id: "sektor", label: "Sektör" },
  { id: "saatler", label: "Çalışma saatleri" },
] as const;

type StepId = (typeof ALL_STEPS)[number]["id"];

export function OnboardingWizard({
  templates,
  initialTemplate,
  demo = false,
}: {
  templates: SectorTemplate[];
  /** Siteden sektör seçilerek gelindiyse o şablon açık gelir */
  initialTemplate?: string;
  /** Demo hesabı: kurulum bittiğinde takvime örnek bir gün yazılır */
  demo?: boolean;
}) {
  const [state, action, pending] = useActionState(createTenantAction, EMPTY);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [branchName, setBranchName] = useState("");
  const [templateKey, setTemplateKey] = useState(initialTemplate ?? templates[0]?.key ?? "");

  // Sektör siteden seçilip geldiyse adım gizli gelir; "Değiştir" onu geri açar.
  const [sectorLocked, setSectorLocked] = useState(Boolean(initialTemplate));

  const template = useMemo(
    () => templates.find((t) => t.key === templateKey),
    [templates, templateKey],
  );

  const steps = useMemo(
    () => ALL_STEPS.filter((s) => s.id !== "sektor" || !sectorLocked),
    [sectorLocked],
  );
  const current: StepId = steps[Math.min(step, steps.length - 1)].id;
  const lastStep = step >= steps.length - 1;

  const [weekdays, setWeekdays] = useState<number[]>(
    template?.working_hours.weekdays ?? [1, 2, 3, 4, 5],
  );
  const [startsAt, setStartsAt] = useState(template?.working_hours.starts_at ?? "09:00");
  const [endsAt, setEndsAt] = useState(template?.working_hours.ends_at ?? "18:00");

  const effectiveSlug = slugTouched ? slug : slugify(name);

  function pickTemplate(key: string) {
    setTemplateKey(key);
    const t = templates.find((x) => x.key === key);
    if (t) {
      setWeekdays(t.working_hours.weekdays);
      setStartsAt(t.working_hours.starts_at);
      setEndsAt(t.working_hours.ends_at);
    }
  }

  function toggleWeekday(value: number) {
    setWeekdays((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  const canContinue =
    (current === "kurum" && name.trim().length >= 2 && effectiveSlug.length >= 3) ||
    (current === "sektor" && Boolean(template)) ||
    current === "saatler";

  const families = [...new Set(templates.map((t) => t.family))];

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-14">
      <header className="flex flex-col gap-5">
        {/* Kurulum ürünün ilk beş dakikası: boş bir formla değil, ne yapıldığını
            gösteren bir görselle açılıyor. Ekranın üstünde olduğu için geç
            yüklenmiyor. */}
        <SectorIllustration sector="kurulum" priority className="h-36 !p-4" />

        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl tracking-tight">
            {demo ? "Demo kurumunuzu kuralım" : "Kurumunuzu kuralım"}
          </h1>
          <p className="text-ink-2">
            {sectorLocked && template
              ? `${template.label} şablonundan hizmetler, çalışma saatleri ve roller hazır gelecek. Hepsini sonradan değiştirebilirsiniz.`
              : "Sektörünüzü seçin; hizmetler, çalışma saatleri ve roller hazır gelsin. Hepsini sonradan değiştirebilirsiniz."}
          </p>
        </div>

        {/* Demoda bu ekran ürünün ilk beş dakikası: ziyaretçi neyi seçtiğinin
            takvimde ne yaptığını görsün diye ne olacağı önceden yazılıyor. */}
        {demo && (
          <Alert tone="info">
            Bu bir demo kurulumu: gerçek kurumunuzu kurar gibi doldurun. Bitirdiğinizde panel
            sizin dilinizle açılacak ve takvimde örnek bir gün hazır olacak. Kurum bir gün sonra
            silinir.
          </Alert>
        )}

        {/* Adım göstergesi — sıra bilgi taşıyor, süsleme değil */}
        <ol className="flex gap-1.5">
          {steps.map(({ id, label }, i) => (
            <li key={id} className="flex flex-1 flex-col gap-1.5">
              <span
                aria-hidden="true"
                className={`h-0.5 rounded-full ${i <= step ? "bg-accent" : "bg-border"}`}
              />
              <span
                className={`font-mono text-[11px] ${i <= step ? "text-ink-2" : "text-ink-3"}`}
              >
                {i + 1}. {label}
              </span>
            </li>
          ))}
        </ol>
      </header>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      <form
        action={action}
        onSubmit={(event) => {
          // Son adımdan önce Enter'a basmak formu göndermesin: alanların yarısı
          // henüz doldurulmadı. Enter, "Devam"ın kendisi olur.
          if (!lastStep) {
            event.preventDefault();
            if (canContinue) setStep((s) => s + 1);
          }
        }}
        className="flex flex-col gap-6"
      >
        {/*
          Değerlerin TAMAMI gizli alanlarda taşınır.

          Görünür alanlar adım adım DOM'a girip çıkıyor; React onları
          söktüğünde form verisinden de düşüyorlardı. Son adımda gönderilen
          formda `name` hiç yoktu ve kurulum "expected string, received null"
          ile patlıyordu. Görünür kontroller artık yalnızca durumu düzenliyor,
          forma giden şey burası.
        */}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="slug" value={effectiveSlug} />
        <input type="hidden" name="template" value={templateKey} />
        <input type="hidden" name="branch_name" value={branchName} />
        <input type="hidden" name="starts_at" value={startsAt} />
        <input type="hidden" name="ends_at" value={endsAt} />
        {weekdays.map((day) => (
          <input key={day} type="hidden" name="weekdays" value={day} />
        ))}

        {current === "kurum" && (
          <div className="flex flex-col gap-4">
            {/* Sektör siteden geldi: sorulmaz, teyit edilir. Ziyaretçi aynı
                soruyu iki kez cevaplamasın ama seçimi de kilitli kalmasın. */}
            {sectorLocked && template && (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded border border-border bg-surface-2 px-3.5 py-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  Sektör
                </span>
                <span className="font-medium text-ink">{template.label}</span>
                <span className="text-[13px] text-ink-2">
                  {template.services.length} hizmet · {template.roles.length} rol hazır gelecek
                </span>
                <button
                  type="button"
                  onClick={() => setSectorLocked(false)}
                  className="ml-auto text-[13px] text-accent underline underline-offset-2"
                >
                  Değiştir
                </button>
              </div>
            )}

            <Field id="name" label="Kurum adı" required>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örnek Klinik / Salon"
                autoComplete="organization"
                required
              />
            </Field>

            <Field
              id="slug"
              label="Randevu sayfası adresi"
              hint="Müşterileriniz bu adresten randevu alacak."
            >
              <div className="flex items-center gap-0">
                <span
                  translate="no"
                  className="flex h-9 shrink-0 items-center rounded-l border border-r-0 border-border bg-surface-2 px-2.5 font-mono text-[13px] text-ink-3"
                >
                  {bookingUrlPrefix()}
                </span>
                <Input
                  id="slug"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  className="rounded-l-none font-mono"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>
            </Field>

            <Field
              id="branch_name"
              label="Şube adı"
              hint="Tek adresiniz varsa boş bırakın; arayüzde hiç görünmez."
            >
              <Input
                id="branch_name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Merkez"
              />
            </Field>
          </div>
        )}

        {current === "sektor" && (
          <div className="flex flex-col gap-5">
            {families.map((family) => (
              <fieldset key={family} className="flex flex-col gap-2.5">
                <legend className="mb-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  {FAMILY_LABELS[family]}
                </legend>
                {templates
                  .filter((t) => t.family === family)
                  .map((t) => {
                    const checked = templateKey === t.key;
                    return (
                      <label
                        key={t.key}
                        className={`flex cursor-pointer gap-3 rounded border p-3.5 transition-[border-color,background-color] duration-150 ${
                          checked
                            ? "border-accent bg-accent-soft"
                            : "border-border bg-surface hover:border-border-strong"
                        }`}
                      >
                        <input
                          type="radio"
                          name="template_choice"
                          value={t.key}
                          checked={checked}
                          onChange={() => pickTemplate(t.key)}
                          className="mt-1 accent-[var(--accent)]"
                        />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="font-medium text-ink">{t.label}</span>
                          <span className="text-[13px] text-ink-2">
                            {t.description}
                          </span>
                          <span className="mt-0.5 font-mono text-[11px] text-ink-3">
                            {t.services.length} hizmet ·{" "}
                            {t.customer_fields.length} özel alan · {t.roles.length}{" "}
                            rol
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </fieldset>
            ))}
          </div>
        )}

        {current === "saatler" && template && (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-[13px] font-medium text-ink">
                Çalışma günleri
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = weekdays.includes(d.value);
                  return (
                    <label
                      key={d.value}
                      // Girdi sr-only olduğu için odak halkasını label taşır;
                      // aksi halde klavyeyle gezen kullanıcı nerede olduğunu görmez.
                      className={`cursor-pointer rounded border px-3 py-1.5 text-[13px] transition-[border-color,background-color] duration-150 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--focus)] ${
                        on
                          ? "border-accent bg-accent-soft text-ink"
                          : "border-border bg-surface text-ink-3 hover:border-border-strong"
                      }`}
                    >
                      <input
                        type="checkbox"
                        value={d.value}
                        checked={on}
                        onChange={() => toggleWeekday(d.value)}
                        className="sr-only"
                      />
                      {d.short}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-4">
              <Field id="starts_at" label="Açılış" required>
                <Input
                  id="starts_at"
                  type="time"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </Field>
              <Field id="ends_at" label="Kapanış" required>
                <Input
                  id="ends_at"
                  type="time"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  required
                />
              </Field>
            </div>

            {template.working_hours.break && (
              <Alert tone="info">
                {template.label} şablonu{" "}
                <span className="font-mono">
                  {template.working_hours.break.starts_at}–
                  {template.working_hours.break.ends_at}
                </span>{" "}
                arasını kapalı kabul eder. Kurulumdan sonra değiştirebilirsiniz.
              </Alert>
            )}

            <div className="rounded border border-border bg-surface-2 p-3.5">
              <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                Kurulacaklar
              </p>
              <ul className="flex flex-col gap-1 text-[13px] text-ink-2">
                <li>{template.services.length} hizmet ve varsayılan süreleri</li>
                <li>
                  {template.resources.length} kaynak ({template.terminology.resource_plural.toLocaleLowerCase("tr-TR")},
                  oda, cihaz)
                </li>
                <li>
                  {template.customer_fields.length + template.appointment_fields.length}{" "}
                  sektöre özel alan
                </li>
                <li>{template.roles.length} rol ve yetki tanımı</li>
              </ul>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border pt-5">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
          >
            Geri
          </Button>

          {!lastStep ? (
            <Button
              variant="primary"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canContinue}
            >
              Devam
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={pending}>
              {pending
                ? demo
                  ? "Kurum kuruluyor, örnek gün yazılıyor…"
                  : "Kurum oluşturuluyor…"
                : demo
                  ? "Kur ve Takvime Geç"
                  : "Kurumu Oluştur"}
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}
