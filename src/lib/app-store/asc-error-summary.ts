/**
 * A loggable summary of an App Store Connect error body. CI logs of this public repo are readable by anyone, and
 * an error's `detail` can quote back what was submitted (review notes carry the reviewer's sign-in helper link), so
 * only the stable parts are kept: status, code, title and the JSON pointer of the field.
 */
type AscError = {
  status?: unknown;
  code?: unknown;
  title?: unknown;
  source?: { pointer?: unknown };
};

export function ascErrorSummary(body: unknown): string {
  const errors = (body as { errors?: unknown } | null)?.errors;
  if (!Array.isArray(errors) || errors.length === 0) return "no error details";
  return errors
    .map((e: AscError) =>
      [e.status, e.code, e.title, e.source?.pointer].filter((v) => typeof v === "string").join(" "),
    )
    .join("; ");
}
