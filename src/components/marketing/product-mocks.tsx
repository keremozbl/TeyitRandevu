/**
 * Ürünün kendisi — sitede gösterilen parçalar.
 *
 * Neden ekran görüntüsü değil: PNG karanlık modda ikinci bir set ister,
 * mobilde okunmaz, arayüz değişince eskir ve demo hasta adlarını görselin
 * içine gömer. Bunlar aynı token'larla çizildiği için ürünle birlikte
 * değişiyor ve her temada doğru görünüyor.
 *
 * Hepsi `aria-hidden`: taşıdıkları bilgi yanlarındaki metinde zaten yazıyor,
 * ekran okuyucuya uydurma hasta adı okutmanın anlamı yok.
 */

const frame =
  "overflow-hidden rounded border border-border bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]";

function Chrome({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-1.5">
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-3">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- gün ızgarası */

const ROWS = ["09:00", "09:30", "10:00", "10:30", "11:00"];

type Block = { col: 0 | 1; start: number; span: number; service: string; who: string; tone: string };

const BLOCKS: Block[] = [
  { col: 0, start: 0, span: 2, service: "İmplant", who: "A. Yılmaz", tone: "border-l-st-confirmed bg-st-confirmed-soft" },
  { col: 0, start: 3, span: 1, service: "Kontrol", who: "M. Kaya", tone: "border-l-st-arrived bg-st-arrived-soft" },
  { col: 1, start: 1, span: 2, service: "Kanal tedavisi", who: "Z. Ateş", tone: "border-l-st-pending bg-st-pending-soft" },
  { col: 1, start: 4, span: 1, service: "Dolgu", who: "S. Demir", tone: "border-l-st-confirmed bg-st-confirmed-soft" },
];

export function GridMock() {
  return (
    <div className={frame} aria-hidden="true">
      <Chrome label="1 Eylül · Merkez" />
      <div className="grid grid-cols-[3.25rem_1fr_1fr] text-[12px]">
        <div className="border-b border-border bg-surface px-2 py-1.5" />
        <div className="border-b border-l border-border px-2 py-1.5 font-medium text-ink">
          Dr. Ayla Demir
        </div>
        <div className="border-b border-l border-border px-2 py-1.5 font-medium text-ink">
          Dr. Mert Kılıç
        </div>

        <div className="flex flex-col">
          {ROWS.map((time) => (
            <div
              key={time}
              className="h-11 border-b border-border px-2 pt-0.5 text-right font-mono text-[11px] text-ink-3"
            >
              {time}
            </div>
          ))}
        </div>

        {[0, 1].map((col) => (
          <div key={col} className="relative border-l border-border">
            {ROWS.map((time) => (
              <div key={time} className="h-11 border-b border-border" />
            ))}
            {BLOCKS.filter((block) => block.col === col).map((block) => (
              <div
                key={`${block.service}-${block.start}`}
                className={`absolute inset-x-1 rounded-sm border-l-2 px-1.5 py-1 ${block.tone}`}
                style={{ top: `${block.start * 2.75 + 0.15}rem`, height: `${block.span * 2.75 - 0.3}rem` }}
              >
                <p className="truncate text-[12px] font-medium text-ink">{block.service}</p>
                <p className="truncate text-[11px] text-ink-2">{block.who}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-surface-2 px-3 py-2">
        <span className="size-1.5 shrink-0 rounded-full bg-st-noshow" />
        <p className="text-[12px] text-ink-2">
          10:00 dolu — <span className="text-ink">10:30</span> ve{" "}
          <span className="text-ink">11:30</span> önerildi
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- mesajlar */

export function MessageMock() {
  return (
    <div className={frame} aria-hidden="true">
      <Chrome label="Şablon · hatırlatma" />
      <div className="flex flex-col gap-3 p-3">
        <div className="rounded border border-border bg-surface-2 p-2.5">
          <p className="text-[13px] leading-relaxed text-ink">
            Sayın Ayşe Korkmaz, 2 Eylül Çarşamba 14:30 randevunuzu hatırlatırız. Demo Diş Kliniği
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
          <span className="rounded-sm bg-st-confirmed-soft px-1.5 py-0.5 text-st-confirmed">
            hizmet bilgilendirmesi
          </span>
          <span className="font-mono text-ink-3">2 parça · 118 karakter</span>
          <span className="text-ink-3">Türkçe karakter: UCS-2</span>
        </div>

        <div className="flex items-start gap-2 border-t border-border pt-3">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-st-pending" />
          <div className="min-w-0">
            <p className="text-[12px] text-ink">
              Kampanya mesajı gönderilmedi
              <span className="ml-1.5 rounded-sm bg-st-pending-soft px-1.5 py-0.5 text-st-pending">
                ticari ileti
              </span>
            </p>
            <p className="text-[12px] text-ink-2">İYS onayı yok — kural veritabanında uygulanıyor</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hasta kartı */

export function CardMock() {
  return (
    <div className={frame} aria-hidden="true">
      <Chrome label="Hasta kartı · resepsiyon görünümü" />
      <div className="flex flex-col divide-y divide-border">
        <div className="px-3 py-2.5">
          <p className="text-[13px] font-medium text-ink">Ayşe Korkmaz</p>
          <p className="font-mono text-[12px] text-ink-3">0538 111 22 99</p>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <p className="text-[12px] text-ink-2">Randevu geçmişi</p>
          <p className="font-mono text-[12px] text-ink-3">4 kayıt</p>
        </div>
        <div className="flex items-start gap-2 bg-surface-2 px-3 py-2.5">
          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-st-cancelled" />
          <div>
            <p className="text-[12px] text-ink">Tıbbi notlar görünmüyor</p>
            <p className="text-[12px] text-ink-2">
              Bu rolde yetki yok — veri arayüzde gizlenmiyor, sorgu boş dönüyor
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <p className="text-[12px] text-ink-2">Rıza kayıtları</p>
          <p className="text-[12px] text-st-confirmed">Aydınlatma · açık rıza verildi</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- online randevu */

const SLOTS = ["09:00", "09:30", "10:30", "11:00", "13:00", "14:30"];

export function BookingMock() {
  return (
    <div className={frame} aria-hidden="true">
      <Chrome label="teyitrandevu.com/r/klinik" />
      <div className="flex flex-col gap-3 p-3">
        <p className="text-[12px] text-ink-2">2 Eylül Çarşamba · İmplant · 45 dakika</p>
        <div className="grid grid-cols-3 gap-1.5">
          {SLOTS.map((slot, index) => (
            <span
              key={slot}
              className={`rounded border px-2 py-1.5 text-center font-mono text-[12px] ${
                index === 3
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-border bg-surface text-ink"
              }`}
            >
              {slot}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-2.5">
          <p className="flex items-start gap-2 text-[12px] text-ink-2">
            <span className="mt-[3px] size-2.5 shrink-0 rounded-[2px] border border-accent bg-accent" />
            Aydınlatma metnini okudum
          </p>
          <p className="flex items-start gap-2 text-[12px] text-ink-2">
            <span className="mt-[3px] size-2.5 shrink-0 rounded-[2px] border border-accent bg-accent" />
            Sağlık verimin işlenmesine açık rıza veriyorum
          </p>
          <p className="flex items-start gap-2 text-[12px] text-ink-3">
            <span className="mt-[3px] size-2.5 shrink-0 rounded-[2px] border border-border-strong" />
            Ticari ileti almak istiyorum (isteğe bağlı)
          </p>
        </div>
      </div>
    </div>
  );
}

export const MOCKS = {
  grid: GridMock,
  message: MessageMock,
  card: CardMock,
  booking: BookingMock,
} as const;
