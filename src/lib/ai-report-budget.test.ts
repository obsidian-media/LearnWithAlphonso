import { describe, expect, it } from "vitest";
import { AI_REPORT_MESSAGE_MAX } from "./ai-consent-copy";
import {
  AI_REPORT_CONTEXT_BYTE_LIMIT,
  capReportMessage,
  jsonBytes,
  reportMessageFits,
} from "./ai-report-budget";

const BS = "\\";

/** What Postgres reports for `octet_length(context::text)` of a flat jsonb object (", " and ": " separators). */
function dbOctetLength(context: Record<string, unknown>): number {
  const escapes: Record<string, string> = {
    '"': BS + '"',
    [BS]: BS + BS,
    "\n": BS + "n",
    "\r": BS + "r",
    "\t": BS + "t",
    "\b": BS + "b",
    "\f": BS + "f",
  };
  const esc = (s: string) =>
    '"' +
    Array.from(s)
      .map((c) => {
        const code = c.codePointAt(0)!;
        if (escapes[c]) return escapes[c];
        if (code < 0x20) return BS + "u" + code.toString(16).padStart(4, "0");
        return c;
      })
      .join("") +
    '"';
  const body = Object.entries(context)
    .map(([k, v]) => `${esc(k)}: ${typeof v === "string" ? esc(v) : String(v)}`)
    .join(", ");
  return new TextEncoder().encode(`{${body}}`).length;
}

const LONG_ID = "i".repeat(100);
const ids = { course: "es", scenarioId: LONG_ID, campaignId: LONG_ID };
const contextFor = (message: string) => ({
  message,
  surface: "conversation",
  course: "es",
  scenario_id: LONG_ID,
  campaign_id: LONG_ID,
  scene_index: 100,
  platform: "web",
});

describe("jsonBytes", () => {
  it("counts the escaped size", () => {
    expect(jsonBytes('a"b' + BS + "c\n\r\t\b\f")).toBe(1 + 2 + 1 + 2 + 1 + 2 * 5);
    expect(jsonBytes("\u0001\u001f")).toBe(12);
    expect(jsonBytes("é")).toBe(2);
    expect(jsonBytes("€")).toBe(3);
    expect(jsonBytes("😀")).toBe(4);
    expect(jsonBytes("\ud800")).toBe(6);
  });

  it("agrees with the database's own count of the same text", () => {
    const text = 'x"' + BS + "\n\u0001é€😀";
    const wrapped = dbOctetLength({ m: text });
    // {"m": "<text>"} is 9 bytes of structure around the escaped text.
    expect(wrapped - 9).toBe(jsonBytes(text));
  });
});

describe("capReportMessage keeps the report inside the database check", () => {
  const worst: [string, string][] = [
    ["plain", "x".repeat(6000)],
    ["escape heavy (quotes)", '"'.repeat(6000)],
    ["escape heavy (backslashes)", BS.repeat(6000)],
    ["escape heavy (newlines)", "\n".repeat(6000)],
    ["control characters", "\u0001".repeat(6000)],
    ["emoji heavy", "😀".repeat(6000)],
    ["accented", "é".repeat(6000)],
    ["mixed", ('"\n\u0002é€😀x' + BS).repeat(1000)],
  ];
  it.each(worst)("%s: capped message fits, with the longest ids", (_name, message) => {
    const capped = capReportMessage(message, ids);
    expect(Array.from(capped).length).toBeLessThanOrEqual(AI_REPORT_MESSAGE_MAX);
    expect(dbOctetLength(contextFor(capped))).toBeLessThanOrEqual(AI_REPORT_CONTEXT_BYTE_LIMIT);
    expect(message.startsWith(capped)).toBe(true);
    expect(capped.length).toBeGreaterThan(0);
  });

  it("the code point cap alone is not enough (the reason for the budget)", () => {
    const control = "\u0001".repeat(AI_REPORT_MESSAGE_MAX); // 15000 bytes of JSON
    expect(dbOctetLength(contextFor(control))).toBeGreaterThan(AI_REPORT_CONTEXT_BYTE_LIMIT);
    expect(dbOctetLength(contextFor(capReportMessage(control, ids)))).toBeLessThanOrEqual(
      AI_REPORT_CONTEXT_BYTE_LIMIT,
    );
  });

  it("never splits an emoji", () => {
    const capped = capReportMessage("😀".repeat(6000), ids);
    expect(capped).toBe("😀".repeat(Array.from(capped).length));
    expect(Array.from(capped).length).toBeGreaterThan(1500);
  });

  it("leaves a normal reply alone", () => {
    expect(capReportMessage("Bonjour, ça va ?", { course: "fr" })).toBe("Bonjour, ça va ?");
    expect(reportMessageFits("Bonjour, ça va ?", { course: "fr" })).toBe(true);
    expect(reportMessageFits("\u0001".repeat(2500), ids)).toBe(false);
    expect(reportMessageFits("x".repeat(2501), ids)).toBe(false);
  });
});
