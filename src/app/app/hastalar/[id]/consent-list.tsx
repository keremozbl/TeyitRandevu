import { Button } from "@/components/ui/button";
import { recordConsentAction, revokeConsentAction } from "@/lib/legal/actions";
import { statusOf, type CardConsentKind, type ConsentState } from "@/lib/legal/consents";

/**
 * Hasta kartındaki rıza bölümü.
 *
 * Üç ayrı rıza, üç ayrı satır — tek bir "KVKK onayı" satırı hukuken yanlış
 * olurdu: aydınlatma bir bilgilendirme, sağlık rızası özel nitelikli veri
 * için açık rıza, ticari ileti izni 6563'e tabi ayrı bir onay.
 *
 * İki eylem var ve ikisi de yeni satır yazar (rıza kaydı değiştirilmez):
 * klinikte alınmış bir rızayı kaydetmek, ve rızayı geri almak.
 */

const LABELS: Record<CardConsentKind, { title: string; hint: string }> = {
  kvkk_aydinlatma: {
    title: "Aydınlatma metni",
    hint: "Bilgilendirmenin kişiye iletildiğinin kaydı. Onay değildir.",
  },
  acik_riza_saglik: {
    title: "Sağlık verisi açık rızası",
    hint: "Özel nitelikli veri için ayrıca alınır. Geri alınması, o güne kadarki işlemleri etkilemez.",
  },
  ticari_ileti: {
    title: "Ticari ileti izni",
    hint: "Kampanya ve tanıtım için. Randevu hatırlatması buna bağlı değildir; o hizmet bilgilendirmesidir.",
  },
};

const CHANNELS: Record<string, string> = {
  online_booking: "internetten",
  panel: "panelden",
  sms_reply: "SMS yanıtı",
};

export function ConsentList({
  customerId,
  consents,
  canWrite,
  formatter,
}: {
  customerId: string;
  consents: ConsentState[];
  /** `customer.write` — yoksa satırlar okunur, düğme çizilmez */
  canWrite: boolean;
  formatter: Intl.DateTimeFormat;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-[13px] font-medium text-ink-2">Rıza kayıtları</h2>
        <p className="text-[12px] text-ink-3">
          Panelden düşülen kayıt, rızanın klinikte sözlü ya da imzayla alındığını belgeler —
          hasta metni ekranda okumadı.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded border border-border bg-surface">
        {consents.map((state) => {
          const status = statusOf(state);
          const label = LABELS[state.kind];
          const latest = state.latest;

          return (
            <li key={state.kind} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium text-ink">{label.title}</span>
                  <StatusBadge status={status} />
                </div>

                {latest ? (
                  <p className="text-[12px] text-ink-3">
                    <time dateTime={(latest.revokedAt ?? latest.at).toISOString()} data-numeric>
                      {formatter.format(latest.revokedAt ?? latest.at)}
                    </time>
                    {latest.channel && ` · ${CHANNELS[latest.channel] ?? latest.channel}`}
                    {` · metin ${latest.version}`}
                    {state.history.length > 1 && ` · ${state.history.length} kayıt`}
                  </p>
                ) : (
                  <p className="text-[12px] text-ink-3">{label.hint}</p>
                )}
              </div>

              {canWrite && (
                <form
                  action={status === "granted" ? revokeConsentAction : recordConsentAction}
                  className="shrink-0"
                >
                  <input type="hidden" name="customer_id" value={customerId} />
                  <input type="hidden" name="kind" value={state.kind} />
                  <Button type="submit" size="sm" variant={status === "granted" ? "ghost" : "secondary"}>
                    {status === "granted" ? "Geri al" : "Alındı olarak kaydet"}
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof statusOf> }) {
  const map = {
    granted: { text: "Verildi", tone: "text-st-confirmed" },
    revoked: { text: "Geri alındı", tone: "text-st-noshow" },
    refused: { text: "İstemedi", tone: "text-ink-3" },
    missing: { text: "Kayıt yok", tone: "text-st-pending" },
  } as const;
  const { text, tone } = map[status];
  return <span className={`text-[12px] font-medium ${tone}`}>{text}</span>;
}
