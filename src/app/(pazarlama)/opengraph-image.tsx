import { ImageResponse } from "next/og";

/**
 * Paylaşım kartı.
 *
 * Renkler token'ların koyu tema değerleriyle aynı ama BURADA elle yazılmak
 * zorunda: görsel tarayıcıda değil sunucuda üretiliyor, CSS değişkeni yok.
 * `globals.css` içindeki koyu tema değişirse buranın da değişmesi gerekir.
 */

export const alt = "TeyitRandevu — diş klinikleri için randevu ve hasta takibi";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0F1416";
const SURFACE = "#161D1F";
const BORDER = "#2A3336";
const INK = "#E6EBEA";
const INK_2 = "#97A3A2";
const ACCENT = "#3FA9BC";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: ACCENT }} />
          <div style={{ fontSize: 28, color: INK, letterSpacing: -0.5 }}>TeyitRandevu</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* satori: birden çok çocuğu olan her div'de display açıkça verilir */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 68,
              color: INK,
              lineHeight: 1.15,
              letterSpacing: -1.5,
            }}
          >
            <div style={{ display: "flex" }}>Randevular çakışmasın,</div>
            <div style={{ display: "flex" }}>hasta gelmeyi unutmasın.</div>
          </div>
          <div style={{ fontSize: 28, color: INK_2, lineHeight: 1.4 }}>
            Diş klinikleri için randevu, hasta takibi ve hatırlatma sistemi
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            borderTop: `1px solid ${BORDER}`,
            paddingTop: 28,
          }}
        >
          {["Günün programı", "Çakışma engeli", "KVKK kayıtları"].map((label) => (
            <div
              key={label}
              style={{
                display: "flex",
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                color: INK_2,
                fontSize: 22,
                padding: "10px 16px",
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
