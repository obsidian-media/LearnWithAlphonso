// Draws the small set of country flags Profile shows next to the learner's name, as vectors, on all three platforms:
//   web      public/flags/<cc>.svg
//   iOS      ios/LearnWithAlphonso/Sources/Assets.xcassets/Flags/flag-<cc>.imageset
//   Android  android/LearnWithAlphonso/app/src/main/res/drawable/flag_<cc>.xml
// Flags are drawn, never the emoji (Windows draws those as two loose letters). A country with no drawing here shows its
// two-letter code chip instead (see src/lib/drawn-flags.ts). Run: node scripts/generate-profile-flags.mjs
// Output is deterministic and always written (src/lib/drawn-flags.test.ts regenerates into a temp dir and diffs). FLAGS_OUT_DIR redirects the output root.
import fs from "node:fs";
import path from "node:path";

const root = process.env.FLAGS_OUT_DIR
  ? path.resolve(process.env.FLAGS_OUT_DIR)
  : path.resolve(import.meta.dirname, "..");
const W = 60;
const H = 40;

const bands = (colors, dir, ratios = colors.map(() => 1)) => {
  const sum = ratios.reduce((a, b) => a + b, 0);
  let at = 0;
  return colors.map((fill, i) => {
    const size = ((dir === "v" ? W : H) * ratios[i]) / sum;
    const r =
      dir === "v" ? { x: at, y: 0, w: size, h: H, fill } : { x: 0, y: at, w: W, h: size, fill };
    at += size;
    return r;
  });
};

const n = (v) => String(Math.round(v * 100) / 100);
// Geometry helpers (all in the 60x40 box). Shapes are filled paths; `lines` are stroked paths.
const P = (x, y) => `${n(x)},${n(y)}`;
const poly = (pts) => `M${pts.map(([x, y]) => P(x, y)).join("L")}Z`;
const circle = (cx, cy, r) =>
  `M${P(cx - r, cy)}a${n(r)},${n(r)} 0 1 0 ${n(2 * r)},0a${n(r)},${n(r)} 0 1 0 ${n(-2 * r)},0Z`;
const star = (cx, cy, R, rot = -90, k = 5, ratio = 0.382) =>
  poly(
    Array.from({ length: k * 2 }, (_, i) => {
      const a = ((rot + (i * 180) / k) * Math.PI) / 180;
      const r = i % 2 === 0 ? R : R * ratio;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }),
  );
const full = (fill) => ({ x: 0, y: 0, w: W, h: H, fill });
// The Canadian maple leaf: eleven points, drawn from its official outline, mirrored about the centre line.
const leafRight = [
  [0.17, -0.62],
  [0.34, -0.72],
  [0.3, -0.3],
  [0.62, -0.5],
  [0.55, -0.12],
  [0.82, -0.05],
  [0.76, 0.14],
  [0.4, 0.4],
  [0.45, 0.58],
  [0.06, 0.52],
  [0.04, 0.98],
];
const leaf = (cx, cy, s) =>
  poly(
    [[0, -1], ...leafRight, ...[...leafRight].reverse().map(([x, y]) => [-x, y])].map(([x, y]) => [
      cx + x * s,
      cy + y * s,
    ]),
  );
// Taegeuk trigram: three short bars across the line from the centre to a corner.
const trigram = (sx, sy) => {
  const cx = 30 + sx * 21;
  const cy = 20 + sy * 12;
  const len = Math.hypot(sx * 21, sy * 12);
  const ux = (sx * 21) / len;
  const uy = (sy * 12) / len;
  return {
    d: [-2.4, 0, 2.4]
      .map(
        (o) =>
          `M${P(cx + ux * o - uy * 4, cy + uy * o + ux * 4)}L${P(cx + ux * o + uy * 4, cy + uy * o - ux * 4)}`,
      )
      .join(""),
    stroke: "#000000",
    width: 1.5,
  };
};
const unionJack = (w, h) => [
  { d: `M0 0L${w} ${h}M${w} 0L0 ${h}`, stroke: "#FFFFFF", width: 4 },
  { d: `M0 0L${w} ${h}M${w} 0L0 ${h}`, stroke: "#C8102E", width: 1.4 },
  { d: `M${w / 2} 0V${h}M0 ${h / 2}H${w}`, stroke: "#FFFFFF", width: 6 },
  { d: `M${w / 2} 0V${h}M0 ${h / 2}H${w}`, stroke: "#C8102E", width: 3.4 },
];
const spokes = Array.from({ length: 6 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  return `M${P(30 - 5 * Math.cos(a), 20 - 5 * Math.sin(a))}L${P(30 + 5 * Math.cos(a), 20 + 5 * Math.sin(a))}`;
}).join("");

