import type { TileKind } from "../../lib/numbers-core";
import { formatFigure } from "../../lib/console-format";

/**
 * The ONLY way the console puts a data number on screen. A real value is written in its unit; no value (null, a
 * missing source, a failed read) writes the REASON instead ("Not connected", "No data yet", "Could not read"), never a
 * digit and never a 0 for unknown. `reason` is required even when a value is present so a caller cannot forget it.
 * console-no-hardcoded-data.test.ts scans the console for numbers rendered any other way.
 */
export function Figure({
  value,
  reason,
  kind = "number",
  className = "",
}: {
  value: number | string | null | undefined;
  /** What to say when there is no value. */
  reason: string;
  kind?: TileKind;
  className?: string;
}) {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    return (
      <span
        data-figure-absent=""
        className={`text-sm font-semibold text-ds-ink-faint ${className}`}
      >
        {reason}
      </span>
    );
  }
  return (
    <span data-figure="" className={`tabular-nums ${className}`}>
      {formatFigure(value, kind)}
    </span>
  );
}
