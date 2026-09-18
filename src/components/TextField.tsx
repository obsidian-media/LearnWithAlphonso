import type { InputHTMLAttributes } from "react";
import { cn } from "../lib/utils";
import { useTheme } from "../lib/theme";

/**
 * A single-line text input. Shared so the Studio Ink treatment (an
 * underlined field instead of a filled rounded box) stays consistent
 * across every form in the app rather than being reimplemented per screen.
 */
export function TextField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const isStudioInk = useTheme((s) => s.theme === "studio-ink");
  return (
    <input
      className={cn(
        isStudioInk
          ? "w-full border-b border-hairline bg-transparent px-0 py-3 text-sm outline-none focus:border-moss"
          : "w-full rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm outline-none focus:border-moss",
        className,
      )}
      {...props}
    />
  );
}
