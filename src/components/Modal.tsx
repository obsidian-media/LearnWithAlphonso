import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { acquireInert } from "@/lib/inert-stack";

export const FOCUSABLE =
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
  onBackdrop,
  className,
  children,
}: {
  labelledBy: string;
  describedBy?: string;
  onEscape?: () => void;
  /** A tap on the dimmed area outside the dialog. Optional: most dialogs are explicit choices and ignore it. */
  onBackdrop?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const portalRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  // Read through a ref so a new callback identity on every render does not re-run the effect (and steal focus).
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    const portal = portalRef.current;
    const found = dialogRef.current;
    if (!portal || !found) return;
    const dialog: HTMLDivElement = found;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Everything else in <body> becomes inert (and hidden from screen readers) until this closes. Ref-counted
    // (inert-stack), because a phone cover may be hiding some of the same elements and closes in any order.
    const others = Array.from(document.body.children).filter((el) => el !== portal);
    const releaseInert = acquireInert(others);

    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? dialog).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onEscape) {
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
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
    portal.addEventListener("keydown", onKeyDown);

    return () => {
      portal.removeEventListener("keydown", onKeyDown);
      releaseInert();
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      ref={portalRef}
      data-modal-portal=""
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <div
        role="presentation"
        data-modal-backdrop=""
        className="absolute inset-0 bg-ds-ink/40"
        onClick={onBackdrop}
      />
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
