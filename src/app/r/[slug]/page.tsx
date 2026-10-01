import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { holdSlotAction } from "@/lib/booking/actions";
import {
  bookingErrorMessage,
  formatDayChip,
  formatDuration,
  formatLongDateTime,
  formatPrice,
  formatTime,
} from "@/lib/booking/messages";
import {
  getBookingPage,
  loadPublicAvailability,
  lookupBooking,
  type PublicDay,
} from "@/lib/booking/queries";
import { isHoldExpired } from "@/lib/booking/state";
import {
  ANY_RESOURCE,
  bookingHref,
  eligibleResources,
  encodeSlotChoice,
  resolveDayWindow,
  resolveSelectedDay,
} from "@/lib/booking/steps";
import { utcToPlainDate } from "@/lib/domain";
import { buildConsentBoxes } from "@/lib/legal/consent-texts";

import { Choice, Section } from "./booking-sections";
import { DetailsForm } from "./details-form";

/**
 * Public randevu sayfası — hepsi tek ekranda.
 *
 * Önceden adımlar sayfa sayfa geliyordu: işlem seç → sayfa değişir → hekim
 * seç → sayfa değişir → saat seç → sayfa değişir → bilgiler. Her adım
 * doğruydu ama hasta nerede olduğunu ve kaç adım kaldığını bilmiyordu;
 * seçimini değiştirmek için geri gitmesi gerekiyordu. Teknolojiyle arası iyi
 * olmayan biri için bu akış, tek bir formdan belirgin biçimde zor.
 *
 * Şimdi dört bölüm de aynı sayfada, hep görünür:
 *
 *   1. İşlem   2. Hekim   3. Gün ve saat   4. Bilgileriniz
 *
 * Sıra gelmemiş bölüm soluk duruyor ve niçin beklediğini yazıyor; yapılmış
 * seçim başlığın yanında özetleniyor. İşlemi değiştirmek tek tık — geri
 * tuşuna basmak, baştan başlamak yok.
 *
 * MİMARİ DEĞİŞMEDİ. Seçimler hâlâ query param'da, her seçenek hâlâ bir
 * `<a>`, sayfa hâlâ JavaScript olmadan çalışıyor ve hâlâ sunucuda çiziliyor.
 * Değişen tek şey, aynı anda kaç bölümün çizildiği. Bu sayfa hastanın
 * telefonundan ve çoğu zaman zayıf bağlantıda açılıyor; tek sayfa olması
 * tarayıcıdan JavaScript istememizi gerektirmiyor.
 *
 * Hekim seçimi ARTIK ZORUNLU DEĞİL: hizmet seçilince saatler "fark etmez"
 * ile hemen geliyor. Hastaların çoğu hekim adı bilmiyor; bilen daraltır.
 *
 * Uygunluk motoru panelinkiyle aynı (`src/lib/domain/availability.ts`).
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
  /** Tutulmuş slot'un token'ı — varsa 4. bölüm forma dönüyor. */
  tutma?: string;
};

const CARD = "rounded border border-border bg-surface";

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className={`${CARD} flex flex-col gap-1.5 px-4 py-8 text-center`}>
      <p className="font-medium text-ink">{title}</p>
      <p className="text-[13px] text-ink-2">{body}</p>
    </div>
  );
}

/**
 * Saatleri günün bölümlerine ayırır.
 *
 * Otuz saatlik düz bir ızgarada insan aradığı vakti bulamıyor; "öğleden
 * sonra" diye bakıyor. Sınırlar kurumun kendi saat diliminde okunuyor.
 */
