import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ember" | "secondary";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ds-brand text-primary-foreground shadow-[0_4px_0_0_var(--color-edge-moss)]",
  ember: "bg-ember text-ink-on-ember shadow-[0_4px_0_0_var(--color-edge-ember)]",
  secondary:
    "border-2 border-ds-line bg-ds-card text-ds-ink shadow-[0_4px_0_0_var(--color-hairline)]",
};

/**
 * The chunky button: a darker bottom edge that collapses as the button presses
 * down, like the iPhone app's AlphonsoPrimaryButtonStyle.
 */
export function Button({
  variant = "primary",
  fullWidth = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; fullWidth?: boolean }) {
  return (
    <button
      type={type}
      className={`edge-${variant === "ember" ? "ember" : "moss"} inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-6 py-3 font-display text-base font-bold tracking-wide transition-[transform,box-shadow] duration-100 active:translate-y-1 active:shadow-none disabled:opacity-50 motion-reduce:transition-none ${VARIANTS[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}
