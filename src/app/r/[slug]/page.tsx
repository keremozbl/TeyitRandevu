import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { holdSlotAction } from "@/lib/booking/actions";
import {
  bookingErrorMessage,
  formatDayChip,
  formatDuration,
  formatPrice,
  formatTime,
} from "@/lib/booking/messages";
import { getBookingPage, loadPublicAvailability, type PublicDay } from "@/lib/booking/queries";
import {
  ANY_RESOURCE,
  bookingHref,
  eligibleResources,
  encodeSlotChoice,
  resolveDayWindow,
  resolveSelectedDay,
} from "@/lib/booking/steps";
import { utcToPlainDate } from "@/lib/domain";

/**
 * Public randevu sayfası: hizmet → hekim → gün → saat.
 *
 * Tamamı sunucuda çizilir ve JavaScript olmadan çalışır. Sebebi ideoloji
 * değil: bu sayfa hastanın telefonundan, çoğu zaman zayıf bağlantıda
 * açılıyor. Adımlar `<a>`, saat seçimi `<form>`; tarayıcının kendi
 * mekanizmaları zaten hızlı ve erişilebilir.
 *
 * Seçimler query param'da (`?hizmet=…&kaynak=…&tarih=…`): geri tuşu çalışır,
 * bağlantı paylaşılabilir, yenileme seçimi kaybetmez.
 *
 * Uygunluk motoru panelinkiyle AYNI (`src/lib/domain/availability.ts`).
 * Buradaki liste bir kolaylıktır; asıl kapı `booking_hold` fonksiyonunda ve
 * `appointments_no_overlap` kısıtında.
 */

type SearchParams = {
  sube?: string;
  hizmet?: string;
  kaynak?: string;
  bas?: string;
  tarih?: string;
  hata?: string;
};

const CARD = "rounded border border-border bg-surface";
const ROW =
  "flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left no-underline " +
  "transition-[background-color,border-color,color] duration-150 hover:bg-surface-2";

function StepHeading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-lg tracking-tight">{children}</h1>
      {hint && <p className="text-[13px] text-ink-2">{hint}</p>}
    </div>
  );
}

