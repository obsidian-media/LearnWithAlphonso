/**
 * Writes the design system's mirrors from design/tokens.json and design/icons/*.svg: the web CSS variables and TS
 * tables, AlphonsoDS.generated.swift and the iOS DSIcons asset catalog, AlphonsoTokens.kt and the Android ds_*
 * vector drawables. Removes icon files whose source SVG is gone. src/lib/design-system-sync.test.ts fails when any
 * of them is stale.
 *
 * Usage: bun scripts/export-design-system.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  ANDROID_DRAWABLE_DIR,
  formatOutputs,
  IOS_ICON_FOLDER,
  loadDesignSource,
  renderAll,
} from "../src/lib/design-system-export";

const root = path.resolve(import.meta.dirname, "..");
const outputs = await formatOutputs(renderAll(loadDesignSource(root)), root);

for (const [rel, content] of Object.entries(outputs)) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const iosDir = path.join(root, IOS_ICON_FOLDER);
for (const set of fs.readdirSync(iosDir).filter((f) => f.endsWith(".imageset"))) {
  if (!outputs[`${IOS_ICON_FOLDER}/${set}/Contents.json`])
    fs.rmSync(path.join(iosDir, set), { recursive: true });
}
const androidDir = path.join(root, ANDROID_DRAWABLE_DIR);
for (const f of fs.readdirSync(androidDir).filter((x) => x.startsWith("ds_"))) {
  if (!outputs[`${ANDROID_DRAWABLE_DIR}/${f}`]) fs.rmSync(path.join(androidDir, f));
}

console.log(`wrote ${Object.keys(outputs).length} design system files`);
