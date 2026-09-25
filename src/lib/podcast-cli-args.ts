/**
 * Argument parsing for scripts/podcast-tool.ts.
 *
 * Lives here rather than in the script because the script is outside the
 * typecheck include and has no test coverage -- and the bug this replaces
 * was precisely a parsing bug that no test could see.
 *
 * **The failure it fixes.** The old parser stored whatever followed a flag:
 *
 *     if (next !== undefined && !next.startsWith("--")) flags[key] = next;
 *     else flags[key] = true;
 *
 * with a gate of `flags.confirm !== true`. So `--confirm yes` -- exactly what
 * someone types when unsure whether a flag takes a value -- became the string
 * "yes", failed the identity check, and the command **dry-ran while reporting
 * nothing wrong**. In a tool whose success signal is the absence of output,
 * run by an operator who believed they had just published, that is a silent
 * data-integrity trap rather than an inconvenience.
 *
 * So this parser is deliberately loud: anything it cannot interpret exactly
 * is an error naming the flag, never a quiet fallback.
 */

export class CliArgError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliArgError";
  }
}

export type CliFlagSpec = {
  /** Flags that take no value; present means true. */
  booleans: readonly string[];
  /** Flags that require a value. */
  values: readonly string[];
};

export type CliFlags = Record<string, string | true>;

export function parseCliArgs(
  argv: readonly string[],
  spec: CliFlagSpec,
): { command?: string; flags: CliFlags } {
  const [command, ...rest] = argv;
  const flags: CliFlags = {};

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;

    if (!arg.startsWith("--")) {
      throw new CliArgError(
        `Unexpected argument "${arg}". Every option is a --flag; this tool takes no bare arguments.`,
      );
    }

    const key = arg.slice(2);
    const isBoolean = spec.booleans.includes(key);
    const isValue = spec.values.includes(key);

    if (!isBoolean && !isValue) {
      const known = [...spec.booleans, ...spec.values]
        .sort()
        .map((k) => `--${k}`)
        .join(", ");
      throw new CliArgError(`Unknown flag --${key}. Known flags: ${known}.`);
    }

    if (key in flags) {
      throw new CliArgError(
        `--${key} was given more than once. Only one value would be used, so which one is ambiguous.`,
      );
    }

    const next = rest[i + 1];
    const nextIsValue = next !== undefined && !next.startsWith("--");

    if (isBoolean) {
      if (nextIsValue) {
        // The trap. Accepting this as truthy would be nearly as bad as
        // ignoring it: the operator is telling us something they believe
        // matters, and we would be guessing.
        throw new CliArgError(
          `--${key} takes no value, but got "${next}". Write just --${key} to mean yes, ` +
            `or leave it out entirely to mean no.`,
        );
      }
      flags[key] = true;
      continue;
    }

    if (!nextIsValue) {
      throw new CliArgError(`--${key} needs a value, e.g. --${key} <value>.`);
    }
    flags[key] = next;
    i++;
  }

  return { command, flags };
}

/** A flag's value as a string, or undefined when absent. */
function stringValue(flags: CliFlags, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function requireStringFlag(flags: CliFlags, key: string, hint: string): string {
  const value = stringValue(flags, key);
  if (!value) throw new CliArgError(`--${key} is required (${hint}).`);
  return value;
}

/**
 * A whole number, or `fallback` when the flag is absent.
 *
 * Rejects a non-numeric value rather than passing NaN on: the old code ran
 * `Number("abc")`, serialised the NaN to JSON `null`, and surfaced a raw
 * Postgres NOT NULL violation in a tool that validates everything else
 * politely.
 */
export function requireIntFlag(flags: CliFlags, key: string, fallback: number): number {
  const raw = stringValue(flags, key);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new CliArgError(`--${key} must be a whole number, but got "${raw}".`);
  }
  if (!Number.isInteger(parsed)) {
    throw new CliArgError(`--${key} must be a whole number, but got "${raw}".`);
  }
  return parsed;
}

/**
 * One of `allowed`, or null when the flag is absent (course and level are
 * both optional on an episode).
 *
 * Checked here so a typo gets a readable message instead of a raw CHECK
 * constraint or foreign-key error from Postgres.
 */
export function requireOneOf(
  flags: CliFlags,
  key: string,
  allowed: readonly string[],
): string | null {
  const raw = stringValue(flags, key);
  if (raw === undefined) return null;
  if (!allowed.includes(raw)) {
    throw new CliArgError(`--${key} must be one of ${allowed.join(", ")}, but got "${raw}".`);
  }
  return raw;
}
