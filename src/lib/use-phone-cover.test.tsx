// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { usePhoneCover } from "./use-phone-cover";

let phone = true;
const listeners = new Set<() => void>();
function stubMatchMedia() {
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return phone;
    },
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  listeners.clear();
  document.body.style.overflow = "";
});

function Shell({ open = true }: { open?: boolean }) {
  const [cover, setCover] = useState<HTMLDivElement | null>(null);
  usePhoneCover(open ? cover : null);
  return (
    <div id="root">
      <header>
        <button>top bar</button>
      </header>
      <main>
        <section>
          <button>page button</button>
        </section>
        <div ref={setCover} data-testid="cover">
          <button>inside cover</button>
        </div>
      </main>
      <nav>
        <button>tab bar</button>
      </nav>
    </div>
  );
}

describe("usePhoneCover", () => {
  it("on a phone: locks body scroll, makes the shell inert so Tab and screen readers stay on the cover, and undoes it on close", () => {
    stubMatchMedia();
    const { rerender } = render(<Shell />);
    expect(document.body.style.overflow).toBe("hidden");
    for (const el of [
      screen.getByText("top bar").closest("header")!,
      screen.getByText("page button").closest("section")!,
      screen.getByText("tab bar").closest("nav")!,
    ]) {
      expect(el).toHaveAttribute("inert");
      expect(el).toHaveAttribute("aria-hidden", "true");
    }
    // The cover and its ancestors stay live.
    expect(screen.getByTestId("cover")).not.toHaveAttribute("inert");
    expect(document.getElementById("root")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("cover").closest("main")).not.toHaveAttribute("inert");

    // jsdom does not skip inert subtrees when tabbing, so the check is on the attribute browsers act on.

    rerender(<Shell open={false} />);
    expect(document.body.style.overflow).toBe("");
    for (const sel of ["header", "section", "nav"]) {
      const el = document.querySelector(sel)!;
      expect(el).not.toHaveAttribute("inert");
      expect(el).not.toHaveAttribute("aria-hidden");
    }
  });

  it("puts back an aria-hidden or inert the page already had, instead of clearing it", () => {
    stubMatchMedia();
    const { container, rerender } = render(<Shell open={false} />);
    container.querySelector("nav")!.setAttribute("aria-hidden", "false");
    container.querySelector("header")!.setAttribute("inert", "");
    rerender(<Shell />);
    expect(container.querySelector("nav")).toHaveAttribute("aria-hidden", "true");
    rerender(<Shell open={false} />);
    expect(container.querySelector("nav")).toHaveAttribute("aria-hidden", "false");
    expect(container.querySelector("header")).toHaveAttribute("inert");
  });

  it("does nothing on a wider screen, and follows the window when it crosses the phone width", () => {
    phone = false;
    stubMatchMedia();
    render(<Shell />);
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByText("tab bar").closest("nav")).not.toHaveAttribute("inert");
    phone = true;
    act(() => listeners.forEach((fn) => fn()));
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByText("tab bar").closest("nav")).toHaveAttribute("inert");
    phone = false;
    act(() => listeners.forEach((fn) => fn()));
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByText("tab bar").closest("nav")).not.toHaveAttribute("inert");
    phone = true;
  });
});
