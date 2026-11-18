import { act } from "@testing-library/react";

/**
 * Two clicks React handles before it re-renders, as a fast double click can be. `fireEvent.click` twice re-renders in
 * between, so the button is already disabled for the second click and a missing in-flight guard goes unnoticed.
 */
export function doubleClick(el: HTMLElement): void {
  act(() => {
    el.click();
    el.click();
  });
}
