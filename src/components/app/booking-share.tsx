import { CopyButton } from "@/components/app/copy-button";
import { QrCode } from "@/components/app/qr-code";
import { bookingDisplayUrl, bookingUrl, shareChannels } from "@/lib/booking/share";

/**
 * Kurumun randevu sayfasını müşterisine ulaştırdığı yer.
 *
 * Kurulum biter bitmez bir kez, ayarlarda ise kalıcı olarak görünüyor.
 * Tek bileşen olmasının sebebi: adresi iki yerde iki türlü yazmak, birinin
 * diğerinden sapmasıyla biter — eski sihirbazdaki sabit "teyitrandevu.com"
 * metni tam olarak böyle sapmıştı.
 *
 * Sıralama kullanım sıklığına göre: önce bağlantının kendisi (kopyalanıp
 * her yere gider), sonra QR (bir kez basılır, masada durur), en sonda
 * kanal kanal nereye konacağı. Kurum ilk gün üçünü de yapmaz; en üstteki
 * tek başına yeterli.
 */
export function BookingShare({
  slug,
  tenantName,
  /** Kurulum sonrası kısa hâli: kanal listesi gösterilmez. */
  compact = false,
}: {
  slug: string;
  tenantName: string;
  compact?: boolean;
}) {
  const url = bookingUrl(slug);
  const display = bookingDisplayUrl(slug);
  const channels = shareChannels(tenantName, url);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded border border-border bg-surface p-4">
        {/* --- bağlantının kendisi --- */}
        <div className="flex flex-col gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Randevu bağlantınız</h2>
          <p className="text-[13px] text-ink-2">
            {tenantName} için randevu alan herkes bu adrese gidiyor. Adresi paylaşmanız
            yeterli; müşterinizin uygulama indirmesi ya da üye olması gerekmiyor.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <code
              translate="no"
              className="min-w-0 flex-1 truncate rounded border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[13px] text-ink"
            >
              {display}
            </code>
            <CopyButton
              value={url}
              label="Bağlantıyı kopyala"
              ariaLabel="Randevu bağlantısını kopyala"
            />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              data-control="sm"
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-border bg-surface px-2.5 text-[13px] font-medium text-ink no-underline transition-[background-color,border-color,color] duration-150 hover:border-border-strong hover:bg-surface-2"
            >
              Sayfayı aç
              <span aria-hidden="true" className="font-mono text-[11px] text-ink-3">
                ↗
              </span>
            </a>
          </div>
        </div>

        {/* --- QR --- */}
        <div className="flex flex-wrap items-start gap-4 border-t border-border pt-4">
          <div className="shrink-0 rounded border border-border bg-white p-2">
            <QrCode
              value={url}
              label={`${tenantName} randevu sayfasının karekodu`}
              className="size-28 text-black"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
            <h3 className="text-[13px] font-medium text-ink">Karekod</h3>
            <p className="text-[13px] text-ink-2">
              Resepsiyon masasına, kapıya ya da kartvizite basın. Telefon kamerasını
              tutan kişi doğrudan randevu sayfasına düşer.
            </p>
            <a
              // Adres sorgu parametresiyle taşınmıyor: uç, oturumdaki kurumun
              // kendi adresini üretiyor. Başkasının adresi için karekod
              // istenemesin.
              href="/app/ayarlar/randevu-sayfasi/karekod"
              download
              data-control="sm"
              className="inline-flex h-8 items-center rounded border border-border bg-surface px-2.5 text-[13px] font-medium text-ink no-underline transition-[background-color,border-color,color] duration-150 hover:border-border-strong hover:bg-surface-2"
            >
              PNG indir
            </a>
          </div>
        </div>
      </div>

      {/* --- kanallar --- */}
      {!compact && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-ink">Nereye koyacaksınız</h2>
            <p className="text-[13px] text-ink-2">
              Randevunun internetten gelmesi için bağlantının müşterinin baktığı yerde
              durması gerekiyor. En çok işe yarayan üç yer:
            </p>
          </div>

          <ul className="flex flex-col divide-y divide-border rounded border border-border bg-surface">
            {channels.map((channel) => (
              <li key={channel.key} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="min-w-0 text-[13px] font-medium text-ink">{channel.label}</h3>
                  <CopyButton
                    value={channel.body}
                    label={channel.body === url ? "Bağlantıyı kopyala" : "Metni kopyala"}
                    ariaLabel={`${channel.label} için ${
                      channel.body === url ? "bağlantıyı" : "metni"
                    } kopyala`}
                  />
                </div>

                {channel.body !== url && (
                  <p className="whitespace-pre-line rounded border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-ink-2">
                    {channel.body}
                  </p>
                )}

                <p className="text-[13px] text-ink-3">{channel.hint}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
