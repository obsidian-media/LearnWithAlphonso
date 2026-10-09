import { AI_REPORT_MESSAGE_MAX } from "./ai-consent-copy";

/**
 * `content_reports.context` is checked as `octet_length(context::text) <= 8192`: the size of the JSON text, where a
 * quote, backslash or newline costs 2 bytes, another control character 6 and an emoji 4. The iOS client budgets the
 * same way (AIResponseReport.swift; ai-consent-copy-parity.test.ts pins the two limits together).
 */
export const AI_REPORT_CONTEXT_BYTE_LIMIT = 8192;
/** Room for the keys, braces, quotes and the spaces the database adds after colons and commas. */
export const AI_REPORT_STRUCTURE_BYTES = 400;

/** Bytes one code point takes inside a JSON string. */
function jsonBytesOf(char: string): number {
  const code = char.codePointAt(0)!;
  if (
    code === 0x22 ||
    code === 0x5c ||
    code === 0x0a ||
    code === 0x0d ||
    code === 0x09 ||
    code === 0x08 ||
    code === 0x0c
  ) {
    return 2;
  }
  if (code <= 0x1f) return 6;
  // A lone surrogate is escaped (6) rather than written; count it as such.
  if (code >= 0xd800 && code <= 0xdfff) return 6;
  if (code <= 0x7f) return 1;
  if (code <= 0x7ff) return 2;
  if (code <= 0xffff) return 3;
  return 4;
}

export function jsonBytes(text: string): number {
  let total = 0;
  for (const char of text) total += jsonBytesOf(char);
  return total;
}

type ReportIds = { course: string; scenarioId?: string; campaignId?: string };

/** How many bytes the message may take once the other fields are accounted for. */
export function reportMessageByteBudget(ids: ReportIds): number {
  return (
    AI_REPORT_CONTEXT_BYTE_LIMIT -
    AI_REPORT_STRUCTURE_BYTES -
    jsonBytes(ids.course) -
    jsonBytes(ids.scenarioId ?? "") -
    jsonBytes(ids.campaignId ?? "")
  );
}

/** jsonb cannot store U+0000 or a lone surrogate, so a report containing one would be refused whole. */
function isUnstorable(char: string): boolean {
  const code = char.codePointAt(0)!;
  return code === 0 || (code >= 0xd800 && code <= 0xdfff);
}

/**
 * The message with U+0000 and lone surrogates removed, cut to the code point cap and the byte budget, always on a
 * code point boundary.
 */
export function capReportMessage(message: string, ids: ReportIds): string {
  const budget = reportMessageByteBudget(ids);
  let out = "";
  let count = 0;
  let bytes = 0;
  for (const char of message) {
    if (isUnstorable(char)) continue;
    const width = jsonBytesOf(char);
    if (count >= AI_REPORT_MESSAGE_MAX || bytes + width > budget) break;
    out += char;
    count += 1;
    bytes += width;
  }
  return out;
}

/** True when the message is within both the code point cap and the byte budget. */
export function reportMessageFits(message: string, ids: ReportIds): boolean {
  return capReportMessage(message, ids) === message;
}