/** Yapılmış seçimler; her biri o adıma geri döner. */
function Trail({
  slug,
  items,
}: {
  slug: string;
  items: { label: string; href: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Seçimleriniz" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <Link href={bookingHref(slug, {})} className="text-ink-2 no-underline hover:text-ink">
        Baştan
      </Link>
      {items.map((item) => (
        <span key={item.href} className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="text-ink-3">
            ›
          </span>
          <Link href={item.href} className="min-w-0 truncate text-ink-2 underline underline-offset-2">
            {item.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

/**
 * Adım göstergesi.
 *
 * "Kaç adım kaldı" sorusunun cevabı görünmezse insan formu yarıda bırakıyor;
 * rakiplerin tamamında da bu şerit var. Yalnızca bilgi taşıyor, tıklanmıyor —
 * geri dönüş için üstteki `Trail` var, iki ayrı gezinme kafa karıştırırdı.
 */
function Steps({ current, withResource }: { current: number; withResource: boolean }) {
  const labels = withResource
    ? ["İşlem", "Kim", "Saat", "Bilgiler"]
    : ["İşlem", "Saat", "Bilgiler"];

  return (
    <ol className="flex gap-1.5" aria-label={`Adım ${current} / ${labels.length}`}>
      {labels.map((label, index) => {
        const done = index + 1 <= current;
        return (
          <li key={label} className="flex flex-1 flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={`h-0.5 rounded-full ${done ? "bg-accent" : "bg-border"}`}
            />
            <span className={`font-mono text-[11px] ${done ? "text-ink-2" : "text-ink-3"}`}>
              {index + 1}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Saatleri günün bölümlerine ayırır.
 *
 * Otuz saatlik düz bir ızgarada insan aradığı vakti bulamıyor; "öğleden
 * sonra" diye bakıyor. Sınırlar kurumun kendi saat diliminde okunuyor —
 * `formatTime` zaten o dilimde biçimlendiriyor, saat oradan alınıyor.
 */
function groupByDaypart<T>(items: T[], hourOf: (item: T) => number) {
  const groups: { label: string; items: T[] }[] = [
    { label: "Sabah", items: [] },
    { label: "Öğleden sonra", items: [] },
    { label: "Akşam", items: [] },
  ];

  for (const item of items) {
    const hour = hourOf(item);
    const index = hour < 12 ? 0 : hour < 17 ? 1 : 2;
    groups[index].items.push(item);
  }

  return groups.filter((group) => group.items.length > 0);
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-1.5 px-4 py-8 text-center`}>
      <p className="font-medium text-ink">{title}</p>
      <p className="text-[13px] text-ink-2">{body}</p>
    </div>
  );
}

export default async function RandevuAlPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const page = await getBookingPage(slug);
  if (!page) notFound();

  const { rules, tenant } = page;
  const error = query.hata
    ? bookingErrorMessage(query.hata, {
        minLeadMinutes: rules.min_lead_minutes,
        maxAdvanceDays: rules.max_advance_days,
      })
    : null;

  // ---------------------------------------------------------------- şube
  const branch =
    page.branches.find((item) => item.id === query.sube) ??
    (page.branches.length === 1 ? page.branches[0] : null);

  if (page.branches.length === 0 || page.services.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeading>Randevu</StepHeading>
        <EmptyState
          title="İnternetten randevu şu an kapalı"
          body="Randevu için kliniği telefonla arayabilirsiniz."
        />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <StepHeading hint="Randevu almak istediğiniz şubeyi seçin.">Şube</StepHeading>
        <ul className={`${CARD} flex flex-col divide-y divide-border`}>
          {page.branches.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link href={bookingHref(slug, { sube: item.id })} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{item.name}</span>
                  {item.address && (
                    <span className="block truncate text-[13px] text-ink-2">{item.address}</span>
                  )}
                </span>
                <span aria-hidden="true" className="shrink-0 text-ink-3">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const branchParam = page.branches.length > 1 ? branch.id : undefined;
  const trail: { label: string; href: string }[] = [];
  if (branchParam) trail.push({ label: branch.name, href: bookingHref(slug, {}) });

  // -------------------------------------------------------------- hizmet
  const service = page.services.find((item) => item.id === query.hizmet);

  if (!service) {
    const categories = [...new Set(page.services.map((item) => item.category ?? ""))];

    return (
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Trail slug={slug} items={trail} />
        <Steps current={1} withResource={page.resources.length > 1} />
        <StepHeading hint={`${tenant.name} için internetten randevu alın.`}>
          Hangi işlem için geliyorsunuz?
        </StepHeading>

        {categories.map((category) => {
          const services = page.services.filter((item) => (item.category ?? "") === category);
          return (
            <section key={category || "genel"} className="flex flex-col gap-2">
              {category && (
                <h2 className="font-mono text-xs uppercase tracking-[0.1em] text-ink-3">
                  {category}
                </h2>
              )}
              <ul className={`${CARD} flex flex-col divide-y divide-border`}>
                {services.map((item) => (
                  <li key={item.id} className="min-w-0">
                    <Link
                      href={bookingHref(slug, { sube: branchParam, hizmet: item.id })}
                      className={ROW}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{item.name}</span>
                        <span className="block text-[13px] text-ink-2">
                          {formatDuration(item.durationMin)}
                          {page.branding.show_prices &&
                            item.price !== null &&
                            ` · ${formatPrice(item.price, tenant.currency)}`}
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-ink-3">
                        ›
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  trail.push({
    label: service.name,
    href: bookingHref(slug, { sube: branchParam }),
  });

  // -------------------------------------------------------------- kaynak
  const eligible = eligibleResources(service, page.resources, branch.id);

  if (eligible.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Trail slug={slug} items={trail} />
        <StepHeading>{service.name}</StepHeading>
        <EmptyState
          title="Bu işlem için internetten randevu verilemiyor"
          body="Kliniği arayarak randevu alabilirsiniz."
        />
      </div>
    );
  }

  const onlyOne = eligible.length === 1;
  const chosen = eligible.find((item) => item.id === query.kaynak);
  const anyResource = query.kaynak === ANY_RESOURCE;
  const resource = chosen ?? (onlyOne ? eligible[0] : null);

  if (!resource && !anyResource) {
    return (
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Trail slug={slug} items={trail} />
        <Steps current={2} withResource />
        <StepHeading hint="Fark etmiyorsa en erken boşalan saat size verilir.">
          Kimden randevu almak istersiniz?
        </StepHeading>
        <ul className={`${CARD} flex flex-col divide-y divide-border`}>
          {eligible.map((item) => (
            <li key={item.id} className="min-w-0">
              <Link
                href={bookingHref(slug, {
                  sube: branchParam,
                  hizmet: service.id,
                  kaynak: item.id,
                })}
                className={ROW}
              >
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{item.label}</span>
                <span aria-hidden="true" className="shrink-0 text-ink-3">
                  ›
                </span>
              </Link>
            </li>
          ))}
          <li className="min-w-0">
            <Link
              href={bookingHref(slug, {
                sube: branchParam,
                hizmet: service.id,
                kaynak: ANY_RESOURCE,
              })}
              className={ROW}
            >
              <span className="min-w-0 flex-1 truncate font-medium text-ink">Fark etmez</span>
              <span aria-hidden="true" className="shrink-0 text-ink-3">
                ›
              </span>
            </Link>
          </li>
        </ul>
      </div>
    );
  }

  const resourceParam = anyResource ? ANY_RESOURCE : (resource?.id ?? ANY_RESOURCE);
  if (!onlyOne) {
    trail.push({
      label: resource ? resource.label : "Fark etmez",
      href: bookingHref(slug, { sube: branchParam, hizmet: service.id }),
    });
  }

  // ----------------------------------------------------------- gün ve saat
  const timeZone = branch.timeZone;
  const today = utcToPlainDate(new Date(), timeZone);
  const window = resolveDayWindow(today, rules, query.bas);
  const resourceIds = resource ? [resource.id] : eligible.map((item) => item.id);

  let days: PublicDay[] = [];
  if (window.days.length > 0) {
    days = await loadPublicAvailability({
      slug,
      resources: resourceIds,
      service,
      timeZone,
      from: window.days[0],
      to: window.days[window.days.length - 1],
      rules,
    });
  }

  const selectedDate = resolveSelectedDay(days, query.tarih);
  const selectedDay = days.find((day) => day.date === selectedDate) ?? null;
  const totalSlots = days.reduce((sum, day) => sum + day.slots.length, 0);

  const stepHref = (extra: { bas?: string; tarih?: string }) =>
    bookingHref(slug, {
      sube: branchParam,
      hizmet: service.id,
      kaynak: resourceParam,
      ...extra,
    });

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Trail slug={slug} items={trail} />
      <Steps current={onlyOne ? 2 : 3} withResource={!onlyOne} />
      <StepHeading
        hint={`${service.name} · ${formatDuration(service.durationMin)}${
          resource ? ` · ${resource.label}` : ""
        }`}
      >
        Uygun saati seçin
      </StepHeading>

      {/* Gün şeridi: yatay kaydırılır, sayfayı yana kaydırmaz */}
      <div className="flex items-stretch gap-2">
        {window.previousStart ? (
          <Link
            href={stepHref({ bas: window.previousStart })}
            aria-label="Önceki günler"
            className="flex w-9 shrink-0 items-center justify-center rounded border border-border bg-surface text-ink-2 no-underline transition-[background-color,border-color,color] duration-150 hover:border-border-strong hover:text-ink"
          >
            <span aria-hidden="true">‹</span>
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="flex w-9 shrink-0 items-center justify-center rounded border border-border/60 text-ink-3"
          >
            ‹
          </span>
        )}

        <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
          {window.days.map((date) => {
            const day = days.find((item) => item.date === date);
            const count = day?.slots.length ?? 0;
            const chip = formatDayChip(date);
            const active = date === selectedDate;

            const body = (
              <>
                <span className="text-[11px] uppercase tracking-wide">{chip.weekday}</span>
                <span data-numeric className="text-[13px] font-medium">
                  {chip.day}
                </span>
              </>
            );

            return (
              <li key={date} className="shrink-0">
                {count > 0 ? (
                  <Link
                    href={stepHref({ bas: window.days[0], tarih: date })}
                    aria-current={active ? "true" : undefined}
                    className={[
                      "flex w-14 flex-col items-center gap-0.5 rounded border px-1 py-2 no-underline",
                      "transition-[background-color,border-color,color] duration-150",
                      active
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-border bg-surface text-ink-2 hover:border-accent hover:text-ink",
                    ].join(" ")}
                  >
                    {body}
                  </Link>
                ) : (
                  <span
                    className="flex w-14 flex-col items-center gap-0.5 rounded border border-dashed border-border px-1 py-2 text-ink-3"
                    title="Bu gün için uygun saat yok"
                  >
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {window.nextStart ? (
          <Link
            href={stepHref({ bas: window.nextStart })}
            aria-label="Sonraki günler"
            className="flex w-9 shrink-0 items-center justify-center rounded border border-border bg-surface text-ink-2 no-underline transition-[background-color,border-color,color] duration-150 hover:border-border-strong hover:text-ink"
          >
            <span aria-hidden="true">›</span>
          </Link>
        ) : (
          <span
            aria-hidden="true"
            className="flex w-9 shrink-0 items-center justify-center rounded border border-border/60 text-ink-3"
          >
            ›
          </span>
        )}
      </div>

      {totalSlots === 0 || !selectedDay ? (
        <EmptyState
          title="Bu iki haftada uygun saat yok"
          body={
            window.nextStart
              ? "Sağdaki okla sonraki günlere bakabilir ya da kliniği arayabilirsiniz."
              : "Kliniği arayarak randevu alabilirsiniz."
          }
        />
      ) : selectedDay.slots.length === 0 ? (
        <EmptyState
          title="Bu günde uygun saat yok"
          body="Şeritten saati olan bir gün seçin."
        />
      ) : (
        <form action={holdSlotAction} className="flex flex-col gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="hizmet" value={service.id} />
          <input type="hidden" name="kaynak" value={resourceParam} />
          {branchParam && <input type="hidden" name="sube" value={branchParam} />}
          <input type="hidden" name="bas" value={window.days[0]} />
          <input type="hidden" name="tarih" value={selectedDay.date} />

          <fieldset className="flex flex-col gap-4">
            <legend className="pb-1 text-[13px] font-medium text-ink">
              {formatDayChip(selectedDay.date).day} · {selectedDay.slots.length} uygun saat
            </legend>

            {groupByDaypart(selectedDay.slots, (slot) =>
              Number(formatTime(slot.startsAt, timeZone).slice(0, 2)),
            ).map((group) => (
              <div key={group.label} className="flex flex-col gap-2">
                <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                  {group.label}
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {group.items.map((slot) => (
                    <button
                      key={slot.startsAt.toISOString()}
                      type="submit"
                      name="secim"
                      value={encodeSlotChoice(slot.startsAt, slot.resourceIds)}
                      data-numeric
                      className="h-11 rounded border border-border bg-surface text-[15px] font-medium text-ink transition-[background-color,border-color,color] duration-150 hover:border-accent hover:bg-accent-soft"
                    >
                      {formatTime(slot.startsAt, timeZone)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>

          <p className="text-[13px] text-ink-3">
            Saati seçtiğinizde bilgilerinizi girmeniz için {formatDuration(rules.hold_minutes)}{" "}
            boyunca sizin adınıza tutulur.
          </p>
        </form>
      )}
    </div>
  );
}
