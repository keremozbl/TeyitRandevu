"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { CONSENT_VERSION } from "@/lib/legal/consent-texts";
import { createPublicClient } from "@/lib/supabase/public";
import { toE164 } from "@/lib/utils/phone";

import { bookingErrorMessage } from "./messages";
import { bookingHref, decodeSlotChoice } from "./steps";

/**
 * Public randevu sayfasının yazma yolu.
 *
 * Hepsi `booking_*` fonksiyonlarına gider; buradaki kontroller kullanıcıya
 * anlamlı hata vermek içindir, YETKİ ya da KURAL kontrolü değildir. Ön süre,
 * ileri tarih, çalışma saati ve çakışma veritabanında yeniden bakılır — bu
 * dosyanın tamamı atlanabilir ve yine de geçersiz randevu oluşmaz.
 */

const resultSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
  token: z.string().optional(),
});

/**
 * İstemcinin IP'si — rıza kaydına yazılır (KVKK: rızanın hangi adresten
 * verildiği ispatın parçası) ve kaba kuvvet frenine girdi olur.
 *
 * Vercel `x-forwarded-for` yazıyor; ilk değer istemci, sonrakiler proxy'ler.
 * Biçimi tutmayan bir değer `inet` cast'inde patlar, o yüzden burada elenir.
 */
async function clientIp(): Promise<string | undefined> {
  const store = await headers();
  const raw = store.get("x-forwarded-for")?.split(",")[0] ?? store.get("x-real-ip") ?? "";
  const candidate = raw.trim();
  if (!candidate || candidate.length > 45) return undefined;
  return /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : undefined;
}

async function clientUserAgent(): Promise<string | undefined> {
  const store = await headers();
  return store.get("user-agent")?.slice(0, 400) ?? undefined;
}

const holdSchema = z.object({
  slug: z.string().min(1),
  hizmet: z.uuid(),
  /** Saat düğmesinin değeri: başlangıç anı + denenecek kaynaklar */
  secim: z.string().min(1),
  kaynak: z.string().optional(),
  sube: z.string().optional(),
  bas: z.string().optional(),
  tarih: z.string().optional(),
});

/**
 * Saat seçimi → slot tutma. Başarılıysa bilgiler adımına, değilse aynı sayfaya
 * hata koduyla döner; iki durumda da yönlendirme var, çünkü form POST'unun
 * üzerinde kalmak yenilemede aynı isteği tekrar gönderir.
 *
 * "Hekim fark etmez" seçilmişse kaynaklar SIRAYLA denenir: ilk hekimin saati
 * bu arada dolduysa ikincisi hâlâ boş olabilir ve hasta bunu bilmek zorunda
 * değil.
 */
export async function holdSlotAction(formData: FormData): Promise<void> {
  const parsed = holdSchema.safeParse({
    slug: formData.get("slug"),
    hizmet: formData.get("hizmet"),
    secim: formData.get("secim"),
    kaynak: formData.get("kaynak") ?? undefined,
    sube: formData.get("sube") ?? undefined,
    bas: formData.get("bas") ?? undefined,
    tarih: formData.get("tarih") ?? undefined,
  });

  if (!parsed.success) redirect("/");
  const input = parsed.data;

  const back = (hata: string) =>
    bookingHref(input.slug, {
      sube: input.sube,
      hizmet: input.hizmet,
      kaynak: input.kaynak,
      bas: input.bas,
      tarih: input.tarih,
      hata,
    });

  const choice = decodeSlotChoice(input.secim);
  if (!choice) redirect(back("slot_taken"));

  const supabase = createPublicClient();
  const ip = await clientIp();

  let lastReason = "slot_taken";

  for (const resourceId of choice.resourceIds) {
    const { data, error } = await supabase.rpc("booking_hold", {
      _slug: input.slug,
      _service_id: input.hizmet,
      _resource_id: resourceId,
      _starts_at: choice.startsAt.toISOString(),
      _ip: ip,
    });

    if (error) {
      lastReason = "not_found";
      break;
    }

    const result = resultSchema.safeParse(data);
    if (!result.success) {
      lastReason = "not_found";
      break;
    }

    if (result.data.ok && result.data.token) {
      redirect(`/r/${input.slug}/bilgiler/${result.data.token}`);
    }

    lastReason = result.data.reason ?? "slot_taken";
    // Yalnız "dolu" bir sonraki kaynağı denemeye değer; kural ihlali her
    // kaynakta aynı sonucu verir.
    if (lastReason !== "slot_taken") break;
  }

  redirect(back(lastReason));
}

export type ConfirmState = {
  error?: string;
  fieldErrors?: Partial<Record<"ad" | "telefon" | "eposta" | "onaylar", string>>;
};

const confirmSchema = z.object({
  slug: z.string().min(1),
  token: z.uuid(),
  ad: z.string().trim().min(2, "Ad soyad en az iki karakter olmalı").max(160),
  telefon: z.string().trim().min(1, "Telefon numarası gerekli"),
  eposta: z.string().trim().max(160),
  not: z.string().trim().max(1000),
});

/**
 * Bilgiler + rıza → randevu.
 *
 * Rıza kutuları TEK TEK gönderilir ve reddedilen ticari ileti onayı da kayda
 * geçer: "onay verilmedi" de kanıtlanması gereken bir olgudur (Plan 11.4).
 * Aydınlatma ile açık rıza ayrı kayıtlardır; ikisi de metnin sürümüyle yazılır.
 */
