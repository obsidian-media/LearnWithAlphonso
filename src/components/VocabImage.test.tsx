// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { VocabImage } from "./VocabImage";

const OK =
  "https://qhcjpfbxfcltjbiuknyt.supabase.co/storage/v1/object/public/vocab-images/en/apple.jpg?v=0123abcd";
const NEXT = OK.replace("apple", "pear");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VocabImage", () => {
  it("shows a neutral placeholder slot while loading", () => {
    render(<VocabImage url={OK} alt="A red apple" className="h-32 w-full" />);
    const slot = screen.getByTestId("vocab-image");
    expect(slot).toHaveAttribute("data-phase", "loading");
    expect(slot).toHaveClass("bg-parchment", "h-32", "w-full");
  });

  it("reveals the image once it loads", () => {
    render(<VocabImage url={OK} alt="A red apple" />);
    fireEvent.load(screen.getByRole("img", { name: "A red apple" }));
    const slot = screen.getByTestId("vocab-image");
    expect(slot).toHaveAttribute("data-phase", "loaded");
    expect(slot).not.toHaveClass("bg-parchment");
  });

  it("collapses the whole slot when the image fails", () => {
    const { container } = render(<VocabImage url={OK} alt="A red apple" />);
    fireEvent.error(screen.getByRole("img", { name: "A red apple" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("collapses an image that already failed before hydration attached onError", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    const { container } = render(<VocabImage url={OK} alt="A red apple" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never renders a URL outside the vocab-images bucket", () => {
    const { container } = render(
      <VocabImage url="https://pixabay.com/get/gabc_640.jpg" alt="Roulette" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("gives a new URL a fresh chance after the previous one failed", () => {
    const { rerender } = render(<VocabImage url={OK} alt="A red apple" />);
    fireEvent.error(screen.getByRole("img", { name: "A red apple" }));
    rerender(<VocabImage url={NEXT} alt="A pear" />);
    expect(screen.getByTestId("vocab-image")).toHaveAttribute("data-phase", "loading");
  });
});
