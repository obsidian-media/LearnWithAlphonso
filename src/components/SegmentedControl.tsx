import { useRef } from "react";

type Option<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusAndSelect(index: number) {
    const wrapped = (index + options.length) % options.length;
    tabRefs.current[wrapped]?.focus();
    onChange(options[wrapped].value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      focusAndSelect(index + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      focusAndSelect(index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusAndSelect(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusAndSelect(options.length - 1);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-0.5 rounded-[16px] bg-ds-sunk p-1"
    >
      {options.map((o, index) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={`min-h-10 rounded-[12px] px-3 ds-type-footnote font-extrabold transition-colors focus-visible:outline-2 focus-visible:outline-ds-choice ${
              active
                ? "bg-ds-card text-ds-brand shadow-[var(--ds-shadow-resting)]"
                : "text-ds-ink-soft hover:text-ds-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
