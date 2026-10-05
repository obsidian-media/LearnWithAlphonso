// Rows whose answer key is stored on the row itself ('weakness' from the
// Hector weakness feature, 'saved_word' from save-any-word) rather than looked
// up from a lesson question. Extracted from index.ts because index.ts calls
// Deno.serve at module scope, so a test cannot import it.
export function isSelfContainedSource(source: string | null | undefined): boolean {
  return source === "weakness" || source === "saved_word";
}

export function gradeSelfContained(
  row: { choices: unknown; answer_index: unknown },
  answer: string,
): boolean {
  const choices = row.choices;
  const index = row.answer_index;
  if (!Array.isArray(choices) || typeof index !== "number") return false;
  return choices[index] === answer;
}
