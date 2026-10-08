export type SheetItem = {
  key: string;
  lang: string;
  imgSrc: string;
  alt: string;
  credit: string;
  sourcePageUrl: string;
  note?: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLE = `body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#faf7f0;color:#1d1d1b}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;overflow:hidden}
img{display:block;width:100%;height:200px;object-fit:cover;background:#eee}
figcaption{display:grid;gap:4px;padding:8px}.note{color:#666}
.bar{position:sticky;top:0;background:#faf7f0;padding:8px 0;display:flex;gap:8px;align-items:flex-start}
textarea{flex:1}`;

/** Static HTML grid of images, for agent batches (local staging files) and the owner sheet (bucket URLs). */
export function buildContactSheetHtml({
  title,
  items,
  objections,
}: {
  title: string;
  items: SheetItem[];
  objections: boolean;
}): string {
  const cards = items
    .map(
      (it, i) => `<figure data-key="${escapeHtml(it.key)}">
<img src="${escapeHtml(it.imgSrc)}" alt="${escapeHtml(it.alt)}" loading="lazy">
<figcaption>
<strong>#${i + 1} · ${escapeHtml(it.lang)} · ${escapeHtml(it.key)}</strong>
<span>${escapeHtml(it.alt)}</span>
<span>Credit: ${escapeHtml(it.credit)} · <a href="${escapeHtml(it.sourcePageUrl)}" target="_blank" rel="noopener">source</a></span>
${it.note ? `<span class="note">${escapeHtml(it.note)}</span>` : ""}
${objections ? `<label><input type="checkbox" class="objection" value="${escapeHtml(it.key)}"> Object to this image</label>` : ""}
</figcaption>
</figure>`,
    )
    .join("\n");
  const bar = objections
    ? `<div class="bar"><button id="copy" type="button">Copy objections</button><textarea id="out" rows="3" readonly></textarea></div>
<script>
document.getElementById("copy").addEventListener("click", function () {
  var keys = Array.prototype.map.call(document.querySelectorAll("input.objection:checked"), function (el) { return el.value; });
  var text = JSON.stringify({ objectedBy: "owner", keys: keys }, null, 2);
  document.getElementById("out").value = text;
  if (navigator.clipboard) navigator.clipboard.writeText(text);
});
</script>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><h1>${escapeHtml(title)}</h1><p>${items.length} images</p>
${bar}
<main class="grid">
${cards}
</main></body></html>
`;
}