function groupByDaypart<T>(items: T[], hourOf: (item: T) => number) {
  const groups: { label: string; items: T[] }[] = [
    { label: "Sabah", items: [] },
    { label: "Öğleden sonra", items: [] },
    { label: "Akşam", items: [] },
  ];

  for (const item of items) {
    const hour = hourOf(item);
    groups[hour < 12 ? 0 : hour < 17 ? 1 : 2].items.push(item);
  }

  return groups.filter((group) => group.items.length > 0);
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

  // ------------------------------------------------------------- tutma
  // Slot tutulmuşsa 4. bölüm formu çiziyor. Tutma ölmüşse sessizce yok
  // sayılıyor: hasta zaten sayfanın tamamını görüyor, yeniden saat seçmesi
  // için ayrı bir ekrana göndermeye gerek yok.
  const held = query.tutma ? await lookupBooking(query.tutma) : null;
  const holdValid =
    held !== null &&
    held.tenantSlug === slug &&
    held.holdExpiresAt !== null &&
    !isHoldExpired(held.holdExpiresAt);
  const holdExpired = Boolean(query.tutma) && !holdValid;

  if (page.branches.length === 0 || page.services.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg tracking-tight">Randevu</h1>
        <EmptyState
          title="İnternetten randevu şu an kapalı"
          body="Randevu için bizi telefonla arayabilirsiniz."
        />
      </div>
    );
  }

  // -------------------------------------------------------------- şube
  const branch =
    page.branches.find((item) => item.id === query.sube) ??
    (page.branches.length === 1 ? page.branches[0] : null);
  const branchParam = page.branches.length > 1 ? branch?.id : undefined;

  const href = (extra: Partial<SearchParams>) =>
    bookingHref(slug, {
      sube: branchParam,
      hizmet: query.hizmet,
      kaynak: query.kaynak,
      bas: query.bas,
      tarih: query.tarih,
      ...extra,
    });

  // ------------------------------------------------------------ hizmet
  const service = branch ? page.services.find((item) => item.id === query.hizmet) : undefined;
  const eligible = service && branch ? eligibleResources(service, page.resources, branch.id) : [];

  // Hekim bölümü kurumda birden çok hekim VARSA her zaman duruyor, seçili
  // işlemden bağımsız olarak. Sebebi numaraların sabit kalması: bölüm işlem
  // seçilince araya girseydi "Gün ve saat" 2'den 3'e kayardı ve hasta az
  // önce baktığı yeri kaybederdi. Tek hekimli kurumda bölüm hiç çizilmiyor —
  // orada sorulacak bir soru yok.
  const staffCount = page.resources.filter((item) => item.kind === "staff").length;
  const showResourceSection = staffCount > 1;

  const chosenResource = eligible.find((item) => item.id === query.kaynak) ?? null;
  const resourceParam = chosenResource?.id ?? ANY_RESOURCE;

  const step = {
    service: 1,
    resource: 2,
    time: showResourceSection ? 3 : 2,
    details: showResourceSection ? 4 : 3,
  };

  // --------------------------------------------------------- gün, saat
  const timeZone = branch?.timeZone ?? tenant.timeZone;
  let days: PublicDay[] = [];
  const window = resolveDayWindow(utcToPlainDate(new Date(), timeZone), rules, query.bas);

  if (service && branch && eligible.length > 0 && window.days.length > 0) {
    days = await loadPublicAvailability({
      slug,
      resources: chosenResource ? [chosenResource.id] : eligible.map((item) => item.id),
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg tracking-tight">Randevu alın</h1>
        <p className="text-[13px] text-ink-2">
          {tenant.name} · Aşağıdaki adımların hepsi bu sayfada. Bir seçimi değiştirmek
          isterseniz üzerine dokunmanız yeterli.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {holdExpired && (
        <Alert tone="error">
          Ayırdığımız süre doldu ve saat serbest bırakıldı. Aşağıdan yeniden bir saat seçin.
        </Alert>
      )}

      {/* ------------------------------------------------------- şube */}
      {page.branches.length > 1 && (
        <Section step={0} title="Şube" chosen={branch?.name} id="sube">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {page.branches.map((item) => (
              <Choice
                key={item.id}
                href={bookingHref(slug, { sube: item.id })}
                selected={branch?.id === item.id}
                label={item.name}
                hint={item.address}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ----------------------------------------------------- hizmet */}
      <Section
        step={step.service}
        title="İşlem"
        chosen={service?.name}
        waiting={branch ? null : "Önce şube seçin."}
        id="islem"
      >
        <div className="flex flex-col gap-3">
          {[...new Set(page.services.map((item) => item.category ?? ""))].map((category) => (
            <div key={category || "genel"} className="flex flex-col gap-1.5">
              {category && (
                <h3 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3">
                  {category}
                </h3>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {page.services
                  .filter((item) => (item.category ?? "") === category)
                  .map((item) => (
                    <Choice
                      key={item.id}
                      // İşlem değişince hekim ve gün sıfırlanır: eski hekim
                      // yeni işlemi vermiyor olabilir, eski gün dolu olabilir.
                      href={href({
                        hizmet: item.id,
                        kaynak: undefined,
                        tarih: undefined,
                        tutma: undefined,
                      })}
                      selected={service?.id === item.id}
                      label={item.name}
                      hint={[
                        formatDuration(item.durationMin),
                        page.branding.show_prices && item.price !== null
                          ? formatPrice(item.price, tenant.currency)
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------ hekim */}
      {showResourceSection && (
        <Section
          step={step.resource}
          title="Hekim"
          chosen={service ? (chosenResource ? chosenResource.label : "Fark etmez") : null}
          waiting={service ? null : "Önce yukarıdan bir işlem seçin."}
          id="hekim"
        >
          {eligible.length === 1 ? (
            // Bu işlemi tek hekim veriyor: seçenek değil, bilgi.
            <p className="rounded border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
              Bu işlem için <span className="font-medium text-ink">{eligible[0].label}</span>{" "}
              randevu veriyor.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Choice
                href={href({ kaynak: undefined, tarih: undefined, tutma: undefined })}
                selected={!chosenResource}
                label="Fark etmez"
                hint="En erken boşalan saat"
              />
              {eligible.map((item) => (
                <Choice
                  key={item.id}
                  href={href({ kaynak: item.id, tarih: undefined, tutma: undefined })}
                  selected={chosenResource?.id === item.id}
                  label={item.label}
                />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ---------------------------------------------- gün ve saat */}
      <Section
        step={step.time}
        title="Gün ve saat"
        waiting={service ? null : "Önce yukarıdan bir işlem seçin."}
        id="saat"
      >
        {eligible.length === 0 ? (
          <EmptyState
            title="Bu işlem için internetten randevu verilemiyor"
            body="Bizi arayarak randevu alabilirsiniz."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* Gün şeridi — yatay kaydırılır, sayfayı yana kaydırmaz */}
            <div className="flex items-stretch gap-2">
              {window.previousStart ? (
                <Link
                  href={href({ bas: window.previousStart, tutma: undefined })}
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
                          href={href({ bas: window.days[0], tarih: date, tutma: undefined })}
                          aria-current={active ? "true" : undefined}
                          className={[
                            "flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded border px-1 no-underline",
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
                          className="flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-border px-1 text-ink-3"
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
                  href={href({ bas: window.nextStart, tutma: undefined })}
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
                    ? "Sağdaki okla sonraki günlere bakabilir ya da bizi arayabilirsiniz."
                    : "Bizi arayarak randevu alabilirsiniz."
                }
              />
            ) : selectedDay.slots.length === 0 ? (
              <EmptyState title="Bu günde uygun saat yok" body="Şeritten saati olan bir gün seçin." />
            ) : (
              <form action={holdSlotAction} className="flex flex-col gap-3">
                <input type="hidden" name="slug" value={slug} />
                <input type="hidden" name="hizmet" value={service!.id} />
                <input type="hidden" name="kaynak" value={resourceParam} />
                {branchParam && <input type="hidden" name="sube" value={branchParam} />}
                <input type="hidden" name="bas" value={window.days[0]} />
                <input type="hidden" name="tarih" value={selectedDay.date} />

                <fieldset className="flex flex-col gap-3">
                  <legend className="sr-only">
                    {formatDayChip(selectedDay.date).day} için uygun saatler
                  </legend>

                  {groupByDaypart(selectedDay.slots, (slot) =>
                    Number(formatTime(slot.startsAt, timeZone).slice(0, 2)),
                  ).map((group) => (
                    <div key={group.label} className="flex flex-col gap-1.5">
                      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">
                        {group.label}
                      </p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                        {group.items.map((slot) => {
                          const selected =
                            holdValid && held!.startsAt.getTime() === slot.startsAt.getTime();
                          return (
                            <button
                              key={slot.startsAt.toISOString()}
                              type="submit"
                              name="secim"
                              value={encodeSlotChoice(slot.startsAt, slot.resourceIds)}
                              data-numeric
                              aria-current={selected ? "true" : undefined}
                              className={[
                                "h-11 rounded border text-[15px] font-medium",
                                "transition-[background-color,border-color,color] duration-150",
                                selected
                                  ? "border-accent bg-accent text-accent-ink"
                                  : "border-border bg-surface text-ink hover:border-accent hover:bg-accent-soft",
                              ].join(" ")}
                            >
                              {formatTime(slot.startsAt, timeZone)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </fieldset>
              </form>
            )}
          </div>
        )}
      </Section>

      {/* -------------------------------------------------- bilgiler */}
      <Section
        step={step.details}
        title="Bilgileriniz"
        waiting={holdValid ? null : "Önce yukarıdan bir saat seçin."}
        id="bilgiler"
      >
        {holdValid && held && (
          <div className="flex flex-col gap-4">
            <div className={`${CARD} flex flex-col gap-2 px-4 py-3`}>
              <p className="text-[13px] text-ink-2">Seçtiğiniz randevu</p>
              <p className="text-[15px] font-medium text-ink" data-numeric>
                {formatLongDateTime(held.startsAt, held.timeZone)}
              </p>
              <p className="min-w-0 truncate text-[13px] text-ink-2">
                {held.serviceName} · {held.resourceLabel}
              </p>
              <p className="border-t border-border pt-2 text-[13px] text-ink-3">
                Bu saat{" "}
                <span data-numeric>
                  {new Intl.DateTimeFormat("tr-TR", {
                    timeZone: held.timeZone,
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(held.holdExpiresAt!)}
                </span>
                ’e kadar sizin adınıza tutuluyor.
              </p>
            </div>

            <DetailsForm
              slug={slug}
              token={query.tutma!}
              consents={buildConsentBoxes(tenant.name)}
              disclosureHref={`/r/${slug}/kvkk`}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