const FLAGS = {
  CA: {
    rects: [
      { x: 0, y: 0, w: 15, h: H, fill: "#D52B1E" },
      { x: 15, y: 0, w: 30, h: H, fill: "#FFFFFF" },
      { x: 45, y: 0, w: 15, h: H, fill: "#D52B1E" },
    ],
    shapes: [{ d: leaf(30, 19.5, 11.5), fill: "#D52B1E" }],
  },
  MX: {
    rects: bands(["#006847", "#FFFFFF", "#CE1126"], "v"),
    shapes: [{ d: circle(30, 20, 4), fill: "#8C6D3F" }],
  },
  BR: {
    rects: [full("#009C3B")],
    shapes: [
      {
        d: poly([
          [30, 4],
          [55, 20],
          [30, 36],
          [5, 20],
        ]),
        fill: "#FFDF00",
      },
      { d: circle(30, 20, 9), fill: "#002776" },
    ],
    lines: [{ d: "M21.6,18.2Q30,15.2 38.4,22.2", stroke: "#FFFFFF", width: 1.6 }],
  },
  PT: {
    rects: [
      { x: 0, y: 0, w: 24, h: H, fill: "#006600" },
      { x: 24, y: 0, w: 36, h: H, fill: "#FF0000" },
    ],
    shapes: [
      { d: circle(24, 20, 6.5), fill: "#FFE000" },
      { d: circle(24, 20, 4), fill: "#FF0000" },
    ],
  },
  AU: {
    rects: [full("#012169")],
    lines: unionJack(30, 20),
    shapes: [
      { d: star(15, 30, 5, -90, 7, 0.45), fill: "#FFFFFF" },
      { d: star(47, 8, 2.4), fill: "#FFFFFF" },
      { d: star(39, 18, 2.4), fill: "#FFFFFF" },
      { d: star(55, 18, 2.4), fill: "#FFFFFF" },
      { d: star(47, 32, 2.4), fill: "#FFFFFF" },
      { d: star(50.5, 22, 1.5), fill: "#FFFFFF" },
    ],
  },
  IN: {
    rects: bands(["#FF9933", "#FFFFFF", "#138808"], "h"),
    shapes: [{ d: circle(30, 20, 1.2), fill: "#000080" }],
    lines: [
      { d: circle(30, 20, 5), stroke: "#000080", width: 0.9 },
      { d: spokes, stroke: "#000080", width: 0.5 },
    ],
  },
  JP: { rects: [full("#FFFFFF")], shapes: [{ d: circle(30, 20, 12), fill: "#BC002D" }] },
  KR: {
    rects: [full("#FFFFFF")],
    shapes: [
      { d: `M20,20a10,10 0 0 1 20,0Z`, fill: "#CD2E3A" },
      { d: `M40,20a10,10 0 0 1 -20,0Z`, fill: "#0047A0" },
      { d: circle(25, 20, 5), fill: "#CD2E3A" },
      { d: circle(35, 20, 5), fill: "#0047A0" },
    ],
    lines: [trigram(-1, -1), trigram(1, -1), trigram(-1, 1), trigram(1, 1)],
  },
  CN: {
    rects: [full("#DE2910")],
    shapes: [
      { d: star(10, 10, 6), fill: "#FFDE00" },
      ...[
        [20, 4],
        [24, 8.5],
        [24, 15],
        [20, 19.5],
      ].map(([x, y]) => ({
        d: star(x, y, 2, (Math.atan2(10 - y, 10 - x) * 180) / Math.PI),
        fill: "#FFDE00",
      })),
    ],
  },
  TR: {
    rects: [full("#E30A17")],
    shapes: [
      { d: circle(22, 20, 10), fill: "#FFFFFF" },
      { d: circle(25, 20, 8), fill: "#E30A17" },
      { d: star(34, 20, 4.4, 0), fill: "#FFFFFF" },
    ],
  },
  IR: {
    rects: bands(["#239F40", "#FFFFFF", "#DA0000"], "h"),
    lines: [{ d: circle(30, 20, 3), stroke: "#DA0000", width: 1 }],
  },
  CH: {
    rects: [
      full("#DA291C"),
      { x: 26.75, y: 9, w: 6.5, h: 22, fill: "#FFFFFF" },
      { x: 19, y: 16.75, w: 22, h: 6.5, fill: "#FFFFFF" },
    ],
  },
  SE: {
    rects: [
      full("#006AA7"),
      { x: 15, y: 0, w: 8, h: H, fill: "#FECC00" },
      { x: 0, y: 16, w: W, h: 8, fill: "#FECC00" },
    ],
  },
  FR: { rects: bands(["#0055A4", "#FFFFFF", "#EF4135"], "v") },
  IT: { rects: bands(["#009246", "#FFFFFF", "#CE2B37"], "v") },
  IE: { rects: bands(["#169B62", "#FFFFFF", "#FF883E"], "v") },
  BE: { rects: bands(["#000000", "#FDDA24", "#EF3340"], "v") },
  RO: { rects: bands(["#002B7F", "#FCD116", "#CE1126"], "v") },
  PE: { rects: bands(["#D91023", "#FFFFFF", "#D91023"], "v", [1, 2, 1]) },
  DE: { rects: bands(["#000000", "#DD0000", "#FFCE00"], "h") },
  NL: { rects: bands(["#AE1C28", "#FFFFFF", "#21468B"], "h") },
  AT: { rects: bands(["#ED2939", "#FFFFFF", "#ED2939"], "h") },
  PL: { rects: bands(["#FFFFFF", "#DC143C"], "h") },
  UA: { rects: bands(["#0057B7", "#FFD700"], "h") },
  RU: { rects: bands(["#FFFFFF", "#0039A6", "#D52B1E"], "h") },
  ES: { rects: bands(["#AA151B", "#F1BF00", "#AA151B"], "h", [1, 2, 1]) },
  CO: { rects: bands(["#FCD116", "#003893", "#CE1126"], "h", [2, 1, 1]) },
  AR: { rects: bands(["#74ACDF", "#FFFFFF", "#74ACDF"], "h") },
  HU: { rects: bands(["#CD2A3E", "#FFFFFF", "#436F4D"], "h") },
  BG: { rects: bands(["#FFFFFF", "#00966E", "#D62612"], "h") },
  LU: { rects: bands(["#ED2939", "#FFFFFF", "#00A1DE"], "h") },
  EE: { rects: bands(["#0072CE", "#000000", "#FFFFFF"], "h") },
  LT: { rects: bands(["#FDB913", "#006A44", "#C1272D"], "h") },
  ID: { rects: bands(["#CE1126", "#FFFFFF"], "h") },
  MC: { rects: bands(["#CE1126", "#FFFFFF"], "h") },
  GB: {
    rects: [{ x: 0, y: 0, w: W, h: H, fill: "#012169" }],
    lines: [
      { d: "M0 0L60 40M60 0L0 40", stroke: "#FFFFFF", width: 8 },
      { d: "M0 0L60 40M60 0L0 40", stroke: "#C8102E", width: 3 },
      { d: "M30 0V40M0 20H60", stroke: "#FFFFFF", width: 12 },
      { d: "M30 0V40M0 20H60", stroke: "#C8102E", width: 7 },
    ],
  },
  US: {
    rects: [
      ...Array.from({ length: 13 }, (_, i) => ({
        x: 0,
        y: (i * H) / 13,
        w: W,
        h: H / 13,
        fill: i % 2 === 0 ? "#B22234" : "#FFFFFF",
      })),
      { x: 0, y: 0, w: 24, h: (7 * H) / 13, fill: "#3C3B6E" },
      // A grid of small white squares for the stars: enough at this size to read as the canton's field.
      ...Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => ({
          x: 2.2 + c * 3.6,
          y: 2 + r * 3.4,
          w: 1.6,
          h: 1.6,
          fill: "#FFFFFF",
        })),
      ).flat(),
    ],
  },
};

