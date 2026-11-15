// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (s: { location: { pathname: string } }) => unknown }) =>
    select({ location: { pathname: "/listen" } }),
}));

const { PodcastTranscriptPanel } = await import("./PodcastTranscript");
const { BottomTabs } = await import("./AppShell");

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");

// The mint-green names resolve to the round-6 palette now, but a screen written in them is the old structure: the
// batch-3 screens must say ds-* so a palette change in tokens.json reaches them by name.
const LEGACY =
  /\b(?:bg|text|border|ring|from|to)-(?:surface|parchment|ink|ink-soft|moss|moss-deep|hairline|ember|card|rose-\d+)(?:\/\d+)?\b/;

const CLEANED = [
  "src/components/AppShell.tsx",
  "src/components/PodcastTranscript.tsx",
  "src/components/LegalPage.tsx",
  "src/components/AskingAlphonso.tsx",
  "src/components/AnswerVerdictPanel.tsx",
  "src/components/ui/StatPill.tsx",
  "src/components/ui/TileCard.tsx",
  "src/routes/index.tsx",
  "src/routes/reset-password.tsx",
];

describe("batch 3 web screens speak the round-6 system", () => {
  it.each(CLEANED)("%s has no legacy colour class", (rel) => {
    const text = read(rel);
    expect(text.match(LEGACY)?.[0]).toBeUndefined();
    expect(text).toMatch(/\b(?:bg|text|border)-ds-/);
  });

  it("holds no raw colour or font size (the baseline for these files is zero)", () => {
    for (const rel of CLEANED) {
      const text = read(rel);
      expect(text, rel).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\btext-\[\d+px\]/);
    }
  });
});

describe("the bottom tab bar", () => {
  it("draws the active tab in the choice blue with a navy label, and the rest quiet", () => {
    render(<BottomTabs />);
    const active = screen.getByLabelText("Library");
    expect(active.children[0]).toHaveClass("text-ds-choice");
    expect(active.children[1]).toHaveClass("text-ds-brand");
    const idle = screen.getByLabelText("Learn");
    expect(idle.children[0]).toHaveClass("text-ds-ink-faint");
    expect(idle.children[1]).toHaveClass("text-ds-ink-soft");
  });

  it("keeps every tab a touch target and none of them a floating pill", () => {
    render(<BottomTabs />);
    for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-12");
    const nav = screen.getByRole("navigation");
    expect(nav.className).toContain("sticky");
    expect(nav.className).not.toMatch(/\brounded/);
  });
});

describe("the transcript sheet", () => {
  it("paints the episode's room behind a navy sheet, like the full player", () => {
    const { baseElement } = render(
      <PodcastTranscriptPanel
        title="Ordering Coffee"
        transcript="Hello there."
        course="en"
        room="coffee"
        isLoading={false}
        onClose={() => {}}
      />,
    );
    const room = baseElement.querySelector("[data-transcript-room]") as HTMLElement;
    expect(room.style.backgroundImage).toContain("/avatar/scenes/coffee.webp");
    expect(screen.getByRole("dialog").className).toContain("bg-ds-hero");
  });

  it("falls back to the radio room when the episode has none", () => {
    const { baseElement } = render(
      <PodcastTranscriptPanel
        title="T"
        transcript={null}
        course="en"
        isLoading={false}
        onClose={() => {}}
      />,
    );
    expect(
      (baseElement.querySelector("[data-transcript-room]") as HTMLElement).style.backgroundImage,
    ).toContain("/avatar/scenes/radio.webp");
  });
});

describe("one shared empty and error component", () => {
  it.each([
    "src/routes/_authenticated/league.tsx",
    "src/routes/_authenticated/review.tsx",
    "src/routes/_authenticated/season.tsx",
    "src/routes/_authenticated/teams.tsx",
    "src/routes/_authenticated/teams_.$teamId.tsx",
    "src/components/AiConsentGate.tsx",
  ])("%s uses DsEmptyState and no hand-rolled state card", (rel) => {
    const text = read(rel);
    expect(text).toContain("DsEmptyState");
    expect(text).not.toContain("PoseCard");
  });

  it("the old PoseCard is gone, so there is only one", () => {
    expect(read("src/components/ds/Blocks.tsx")).not.toContain("export function PoseCard");
  });
});
