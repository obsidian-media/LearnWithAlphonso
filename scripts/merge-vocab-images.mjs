import fs from "node:fs";

const batchFile = process.argv[2];
if (!batchFile) {
  console.error("Usage: node scripts/merge-vocab-images.mjs <batch.json>");
  process.exit(1);
}

const batch = JSON.parse(fs.readFileSync(batchFile, "utf-8"));

const lowered = {};
for (const [term, v] of Object.entries(batch)) {
  const key = term.trim().toLowerCase();
  if (lowered[key]) continue;
  lowered[key] = { url: v.url, alt: v.alt, credit: v.credit };
}
console.log("unique lowercased entries:", Object.keys(lowered).length);

const src = fs.readFileSync("src/data/vocab-images.ts", "utf-8");
const marker = "\n};\n";
const idx = src.lastIndexOf(marker);
if (idx === -1) throw new Error("marker not found");

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

let block = "";
for (const [key, v] of Object.entries(lowered)) {
  block += `  "${esc(key)}": {\n`;
  block += `    url: "${esc(v.url)}",\n`;
  block += `    alt: "${esc(v.alt)}",\n`;
  block += `    credit: "${esc(v.credit)}",\n`;
  block += `  },\n`;
}

const newSrc = src.slice(0, idx) + "\n" + block + src.slice(idx + 1);
fs.writeFileSync("src/data/vocab-images.ts", newSrc, "utf-8");
console.log("merged into vocab-images.ts");
