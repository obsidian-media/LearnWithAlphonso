import { useEffect } from "react";
import { acquireInert } from "./inert-stack";

/** Tailwind's `md` is 768px: below it the Say the picture round is a full-screen cover (`max-md:fixed`). */
export const PHONE_QUERY = "(max-width: 767.98px)";

/**
 * While a full-screen cover is open on a phone: the page behind it cannot scroll (body scroll lock) and the rest of the
 * app is inert and hidden from screen readers, so Tab and VoiceOver/TalkBack stay on the cover. Everything that is not
 * the cover or one of its ancestors is made inert, so the cover can sit inside the app shell. Not on wider screens,
 * where the round is part of the page. Undone on close or when the window grows past the phone width.
 */
export function usePhoneCover(cover: HTMLElement | null) {
  useEffect(() => {
    if (!cover || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    let undo: (() => void) | null = null;

    function engage() {
      if (!cover) return;
      const body = document.body;
      const previousOverflow = body.style.overflow;
      body.style.overflow = "hidden";
      const hide: Element[] = [];
      for (
        let node: HTMLElement = cover;
        node !== body && node.parentElement;
        node = node.parentElement
      ) {
        for (const sibling of Array.from(node.parentElement.children)) {
          // A Modal's own portal is never hidden by the cover.
          if (sibling !== node && !sibling.hasAttribute("data-modal-portal")) hide.push(sibling);
        }
      }
      const releaseInert = acquireInert(hide);
      undo = () => {
        body.style.overflow = previousOverflow;
        releaseInert();
      };
    }
    function sync() {
      undo?.();
      undo = null;
      if (query.matches) engage();
    }
    sync();
    query.addEventListener?.("change", sync);
    return () => {
      query.removeEventListener?.("change", sync);
      undo?.();
    };
  }, [cover]);
}
