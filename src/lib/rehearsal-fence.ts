/**
 * The learner's own words (and the model-written brief built from them) are untrusted. They reach a prompt only as
 * quoted data inside a fenced block, never as instructions. `quoteData` makes each value one JSON string literal, so
 * it cannot break out of its line, and escapes angle brackets, so it cannot forge the closing tag of the fence.
 */
export const DATA_OPEN = "<learner_data>";
export const DATA_CLOSE = "</learner_data>";

/** One value as a quoted, single-line literal that cannot contain a tag. */
export function quoteData(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

/** A fenced block of `label: "value"` lines. Values are quoted; labels are fixed text chosen by the code. */
export function fencedData(fields: readonly (readonly [label: string, value: string])[]): string {
  return [
    DATA_OPEN,
    ...fields.map(([label, value]) => `${label}: ${quoteData(value)}`),
    DATA_CLOSE,
  ].join("\n");
}