export async function confirmBookingAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const parsed = confirmSchema.safeParse({
    slug: formData.get("slug"),
    token: formData.get("token"),
    ad: formData.get("ad") ?? "",
    telefon: formData.get("telefon") ?? "",
    eposta: formData.get("eposta") ?? "",
    not: formData.get("not") ?? "",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    return {
      error: issue.message,
      fieldErrors: field === "ad" || field === "telefon" ? { [field]: issue.message } : undefined,
    };
  }
  const input = parsed.data;

  const phone = toE164(input.telefon);
  if (!phone) {
    return {
      error: "Telefon numarası okunamadı.",
      fieldErrors: { telefon: "Örnek: 0555 123 45 67" },
    };
  }

  if (input.eposta && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.eposta)) {
    return {
      error: "E-posta adresi okunamadı.",
      fieldErrors: { eposta: "Örnek: ad@ornek.com" },
    };
  }

  const disclosure = formData.get("onay_aydinlatma") === "on";
  const health = formData.get("onay_saglik") === "on";
  if (!disclosure || !health) {
    return {
      error:
        "Randevu oluşturabilmek için aydınlatma metnini okuduğunuzu ve sağlık verinizin işlenmesine açık rıza verdiğinizi işaretleyin.",
      fieldErrors: { onaylar: "İki kutunun da işaretlenmesi gerekiyor" },
    };
  }

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("booking_confirm", {
    _token: input.token,
    _full_name: input.ad,
    _phone: phone,
    _email: input.eposta || undefined,
    _note: input.not || undefined,
    _consents: [
      { kind: "kvkk_aydinlatma", granted: true, text_version: CONSENT_VERSION },
      { kind: "acik_riza_saglik", granted: true, text_version: CONSENT_VERSION },
      {
        kind: "ticari_ileti",
        granted: formData.get("onay_ticari") === "on",
        text_version: CONSENT_VERSION,
      },
    ],
    _ip: await clientIp(),
    _user_agent: await clientUserAgent(),
  });

  if (error) return { error: "Randevu oluşturulamadı. Lütfen tekrar deneyin." };

  const result = resultSchema.safeParse(data);
  if (!result.success) return { error: "Randevu oluşturulamadı. Lütfen tekrar deneyin." };

  if (!result.data.ok) {
    // Süresi dolan tutmada saat serbest kaldı: hastayı forma değil saat
    // listesine geri götürmek gerekiyor.
    if (result.data.reason === "expired") {
      redirect(bookingHref(input.slug, { hata: "expired" }));
    }
    return { error: bookingErrorMessage(result.data.reason) };
  }

  redirect(`/r/${input.slug}/randevu/${input.token}`);
}

const cancelSchema = z.object({
  slug: z.string().min(1),
  token: z.uuid(),
  sebep: z.string().trim().max(300),
});

/** Müşterinin kendi randevusunu iptali. Pencere kuralı veritabanında. */
export async function cancelBookingAction(formData: FormData): Promise<void> {
  const parsed = cancelSchema.safeParse({
    slug: formData.get("slug"),
    token: formData.get("token"),
    sebep: formData.get("sebep") ?? "",
  });

  if (!parsed.success) redirect("/");
  const input = parsed.data;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("booking_cancel", {
    _token: input.token,
    _reason: input.sebep || undefined,
  });

  const target = `/r/${input.slug}/randevu/${input.token}`;
  if (error) redirect(`${target}?hata=not_found`);

  const result = resultSchema.safeParse(data);
  if (!result.success || !result.data.ok) {
    redirect(`${target}?hata=${result.success ? (result.data.reason ?? "not_found") : "not_found"}`);
  }

  redirect(target);
}

/**
 * KVKK m.11 başvurusu: "kayıtlarımın silinmesini istiyorum".
 *
 * Kimlik doğrulaması token'ın kendisi — bağlantı kişiye SMS ile gitti ve
 * randevusunu görüntülemesini de o sağlıyor. Talep kliniğin panelindeki
 * kutuya düşüyor; imhayı klinik uyguluyor, çünkü veri sorumlusu o.
 *
 * Talep ANINDA imha uygulanmıyor: kimlik doğrulaması, yasal saklama süresi ve
 * varsa devam eden tedavi kliniğin değerlendireceği şeyler. Otomatik imha,
 * bağlantısı başkasının eline geçen bir telefonda geri alınamaz bir silme
 * demekti.
 */
export async function requestErasureAction(formData: FormData): Promise<void> {
  const parsed = cancelSchema.safeParse({
    slug: formData.get("slug"),
    token: formData.get("token"),
    sebep: formData.get("aciklama") ?? "",
  });

  if (!parsed.success) redirect("/");
  const input = parsed.data;

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("booking_request_erasure", {
    _token: input.token,
    _note: input.sebep || undefined,
  });

  const target = `/r/${input.slug}/randevu/${input.token}`;
  if (error) redirect(`${target}?imha=hata`);

  const result = resultSchema.safeParse(data);
  const reason = result.success ? (result.data.reason ?? "created") : "hata";
  redirect(`${target}?imha=${reason}`);
}
