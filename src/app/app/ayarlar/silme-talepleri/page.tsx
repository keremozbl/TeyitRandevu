import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { CUSTOMER_ERASE, loadPermissions } from "@/lib/auth/permissions";
import { requireTenant } from "@/lib/auth/session";
import {
  CHANNEL_LABELS,
  daysLeft,
  loadErasureRequests,
  STATUS_LABELS,
  type ErasureRequest,
} from "@/lib/legal/erasure";
import {
  createErasureRequestAction,
  resolveErasureRequestAction,
} from "@/lib/legal/erasure-actions";
import { formatPhoneTr } from "@/lib/utils/phone";

export const metadata: Metadata = { title: "Silme talepleri" };

const DURUM: Record<string, { tone: "success" | "error" | "info"; text: string }> = {
  kaydedildi: { tone: "success", text: "Talep kaydedildi." },
  kapatildi: { tone: "success", text: "Talep kapatıldı ve cevabı kayda geçti." },
  acik_talep: { tone: "info", text: "Bu kişinin zaten bekleyen bir talebi var." },
  eksik: { tone: "error", text: "Başvuranın adı gerekli." },
  gerekce: { tone: "error", text: "Kapatma gerekçesi yazılmalı: cevabın kendisi de kayıttır." },
  kayit_yok: { tone: "error", text: "Talep bir kayda bağlı değil; önce kişiyi eşleştirin." },
  yetki: { tone: "error", text: "İmha yetkiniz yok." },
  bulunamadi: { tone: "error", text: "Talep bulunamadı." },
  hata: { tone: "error", text: "İşlem tamamlanamadı. Tekrar deneyin." },
};

export default async function SilmeTalepleriPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; hepsi?: string }>;
}) {
  const { active } = await requireTenant();
  const { durum, hepsi } = await searchParams;

  const permissions = await loadPermissions();
  // Yetki RLS'te; buradaki kontrol boş liste yerine 404 göstermek için —
  // "talep yok" ile "görme yetkin yok" çok farklı iki cümle.
  if (!permissions.can(CUSTOMER_ERASE)) notFound();

  const showAll = hepsi === "1";
  const requests = await loadErasureRequests({
    tenantId: active.tenant.id,
    onlyOpen: !showAll,
  });

  const day = new Intl.DateTimeFormat("tr-TR", {
    timeZone: active.tenant.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const alert = durum ? DURUM[durum] : null;

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/app/ayarlar" className="text-[13px] text-ink-2 no-underline hover:text-ink">
          ‹ Ayarlara dön
        </Link>
        <h1 className="text-lg tracking-tight">Silme talepleri</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-2">
          KVKK m.11 kapsamında gelen &ldquo;kaydımı silin&rdquo; başvuruları. Cevap süresi
          <strong className="font-medium text-ink"> otuz gün</strong>: sayaç talebin geldiği günden
          işliyor. Telefonla ya da kapıda gelen talebi de buraya yazın — imhayı yapmak yetmiyor,
          talebin ve cevabın kayıtlı olması gerekiyor.
        </p>
      </div>

      {alert && <Alert tone={alert.tone}>{alert.text}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/app/ayarlar/silme-talepleri"
          aria-current={!showAll ? "page" : undefined}
          className={`inline-flex h-8 items-center rounded border px-2.5 text-[13px] no-underline transition-colors duration-150 ${
            !showAll
              ? "border-accent bg-accent-soft text-ink"
              : "border-border bg-surface text-ink-2 hover:bg-surface-2"
          }`}
        >
          Bekleyenler
        </Link>
        <Link
          href="/app/ayarlar/silme-talepleri?hepsi=1"
          aria-current={showAll ? "page" : undefined}
          className={`inline-flex h-8 items-center rounded border px-2.5 text-[13px] no-underline transition-colors duration-150 ${
            showAll
              ? "border-accent bg-accent-soft text-ink"
              : "border-border bg-surface text-ink-2 hover:bg-surface-2"
          }`}
        >
          Tümü
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="flex max-w-lg flex-col items-start gap-2 rounded border border-dashed border-border p-8">
          <h2 className="text-ink">{showAll ? "Hiç talep yok" : "Bekleyen talep yok"}</h2>
          <p className="text-[13px] text-ink-2">
            Randevu sayfasından gelen talepler buraya kendiliğinden düşer. Telefonla gelen bir
            talebi aşağıdaki formla kaydedin.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} day={day} />
          ))}
        </ul>
      )}

      <section className="flex max-w-2xl flex-col gap-3 border-t border-border pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-ink">Telefonla gelen talebi kaydet</h2>
          <p className="text-[13px] text-ink-2">
            Telefon numarası kayıtlı bir kişiyle eşleşirse talep o kayda bağlanır ve tek tıkla
            anonimleştirilebilir.
          </p>
        </div>

        <form action={createErasureRequestAction} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="full_name" label="Başvuran" required>
              <Input id="full_name" name="full_name" autoComplete="off" required />
            </Field>
            <Field id="phone" label="Telefon" hint="Kayıtla eşleştirmek için.">
              <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="off" />
            </Field>
            <Field id="email" label="E-posta">
              <Input id="email" name="email" type="email" autoComplete="off" spellCheck={false} />
            </Field>
            <Field id="channel" label="Nasıl geldi">
              <Select id="channel" name="channel" defaultValue="telefon">
                <option value="telefon">Telefon</option>
                <option value="eposta">E-posta</option>
                <option value="kapida">Kapıda</option>
              </Select>
            </Field>
          </div>
          <Field id="note" label="Not" hint="Başvuranın söyledikleri; kimlik doğrulaması yapıldıysa nasıl.">
            <Textarea id="note" name="note" rows={2} maxLength={2000} />
          </Field>
          <Button type="submit" variant="primary" className="w-fit">
            Talebi Kaydet
          </Button>
        </form>
      </section>
    </div>
  );
}

