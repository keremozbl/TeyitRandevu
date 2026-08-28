import type { Enums } from "@/lib/supabase/types";

/**
 * Kanal soyutlaması (Plan 7.3).
 *
 * Sağlayıcı değiştirmek tek dosya olsun diye her kanal aynı arayüzün arkasında
 * duruyor. Bugün NetGSM ya da WhatsApp Cloud API sözleşmesi YOK; tek gerçek
 * uygulama `log` — mesajı göndermez, ne gönderileceğini kaydeder.
 *
 * Bu bilinçli: altyapının doğruluğu (kuyruk, zamanlama, İYS kapısı, metin)
 * sağlayıcıdan bağımsız ve sağlayıcı gelmeden test edilebilir olmalı. Sözleşme
 * imzalanınca yapılacak iş, bu dosyaya bir `send` uygulaması eklemek.
 *
 * `log` sağlayıcısı gönderdiğini SÖYLEMİYOR: kuyruk satırına `provider = 'log'`
 * yazılıyor ve panel bunu "gerçekten gönderilmedi" diye gösteriyor. Kuruma
 * gitmemiş bir mesajı gitmiş göstermek, hiç göndermemekten daha kötü olurdu.
 */

export type NotificationChannel = Enums<"notification_channel">;

export type SendInput = {
  channel: NotificationChannel;
  to: string;
  subject: string | null;
  body: string;
};

export type SendResult = {
  /** Sağlayıcının kendi kayıt numarası — mutabakat ve destek için */
  ref: string | null;
  /** Sağlayıcının bildirdiği ücret; kontör defterine bu girecek (Plan 7.6) */
  cost: number | null;
};

export interface MessageProvider {
  readonly name: string;
  send(input: SendInput): Promise<SendResult>;
}

/**
 * Gönderme taklidi yapmayan sağlayıcı: mesajı sunucu günlüğüne yazar.
 * Kuyruğun, zamanlamanın ve metnin doğruluğu buradan izlenebilir.
 */
export const logProvider: MessageProvider = {
  name: "log",
  async send(input) {
    console.info(
      `[bildirim:log] ${input.channel} → ${input.to}` +
        (input.subject ? ` · ${input.subject}` : "") +
        `\n${input.body}`,
    );
    return { ref: null, cost: 0 };
  },
};

/**
 * Kanal → sağlayıcı. Sözleşme imzalandığında yapılacak tek değişiklik bu
 * eşlemeye bir satır eklemek.
 */
const PROVIDERS: Record<NotificationChannel, MessageProvider> = {
  sms: logProvider,
  whatsapp: logProvider,
  email: logProvider,
  voice: logProvider,
};

export function providerFor(channel: NotificationChannel): MessageProvider {
  return PROVIDERS[channel] ?? logProvider;
}

/** Gerçekten gönderen bir sağlayıcı var mı — arayüz bunu açıkça söyler. */
export function isRealProvider(name: string | null | undefined): boolean {
  return Boolean(name) && name !== "log";
}
