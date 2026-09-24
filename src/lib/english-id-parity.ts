import { buildEnglishDump } from "./english-content-dump";
import { BANK } from "@/data/lesson-bank";

export function collectEnglishIds(): string[] {
  const dump = buildEnglishDump();
  return Object.values(dump.byLevel)
    .flat()
    .map((q) => q.key)
    .sort();
}

export function diffIds(baseline: string[], current: string[]) {
  const b = new Set(baseline);
  const c = new Set(current);
  return {
    added: current.filter((id) => !b.has(id)).sort(),
    removed: baseline.filter((id) => !c.has(id)).sort(),
  };
}

export function packLineStats(): Record<string, { lines: number; malformed: string[] }> {
  const out: Record<string, { lines: number; malformed: string[] }> = {};
  for (const pack of Object.values(BANK).flat()) {
    const lines = pack.data
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const malformed = lines.filter((l) => l.split("|").length !== 2);
    out[pack.id] = { lines: lines.length, malformed };
  }
  return out;
}
