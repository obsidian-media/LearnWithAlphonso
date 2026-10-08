import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog that behaves like one for keyboard and screen reader users: it renders into document.body, makes
 * everything else on the page inert while it is open, moves focus in, keeps Tab inside, and gives focus back to
 * where it was on close. `onEscape` is optional because the consent sheet is an explicit choice with no dismissal.
 */
export function Modal({
  labelledBy,
  describedBy,
  onEscape,
  className,
  children,
}: {
  labelledBy: string;
  describedBy?: string;
  onEscape?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const portalRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const portal = portalRef.current;
    const dialog = dialogRef.current;
    if (!portal || !dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Everything else in <body> becomes inert (and hidden from screen readers) until this closes.
    const others = Array.from(document.body.children).filter((el) => el !== portal);
    const saved = others.map((el) => ({
      el,
      inert: el.hasAttribute("inert"),
      ariaHidden: el.getAttribute("aria-hidden"),
    }));
    for (const { el } of saved) {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }

    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? dialog).focus();

    return () => {
      for (const { el, inert, ariaHidden } of saved) {
        if (!inert) el.removeAttribute("inert");
        if (ariaHidden === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", ariaHidden);
      }
      previouslyFocused?.focus?.();
    };
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape" && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    // Handled here, so a surrounding page's own Tab handling must stand down (it checks defaultPrevented).
    event.preventDefault();
    if (items.length === 0) {
      dialog.focus();
      return;
    }
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? index <= 0
        ? items.length - 1
        : index - 1
      : index === -1 || index === items.length - 1
        ? 0
        : index + 1;
    items[next].focus();
  }

  return createPortal(
    <div
      ref={portalRef}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onKeyDown={onKeyDown}
    >
      <div role="presentation" className="absolute inset-0 bg-ink/40" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={className}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