const svg = (f) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">` +
  f.rects
    .map(
      (r) =>
        `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="${r.fill}"/>`,
    )
    .join("") +
  (f.shapes ?? []).map((s) => `<path d="${s.d}" fill="${s.fill}"/>`).join("") +
  (f.lines ?? [])
    .map((l) => `<path d="${l.d}" stroke="${l.stroke}" stroke-width="${l.width}" fill="none"/>`)
    .join("") +
  `</svg>\n`;
const argb = (hex) => `#FF${hex.slice(1).toUpperCase()}`;
const vector = (f) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/generate-profile-flags.mjs. Do not edit. -->\n` +
  `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="${W}dp"\n    android:height="${H}dp"\n    android:viewportWidth="${W}"\n    android:viewportHeight="${H}">\n` +
  f.rects
    .map(
      (r) =>
        `    <path android:pathData="M${n(r.x)},${n(r.y)}h${n(r.w)}v${n(r.h)}h${n(-r.w)}z" android:fillColor="${argb(r.fill)}" />\n`,
    )
    .join("") +
  (f.shapes ?? [])
    .map(
      (s) => `    <path android:pathData="${s.d}" android:fillColor="${argb(s.fill)}" />
`,
    )
    .join("") +
  (f.lines ?? [])
    .map(
      (l) =>
        `    <path android:pathData="${l.d}" android:strokeColor="${argb(l.stroke)}" android:strokeWidth="${l.width}" />\n`,
    )
    .join("") +
  `</vector>\n`;
const contents = (file) =>
  JSON.stringify(
    {
      images: [{ filename: file, idiom: "universal" }],
      info: { author: "xcode", version: 1 },
      properties: { "preserves-vector-representation": true },
    },
    null,
    2,
  ) + "\n";

const write = (rel, text) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
};

for (const [code, f] of Object.entries(FLAGS)) {
  const cc = code.toLowerCase();
  write(`public/flags/${cc}.svg`, svg(f));
  const set = `ios/LearnWithAlphonso/Sources/Assets.xcassets/Flags/flag-${cc}.imageset`;
  write(`${set}/flag-${cc}.svg`, svg(f));
  write(`${set}/Contents.json`, contents(`flag-${cc}.svg`));
  write(`android/LearnWithAlphonso/app/src/main/res/drawable/flag_${cc}.xml`, vector(f));
}
write(
  "ios/LearnWithAlphonso/Sources/Assets.xcassets/Flags/Contents.json",
  JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2) + "\n",
);
console.log(Object.keys(FLAGS).join(" "));
