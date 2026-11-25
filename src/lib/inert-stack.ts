/**
 * One shared, ref-counted owner of `inert` / `aria-hidden` on page elements. A Modal and the Say the picture phone cover
 * can both hide the same elements at once (the round opens the AI consent sheet), and they close in any order, so a
 * per-holder save-and-restore is not safe: the first to close would clear what the other still needs, or the last to
 * close would put back a state that was already someone else's. Here the element's ORIGINAL state is recorded the first
 * time anyone hides it, each element counts its holders, and the original is restored only when the count reaches 0.
 *
 * Note: a body-level container that is not part of the page proper (a toast region, say) is hidden like any other
 * sibling while a Modal is open.
 */
type Entry = { inert: boolean; ariaHidden: string | null; holders: number };
const entries = new Map<Element, Entry>();

/** Hides `elements` (inert + aria-hidden) and returns a release function. Releasing twice does nothing. */
export function acquireInert(elements: Iterable<Element>): () => void {
  const held = new Set<Element>();
  for (const el of elements) {
    if (held.has(el)) continue;
    held.add(el);
    const entry = entries.get(el);
    if (entry) {
      entry.holders += 1;
    } else {
      entries.set(el, {
        inert: el.hasAttribute("inert"),
        ariaHidden: el.getAttribute("aria-hidden"),
        holders: 1,
      });
    }
    el.setAttribute("inert", "");
    el.setAttribute("aria-hidden", "true");
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const el of held) {
      const entry = entries.get(el);
      if (!entry) continue;
      entry.holders -= 1;
      if (entry.holders > 0) continue;
      entries.delete(el);
      if (!entry.inert) el.removeAttribute("inert");
      if (entry.ariaHidden === null) el.removeAttribute("aria-hidden");
      else el.setAttribute("aria-hidden", entry.ariaHidden);
    }
  };
}
