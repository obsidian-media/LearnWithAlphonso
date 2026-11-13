// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplainSettings } from "@/lib/explain-settings";
import { ExplainError } from "@/lib/explain-client";

let settings: ExplainSettings | null = { nativeLanguage: "fa", mode: "tap" };
vi.mock("@/lib/explain-settings", async (orig) => ({
  ...(await orig<typeof import("@/lib/explain-settings")>()),
  useExplainSettings: () => settings,
}));
vi.mock("@/lib/social-safety.functions", () => ({ reportAiResponse: vi.fn() }));

import { ExplainInMyLanguage } from "./ExplainInMyLanguage";

const wrong = {
  kind: "wrong-answer",
  course: "en",
  question: "I am live in a flat.",
  wrongAnswer: "I am live in a flat.",
  correctAnswer: "I live in a flat.",
} as const;
const answer = {
  explanation: "برای جایی که زندگی می‌کنید: I live here. فعل am فقط",
  language: "fa",
  direction: "rtl",
  cached: false,
} as const;

beforeEach(() => {
  settings = { nativeLanguage: "fa", mode: "tap" };
});
afterEach(cleanup);

describe("ExplainInMyLanguage", () => {
  it("shows a chip named for the learner's language and fetches nothing until it is tapped", () => {
    const fetchExplanation = vi.fn();
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    expect(screen.getByRole("button", { name: "Explain in Persian" })).toBeTruthy();
    expect(fetchExplanation).not.toHaveBeenCalled();
  });

  it.each([
    ["target language only", { nativeLanguage: "fa", mode: "off" } as const],
    ["no native language", { nativeLanguage: undefined, mode: "tap" } as const],
    ["native language equals the course", { nativeLanguage: "en", mode: "tap" } as const],
    ["always mode, same language", { nativeLanguage: "en", mode: "always" } as const],
  ])("renders nothing for %s", (_n, s) => {
    settings = s;
    const { container } = render(
      <ExplainInMyLanguage request={wrong} fetchExplanation={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while the settings are still being read, and with no item", () => {
    settings = null;
    const a = render(<ExplainInMyLanguage request={wrong} fetchExplanation={vi.fn()} />);
    expect(a.container.innerHTML).toBe("");
    settings = { nativeLanguage: "fa", mode: "tap" };
    const b = render(<ExplainInMyLanguage request={null} fetchExplanation={vi.fn()} />);
    expect(b.container.innerHTML).toBe("");
  });

  it("on tap shows the explanation right to left, labelled AI, with the quoted English kept left to right", async () => {
    const fetchExplanation = vi.fn(async () => answer);
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Explain in Persian" }));
    const text = await screen.findByText(/برای جایی/);
    const block = text.closest("[data-explain-text]")!;
    expect(block.getAttribute("dir")).toBe("rtl");
    expect(block.getAttribute("lang")).toBe("fa");
    const quoted = Array.from(block.querySelectorAll("bdi")).map((b) => [
      b.getAttribute("dir"),
      b.textContent,
    ]);
    expect(quoted).toEqual([
      ["ltr", "I live here."],
      ["ltr", "am"],
    ]);
    expect(document.querySelector("[data-ai-label]")!.textContent).toContain("AI · Persian");
    expect(fetchExplanation).toHaveBeenCalledWith(wrong);
  });

  it("a left-to-right language is not forced right to left", async () => {
    settings = { nativeLanguage: "es", mode: "tap" };
    const fetchExplanation = vi.fn(async () => ({
      explanation: "Usamos el presente.",
      language: "es",
      direction: "ltr" as const,
      cached: true,
    }));
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Explain in Spanish" }));
    const block = (await screen.findByText(/Usamos/)).closest("[data-explain-text]")!;
    expect(block.getAttribute("dir")).toBe("ltr");
    expect(block.querySelector("bdi")).toBeNull();
  });

  it("tells the learner when today's explanations are used up, and offers no loop", async () => {
    const fetchExplanation = vi.fn(async () => {
      throw new ExplainError("quotaExceeded");
    });
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Explain in Persian" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/tomorrow/i);
  });

  it("says so when offline", async () => {
    const fetchExplanation = vi.fn(async () => {
      throw new ExplainError("offline");
    });
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Explain in Persian" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/connection/i);
  });

  it("shows a loading state and disables the chip while the request is out", async () => {
    let release!: (v: typeof answer) => void;
    const fetchExplanation = vi.fn(() => new Promise<typeof answer>((r) => (release = r)));
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Explain in Persian" }));
    const chip = screen.getByRole("button", { name: /Explaining/ });
    expect((chip as HTMLButtonElement).disabled).toBe(true);
    release(answer);
    await screen.findByText(/برای جایی/);
  });

  it("'Always show' asks by itself, once, and 'Tap' never does", async () => {
    settings = { nativeLanguage: "fa", mode: "always" };
    const fetchExplanation = vi.fn(async () => answer);
    const { rerender } = render(
      <ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />,
    );
    await screen.findByText(/برای جایی/);
    rerender(<ExplainInMyLanguage request={wrong} fetchExplanation={fetchExplanation} />);
    expect(fetchExplanation).toHaveBeenCalledTimes(1);
  });

  it("a chat message says 'Say that in Persian' and Hector asks on its own allowance", async () => {
    const fetchExplanation = vi.fn(async () => answer);
    render(
      <ExplainInMyLanguage
        request={{ kind: "message", course: "en", text: "Nice try!" }}
        surface="hector"
        fetchExplanation={fetchExplanation}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Say that in Persian" }));
    await waitFor(() =>
      expect(fetchExplanation).toHaveBeenCalledWith({
        kind: "message",
        course: "en",
        text: "Nice try!",
        surface: "hector",
      }),
    );
  });

  it("Show in English puts the chip back", async () => {
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={vi.fn(async () => answer)} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Explain in Persian" }));
    await user.click(await screen.findByRole("button", { name: "Show in English" }));
    expect(screen.getByRole("button", { name: "Explain in Persian" })).toBeTruthy();
  });

  it("offers a way to flag a bad explanation", async () => {
    render(<ExplainInMyLanguage request={wrong} fetchExplanation={vi.fn(async () => answer)} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Explain in Persian" }));
    expect(await screen.findByRole("button", { name: "Report this response" })).toBeTruthy();
  });
});
