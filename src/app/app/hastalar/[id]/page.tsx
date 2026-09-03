import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CUSTOMER_ERASE,
  CUSTOMER_WRITE,
  loadPermissions,
  MEDICAL_READ,
  MEDICAL_WRITE,
} from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import { anonymizeCustomerAction, updateCustomerAction } from "@/lib/customers/actions";
import { ageFrom, formatFieldValue, visibleFields } from "@/lib/customers/fields";
import {
  loadBranchOptions,
  loadCustomerCard,
  type CustomerVisit,
  type MedicalNote,
} from "@/lib/customers/queries";
import { loadConsents } from "@/lib/legal/consents";
import { STATUS_STYLES } from "@/lib/scheduling/status";
import { formatPhoneTr } from "@/lib/utils/phone";

import { CustomerForm } from "../customer-form";
import { ConsentList } from "./consent-list";
import { MedicalNoteForm } from "./medical-note-form";

export const metadata: Metadata = { title: "Hasta" };

export default async function HastaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    kaydedildi?: string;
    ikiz?: string;
    not?: string;
    riza?: string;
    imha?: string;
  }>;
}) {
  const { active } = await requireTenant();
  const { id } = await params;
  const { kaydedildi, ikiz, not, riza, imha } = await searchParams;

  const permissions = await loadPermissions();
  const canReadMedical = permissions.can(MEDICAL_READ);
  const canWriteMedical = permissions.can(MEDICAL_WRITE);
  const canWriteCustomer = permissions.can(CUSTOMER_WRITE);
  const canErase = permissions.can(CUSTOMER_ERASE);

  // Üçü paralel: rıza kayıtları ve şube listesi karta bir tur daha eklemesin.
  const [card, consents, branches] = await Promise.all([
    loadCustomerCard({
      tenantId: active.tenant.id,
      customerId: id,
      timeZone: active.tenant.timezone,
      withMedicalNotes: canReadMedical,
    }),
    loadConsents(active.tenant.id, id),
    loadBranchOptions(active.tenant.id),
  ]);
  if (!card) notFound();
  const { customer } = card;
  const age = customer.birthDate ? ageFrom(customer.birthDate) : null;
  const fields = visibleFields(card.fields, canReadMedical);
  const filled = fields
    .map((field) => ({ field, value: formatFieldValue(field, customer.customData[field.key]) }))
    .filter((entry) => entry.value !== null);

  const dayTime = new Intl.DateTimeFormat("tr-TR", {
    timeZone: active.tenant.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const dayOnly = new Intl.DateTimeFormat("tr-TR", {
    timeZone: active.tenant.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/hastalar" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Hastalara dön
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg tracking-tight">{customer.fullName}</h1>
          {age !== null && <p className="text-[13px] text-ink-2">{age} yaşında</p>}
          {customer.noShowCount > 0 && (
            <p className="rounded-sm bg-st-noshow-soft px-1.5 py-0.5 text-[12px] text-ink">
              {customer.noShowCount} randevuya gelmedi
            </p>
          )}
        </div>
        <p className="font-mono text-[13px] text-ink-3">
          {customer.phone ? formatPhoneTr(customer.phone) : "telefon yok"}
          {customer.email && ` · ${customer.email}`}
          {customer.birthDate && ` · ${dayOnly.format(new Date(`${customer.birthDate}T12:00:00Z`))}`}
        </p>
        {customer.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {customer.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-[12px] text-ink-2"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      {customer.anonymizedAt && (
        <Alert tone="info">
          Bu kayıt {dayOnly.format(customer.anonymizedAt)} tarihinde KVKK kapsamında
          anonimleştirildi. Randevu geçmişi ticari kayıt olduğu için duruyor; kişiyi tanımlayan
          bilgiler ve tıbbi notlar silindi.
        </Alert>
      )}
      {imha === "tamam" && (
        <Alert tone="success">Kayıt anonimleştirildi. İşlem denetim kaydına yazıldı.</Alert>
      )}
      {imha === "yetki" && (
        <Alert tone="error">Bu işlem için yetkiniz yok. İmha izni rol bazında verilir.</Alert>
      )}
      {imha === "hata" && (
        <Alert tone="error">Kayıt anonimleştirilemedi. Tekrar deneyin.</Alert>
      )}
      {kaydedildi && <Alert tone="success">Hasta bilgileri kaydedildi.</Alert>}
      {not && <Alert tone="success">Tıbbi not eklendi.</Alert>}
      {riza === "riza" && <Alert tone="success">Rıza kaydı düşüldü.</Alert>}
      {riza === "riza_geri" && (
        <Alert tone="success">
          Rıza geri alındı. Ticari ileti izniyse bundan sonraki kampanya mesajları
          gönderilmeyecek; bekleyenler gönderim anında yeniden kontrol edilir.
        </Alert>
      )}
      {riza && riza !== "riza" && riza !== "riza_geri" && <Alert tone="error">{riza}</Alert>}
      {ikiz && (
        <Alert tone="error">
          Bu telefon numarası başka bir kayıtta da var.{" "}
          <Link href={`/app/hastalar/${ikiz}`} className="underline underline-offset-2">
            Diğer kaydı aç
          </Link>{" "}
          — aynı kişiyse birini kullanmayı bırakın, aile üyesiyse bu uyarı görmezden gelinebilir.
        </Alert>
      )}

      {/* İmha edilmiş kayda yeni veri yazmak teklif edilmiyor: randevu, rıza
          ve tıbbi not düğmeleri kapalı. Kayıt duruyor ama artık salt okunur. */}
      <div className="flex flex-wrap items-center gap-2">
        {!customer.anonymizedAt && (
        <Link
          href={`/app/randevu/yeni?hasta=${customer.id}`}
          className="inline-flex h-8 items-center rounded border border-accent bg-accent px-2.5 text-[13px] font-medium text-accent-ink no-underline transition-colors duration-150 hover:bg-accent-hover"
        >
          Randevu Ver
        </Link>
        )}
        {customer.phone && (
          <a
            href={`tel:${customer.phone}`}
            className="inline-flex h-8 items-center rounded border border-border bg-surface px-2.5 text-[13px] text-ink no-underline transition-colors duration-150 hover:bg-surface-2"
          >
            Ara
          </a>
        )}
      </div>

      {filled.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-ink-2">Kayıt bilgileri</h2>
          <dl className="grid gap-x-6 gap-y-2 rounded border border-border bg-surface p-3 sm:grid-cols-2">
            {filled.map(({ field, value }) => (
              <div key={field.key} className="flex min-w-0 flex-col">
                <dt className="text-[12px] text-ink-3">
                  {field.label}
                  {field.isMedical && (
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-st-noshow">
                      tıbbi
                    </span>
                  )}
                </dt>
                <dd className="break-words text-[13px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <ConsentList
        customerId={customer.id}
        consents={consents}
        canWrite={canWriteCustomer && !customer.anonymizedAt}
        formatter={dayTime}
      />

      {customer.notes && (
        <section className="flex flex-col gap-2">
          <h2 className="text-[13px] font-medium text-ink-2">İdari not</h2>
          <p className="whitespace-pre-wrap break-words rounded border border-border bg-surface p-3 text-[13px] text-ink">
            {customer.notes}
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-medium text-ink-2">Randevular</h2>
        {card.upcoming.length === 0 && card.past.length === 0 ? (
          <p className="rounded border border-dashed border-border p-6 text-[13px] text-ink-2">
            Bu hastanın hiç randevusu yok.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {card.upcoming.length > 0 && (
              <VisitList title="Sıradaki" visits={card.upcoming} dayTime={dayTime} />
            )}
            {card.past.length > 0 && (
              <VisitList title="Geçmiş" visits={card.past} dayTime={dayTime} />
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-medium text-ink-2">Tıbbi notlar</h2>
        {!canReadMedical ? (
          <p className="rounded border border-dashed border-border p-6 text-[13px] text-ink-2">
            Tıbbi notlar ayrı bir izne tabidir ve rolünüzde yok. Bu bölüm boş olduğu için değil,
            yetki verilmediği için kapalı.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {card.medicalNotes.length === 0 ? (
              <p className="rounded border border-dashed border-border p-6 text-[13px] text-ink-2">
                Henüz tıbbi not yazılmamış.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {card.medicalNotes.map((note) => (
                  <MedicalNoteItem key={note.id} note={note} dayTime={dayTime} />
                ))}
              </ul>
            )}
            {canWriteMedical && !customer.anonymizedAt && (
              <MedicalNoteForm customerId={customer.id} />
            )}
          </div>
        )}
      </section>

      {!customer.anonymizedAt && (
      <section className="flex flex-col gap-3 border-t border-border pt-5">
        <details>
          <summary className="cursor-pointer text-[13px] font-medium text-ink">
            Bilgileri düzenle
          </summary>
          <div className="pt-4">
            <CustomerForm
              action={updateCustomerAction}
              defaults={{
                id: customer.id,
                fullName: customer.fullName,
                phone: customer.phone ? formatPhoneTr(customer.phone) : "",
                email: customer.email ?? "",
                birthDate: customer.birthDate ?? "",
                notes: customer.notes ?? "",
                tags: customer.tags,
                customData: customer.customData,
              }}
              fields={fields}
              branches={branches}
              branchId={customer.branchId ?? branches[0]?.id ?? null}
              submitLabel="Değişiklikleri Kaydet"
              pendingLabel="Kaydediliyor…"
              cancelHref={`/app/hastalar/${customer.id}`}
            />
          </div>
        </details>
      </section>
      )}

      {canErase && !customer.anonymizedAt && (
        <section className="flex flex-col gap-3 border-t border-border pt-5">
          <details>
            <summary className="cursor-pointer text-[13px] font-medium text-st-noshow">
              Kaydı anonimleştir (KVKK imha talebi)
            </summary>

            <div className="flex max-w-2xl flex-col gap-3 pt-4">
              <p className="text-[13px] leading-relaxed text-ink-2">
                Kişi &ldquo;kaydımı silin&rdquo; dediğinde uygulanacak işlem budur. Ad, telefon,
                e-posta, doğum tarihi, notlar, esnek alanlar ve <strong>tıbbi notların tamamı</strong>{" "}
                silinir; gönderilmiş mesajların metni temizlenir.
              </p>
              <p className="text-[13px] leading-relaxed text-ink-2">
                Randevu satırları <strong>kalır</strong>: randevu geçmişi aynı zamanda kliniğin
                ticari kaydıdır ve onu silmek ciro ile vergi kaydını da silmek olurdu. Kalan
                satırlar artık kimseyi göstermiyor.
              </p>
              <p className="text-[13px] font-medium text-ink">Bu işlem geri alınamaz.</p>

              {imha === "onay" ? (
                <form
                  action={anonymizeCustomerAction}
                  className="flex flex-wrap items-center gap-3 rounded border border-st-noshow bg-st-noshow-soft px-3 py-2.5"
                >
                  <input type="hidden" name="id" value={customer.id} />
                  <p className="text-[13px] text-ink">
                    {customer.fullName} kaydını anonimleştirmek istediğinize emin misiniz?
                  </p>
                  <Button type="submit" variant="danger">
                    Evet, Anonimleştir
                  </Button>
                  <Link
                    href={`/app/hastalar/${customer.id}`}
                    className="text-[13px] text-ink-2 underline underline-offset-2"
                  >
                    Vazgeç
                  </Link>
                </form>
              ) : (
                <Link
                  href={`/app/hastalar/${customer.id}?imha=onay`}
                  className="self-start text-[13px] text-st-noshow underline underline-offset-2"
                >
                  Anonimleştirmeyi başlat
                </Link>
              )}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function VisitList({
  title,
  visits,
  dayTime,
}: {
  title: string;
  visits: CustomerVisit[];
  dayTime: Intl.DateTimeFormat;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[12px] uppercase tracking-wide text-ink-3">{title}</h3>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded border border-border bg-surface">
        {visits.map((visit) => {
          const status = STATUS_STYLES[visit.status];
          return (
            <li key={visit.id} className="flex min-w-0">
              <Link
                href={`/app/randevu/${visit.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-1.5 text-[13px] no-underline transition-colors duration-150 hover:bg-surface-2"
              >
                <time
                  dateTime={visit.startsAt.toISOString()}
                  className="w-44 shrink-0 truncate font-mono text-ink-2"
                >
                  {dayTime.format(visit.startsAt)}
                </time>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {visit.serviceName ?? "Hizmet seçilmemiş"}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-ink-3 sm:inline">
                  {visit.resourceName ?? ""}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-ink-2">
                  <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MedicalNoteItem({ note, dayTime }: { note: MedicalNote; dayTime: Intl.DateTimeFormat }) {
  return (
    <li className="flex flex-col gap-1 rounded border border-border bg-surface p-3">
      <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px] text-ink-3">
        <time dateTime={note.createdAt.toISOString()}>{dayTime.format(note.createdAt)}</time>
        {note.resourceName && <span>· {note.resourceName}</span>}
        {note.updatedAt.getTime() - note.createdAt.getTime() > 60_000 && (
          <span>· düzenlendi {dayTime.format(note.updatedAt)}</span>
        )}
      </p>
      <p className="whitespace-pre-wrap break-words text-[13px] text-ink">{note.body}</p>
    </li>
  );
}