function RequestCard({ request, day }: { request: ErasureRequest; day: Intl.DateTimeFormat }) {
  const open = request.status === "yeni";
  const left = daysLeft(request.dueAt);
  const late = left < 0;

  return (
    <li
      className={`flex flex-col gap-3 rounded border bg-surface p-4 ${
        open && late ? "border-st-noshow" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-[15px] font-medium text-ink">{request.fullName}</p>
        {request.phone && (
          <p data-numeric className="font-mono text-[13px] text-ink-3">
            {formatPhoneTr(request.phone)}
          </p>
        )}
        <p className="text-[12px] text-ink-3">
          {CHANNEL_LABELS[request.channel] ?? request.channel} · {day.format(request.createdAt)}
        </p>
        <span
          className={`rounded-sm px-1.5 py-0.5 text-[12px] ${
            open
              ? late
                ? "bg-st-noshow-soft text-st-noshow"
                : "bg-st-pending-soft text-st-pending"
              : "bg-st-confirmed-soft text-st-confirmed"
          }`}
        >
          {STATUS_LABELS[request.status]}
        </span>
        {open && (
          <span data-numeric className={`text-[12px] ${late ? "text-st-noshow" : "text-ink-2"}`}>
            {late ? `süre ${-left} gün aşıldı` : `cevaba ${left} gün`}
          </span>
        )}
      </div>

      {request.note && (
        <p className="whitespace-pre-wrap break-words text-[13px] text-ink-2">{request.note}</p>
      )}

      {request.customerId ? (
        <p className="text-[13px] text-ink-2">
          <Link
            href={`/app/hastalar/${request.customerId}`}
            className="text-accent underline underline-offset-2"
          >
            Eşleşen kaydı aç
          </Link>
          {request.customerAnonymizedAt && " · kayıt zaten anonimleştirilmiş"}
        </p>
      ) : (
        <p className="text-[13px] text-ink-3">
          Eşleşen kayıt bulunamadı. Kişiyi listeden bulup kartından anonimleştirin, sonra bu
          talebi gerekçesiyle kapatın.
        </p>
      )}

      {open && (
        <div className="flex flex-col gap-3 border-t border-border pt-3">
          {request.customerId && !request.customerAnonymizedAt && (
            <form action={resolveErasureRequestAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={request.id} />
              <input type="hidden" name="anonimlestir" value="1" />
              <Button type="submit" variant="danger">
                Kaydı Anonimleştir ve Talebi Kapat
              </Button>
              <span className="text-[12px] text-ink-3">Geri alınamaz.</span>
            </form>
          )}

          <form action={resolveErasureRequestAction} className="flex flex-col gap-2">
            <input type="hidden" name="id" value={request.id} />
            <Field
              id={`gerekce-${request.id}`}
              label="İmha uygulamadan kapat"
              hint="Gerekçe zorunlu: kimlik doğrulanamadı, yasal saklama süresi devam ediyor, kayıt bulunamadı…"
            >
              <Input id={`gerekce-${request.id}`} name="gerekce" maxLength={500} />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" name="durum" value="islendi">
                İşlendi Olarak Kapat
              </Button>
              <Button type="submit" name="durum" value="reddedildi" variant="ghost">
                Reddedildi Olarak Kapat
              </Button>
            </div>
          </form>
        </div>
      )}

      {!open && request.resolution && (
        <p className="border-t border-border pt-3 text-[13px] text-ink-2">
          <span className="text-ink-3">Cevap: </span>
          {request.resolution}
          {request.resolvedAt && (
            <span className="text-ink-3"> · {day.format(request.resolvedAt)}</span>
          )}
        </p>
      )}
    </li>
  );
}
