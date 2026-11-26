// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { Modal } from "@/components/Modal";
import { usePhoneCover } from "./use-phone-cover";
import { acquireInert } from "./inert-stack";

/**
 * The Say the picture cover and a Modal (the AI consent sheet opens from inside the round) hide the same elements and
 * close in any order. The shell must come back exactly as it was, whichever closes first.
 */
beforeEachPhone();
function beforeEachPhone() {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}
// Another body-level element (a second root, a toast region): hidden by the cover AND by a Modal, so the two overlap.
let extra: HTMLElement;
beforeEach(() => {
  extra = document.createElement("div");
  extra.id = "extra-root";
  document.body.appendChild(extra);
});
afterEach(() => {
  extra.remove();
  cleanup();
  document.body.style.overflow = "";
  beforeEachPhone();
});

function App({ cover, modal }: { cover: boolean; modal: boolean }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  usePhoneCover(cover ? el : null);
  return (
    <div id="app">
      <header>
        <button>top bar</button>
      </header>
      <main>
        <div ref={setEl}>
          <button>cover</button>
        </div>
      </main>
      <nav>
        <button>tab bar</button>
      </nav>
      {modal && (
        <Modal labelledBy="t" onEscape={() => {}}>
          <h2 id="t">Sheet</h2>
          <button>ok</button>
        </Modal>
      )}
    </div>
  );
}

const shell = () => [
  document.querySelector("header")!,
  document.querySelector("nav")!,
  document.getElementById("app")!.parentElement!, // the render container, a body child
  extra,
];
const hidden = (e: Element) => e.hasAttribute("inert") || e.hasAttribute("aria-hidden");

describe("inert-stack with the phone cover and a Modal", () => {
  it("cover first, then the modal; the cover closes first, then the modal: the shell is fully restored", () => {
    const { rerender } = render(<App cover modal={false} />);
    rerender(<App cover modal />);
    rerender(<App cover={false} modal />);
    // Still under the modal: the overlapping element stays hidden.
    expect(extra).toHaveAttribute("inert");
    rerender(<App cover={false} modal={false} />);
    for (const e of shell()) expect(hidden(e), e.tagName).toBe(false);
  });

  it("modal first, then the cover; the modal closes first, then the cover", () => {
    const { rerender } = render(<App cover={false} modal />);
    rerender(<App cover modal />);
    rerender(<App cover modal={false} />);
    // The cover still holds its elements.
    expect(document.querySelector("nav")).toHaveAttribute("inert");
    expect(extra).toHaveAttribute("inert");
    rerender(<App cover={false} modal={false} />);
    for (const e of shell()) expect(hidden(e), e.tagName).toBe(false);
  });

  it("unmounting both at once (a route change) leaves nothing hidden", () => {
    const { unmount } = render(<App cover modal />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelectorAll("[inert],[aria-hidden]").length).toBe(0);
  });

  it("keeps an inert or aria-hidden the page already had, whichever holders come and go", () => {
    const { container, rerender } = render(<App cover={false} modal={false} />);
    extra.setAttribute("aria-hidden", "false");
    const nav = container.querySelector("nav")!;
    const header = container.querySelector("header")!;
    nav.setAttribute("aria-hidden", "false");
    header.setAttribute("inert", "");
    rerender(<App cover modal />);
    expect(nav).toHaveAttribute("aria-hidden", "true");
    rerender(<App cover={false} modal />);
    rerender(<App cover={false} modal={false} />);
    expect(nav).toHaveAttribute("aria-hidden", "false");
    expect(nav).not.toHaveAttribute("inert");
    expect(header).toHaveAttribute("inert");
    expect(header).not.toHaveAttribute("aria-hidden");
    expect(extra).toHaveAttribute("aria-hidden", "false");
    expect(extra).not.toHaveAttribute("inert");
  });
});

describe("acquireInert", () => {
  it("releases an element only when its last holder lets go, and a second release is harmless", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const a = acquireInert([el]);
    const b = acquireInert([el]);
    a();
    a();
    expect(el).toHaveAttribute("inert");
    b();
    expect(el.hasAttribute("inert")).toBe(false);
    expect(el.hasAttribute("aria-hidden")).toBe(false);
    el.remove();
  });
});
