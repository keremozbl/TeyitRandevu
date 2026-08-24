import type { Enums } from "@/lib/supabase/types";

/**
 * Randevu durumlarının arayüz karşılığı.
 *
 * Renk tek başına anlam taşımaz (Plan Bölüm 9): her durumun bir de kısa metin
 * etiketi var. Renk körlüğünde ve siyah-beyaz çıktıda ayırt edilen o etiket.
 */
export type AppointmentStatus = Enums<"appointment_status">;

type StatusStyle = {
  /** Ekran okuyucu ve ipucu metni */
  label: string;
  /** Randevu bloğunun köşesindeki kısa kod */
  short: string;
  /** Blok yüzeyi */
  block: string;
  /** Lejant ve liste rozeti */
  dot: string;
};

export const STATUS_STYLES: Record<AppointmentStatus, StatusStyle> = {
  pending: {
    label: "Onay bekliyor",
    short: "BEK",
    block: "border-l-st-pending bg-st-pending-soft",
    dot: "bg-st-pending",
  },
  confirmed: {
    label: "Onaylandı",
    short: "ONAY",
    block: "border-l-st-confirmed bg-st-confirmed-soft",
    dot: "bg-st-confirmed",
  },
  arrived: {
    label: "Geldi",
    short: "GELDİ",
    block: "border-l-st-arrived bg-st-arrived-soft",
    dot: "bg-st-arrived",
  },
  completed: {
    label: "Tamamlandı",
    short: "BİTTİ",
    block: "border-l-st-confirmed bg-surface-2",
    dot: "bg-st-confirmed",
  },
  no_show: {
    label: "Gelmedi",
    short: "YOK",
    block: "border-l-st-noshow bg-st-noshow-soft",
    dot: "bg-st-noshow",
  },
  cancelled: {
    label: "İptal edildi",
    short: "İPTAL",
    block: "border-l-st-cancelled bg-st-cancelled-soft",
    dot: "bg-st-cancelled",
  },
};

/** Izgarada yer kaplayan durumlar; kalanlar gün altındaki listede görünür. */
export const GRID_STATUSES: readonly AppointmentStatus[] = [
  "pending",
  "confirmed",
  "arrived",
  "completed",
];

export const RESOURCE_KIND_LABELS: Record<Enums<"resource_kind">, string> = {
  staff: "Personel",
  room: "Oda",
  device: "Cihaz",
};
