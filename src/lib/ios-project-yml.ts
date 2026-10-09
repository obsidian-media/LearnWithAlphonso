/**
 * Tiny, dependency-free readers for ios/LearnWithAlphonso/project.yml (XcodeGen). Used by the iOS source guards
 * and by scripts/check-ios-build-number.ts. They read the two-space-indented structure XcodeGen files use; they
 * are not a general YAML parser.
 */
const norm = (s: string) => s.replace(/\r\n/g, "\n");

/** Body of a top-level key. */
export function yamlTopLevel(yml: string, key: string): string {
  const lines = norm(yml).split("\n");
  const start = lines.findIndex((l) => l === `${key}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[^\s#]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** Body of `targets.<name>`. */
export function yamlTarget(yml: string, name: string): string {
  const lines = yamlTopLevel(yml, "targets").split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[^\s#]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/** Value of `KEY: "value"` in a block (quotes stripped), or null. */
export function yamlSetting(block: string, key: string): string | null {
  const m = new RegExp(`^\\s+${key}:\\s*(.+?)\\s*$`, "m").exec(block);
  if (!m) return null;
  return m[1].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}
