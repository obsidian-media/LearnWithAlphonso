import type { MouseEvent, ReactNode } from "react";

/**
 * The href of a plain in-app link click that should be handled by the router instead of the browser, else null. A full
 * page load is what made the admin look signed out for a moment (the server render has no session); a client-side
 * navigation keeps the page, the session and the rail. Anything the browser should still handle is left alone: a
 * modified click (new tab, new window, download), a middle or right click, a link with a target, an external URL, a
 * download, or a click something else already handled.
 */
export function clientNavigationHref(event: {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: EventTarget | null;
}): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const el = event.target instanceof Element ? event.target.closest("a") : null;
  if (!el) return null;
  const href = el.getAttribute("href");
  // Only a plain absolute path: not "//host" or "/\host" (browsers read a backslash as a slash), and no tab, CR, LF or
  // other control character (browsers strip those before parsing, which can turn a path into another origin).
  if (!href || !/^\/(?![/\\])/.test(href) || hasControlCharacter(href)) return null;
  if (el.hasAttribute("download")) return null;
  const target = el.getAttribute("target");
  if (target && target !== "_self") return null;
  return href;
}

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/** Turns every in-app `<a href="/...">` below it into a client-side navigation. It adds no element to the layout. */
export function ClientLinks({
  navigate,
  children,
}: {
  navigate: (href: string) => void;
  children: ReactNode;
}) {
  function onClick(event: MouseEvent) {
    const href = clientNavigationHref(event);
    if (href === null) return;
    event.preventDefault();
    navigate(href);
  }
  return (
    // A delegated click handler, not an interactive element of its own: the links inside stay real links.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div className="contents" onClick={onClick}>
      {children}
    </div>
  );
}
