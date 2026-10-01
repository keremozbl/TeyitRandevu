import fs from "node:fs";
import path from "node:path";

const SRC = "C:/Users/kerem/AppData/Local/Temp/claude/C--Users-kerem-OneDrive-Masa-st--TeyitRandevu/1efee10a-cac8-44c5-8a52-89ac24eab5da/scratchpad/undraw/package/svgs";
const OUT = "C:/Users/kerem/OneDrive/Masaüstü/TeyitRandevu/public/illo";

const P = {
  dark: "#2F2E41", dark2: "#3F3D56", grey: "#E6E6E6", grey2: "#F2F2F2",
  skin: "#FFB6B6", skin2: "#A0616A", panel: "#E8F3EC",
};

// Her dosyanın kendi paleti ortak palete indirgeniyor; eşlenmeyen renk kalır.
/**
 * Arka plandaki yumuşak leke barber ve makeup-artist'te KALIYOR.
 *
 * Kaldırmayı denedim: o şekiller `fill="currentColor"` ya da CSS sınıfıyla
 * boyanıyor, hex eşlemesi onlara hiç ulaşmıyor. Rastgele hex'leri panel
 * rengine çevirmek lekeyi değil gömleği sildi. Sekiz görselden ikisinde
 * yumuşak bir zemin olması, SVG'nin içini kurcalamaktan iyi.
 */
const SET = {
  "berber":        ["barber", { "#3f3d56": P.dark2, "#e8e8f0": P.panel, "#e6e8ec": P.grey, "#fbbebe": P.skin, "#be6f72": P.skin2 }],
  "guzellik":      ["makeup-artist", {
    "#40414d": P.dark, "#451b59": P.dark, "#4d4981": P.dark2, "#535461": P.dark2,
    "#594c76": P.dark2, "#5a5773": P.dark2, "#605d82": P.dark2, "#67647e": P.dark2,
    "#8b9cd1": P.grey, "#bfaee5": P.panel, "#916168": P.skin2,
    "#eb6475": P.skin2, "#fd6f8d": P.skin2,
    "#f6c6cd": P.skin, "#f8bdc5": P.skin, "#fec3be": P.skin,
  }],
  "dis-klinigi":   ["doctors", { "#2e2e41": P.dark, "#3f3c57": P.dark2, "#d6d7d8": P.grey, "#e8e9ea": P.grey2, "#fdb4b4": P.skin }],
  "fizyoterapi":   ["personal-trainer", {}],
  "diyetisyen":    ["diet", {}],
  "psikolog":      ["showing-support", {}],
  "randevu":       ["online-calendar", { "#ffb8b8": P.skin }],
  "kurulum":       ["setup-wizard", { "#090814": P.dark, "#d6d6e3": P.grey, "#3f3d56": P.dark2 }],
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const [name, [src, map]] of Object.entries(SET)) {
  let s = fs.readFileSync(path.join(SRC, `${src}.svg`), "utf8");
  s = s.replace(/#[0-9a-fA-F]{6}/g, (h) => map[h.toLowerCase()] ?? h);
  // Sabit width/height yerine viewBox: kutuya göre ölçeklensin.
  s = s.replace(/<svg([^>]*)>/, (m, attrs) => {
    const vb = attrs.match(/viewBox="([^"]+)"/);
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    return `<svg${cleaned}${vb ? "" : ' viewBox="0 0 1000 700"'}>`;
  });
  s = s.replace(/<!--[\s\S]*?-->/g, "").replace(/\s{2,}/g, " ").trim();
  fs.writeFileSync(path.join(OUT, `${name}.svg`), s);
  console.log(name.padEnd(14), src.padEnd(18), (s.length / 1024).toFixed(1) + " KB");
}
