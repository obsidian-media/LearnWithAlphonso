// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LearningPath, PinnedItem } from "@/lib/path-plan";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce((t, [k, v]) => t.replace(`$${k}`, v), to)}
      {...rest}
    >
      {children}
    </a>
  ),
}));
const usePathMock = vi.fn();
vi.mock("@/lib/learning-path-client", () => ({ usePath: usePathMock }));

const { PinnedRows, RehearsalHero } = await import("./PinnedRehearsal");

const ID = "11111111-1111-4111-8111-111111111111";
const stage: PinnedItem = {
  kind: "stage",
  rehearsalId: ID,
  eventKind: "interview",
  stage: "conversation",
  title: "The real conversation",
  subtitle: "Job interview rehearsal",
  minutes: 10,
  hero: false,
};
const warm: PinnedItem = {
  kind: "warmup_today",
  rehearsalId: ID,
  eventKind: "interview",
  stage: "warmup",
  title: "2-minute warm-up before your interview",
  subtitle: "The key phrases, one more time",
  minutes: 2,
  hero: true,
};
const followup: PinnedItem = {
  kind: "followup",
  rehearsalId: ID,
  eventKind: "interview",
  stage: null,
  title: "How did it go?",
  subtitle: "Your interview",
  minutes: 0,
  hero: false,
};

describe("PinnedRows (Today)", () => {
  it("shows nothing without a pinned item", () => {
    const { container } = render(<PinnedRows pinned={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a stage item opens that stage's call", () => {
    render(<PinnedRows pinned={[stage]} />);
    expect(screen.getByRole("link", { name: /The real conversation/ })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/conversation`,
    );
  });

  it("the event-day warm-up opens stage 1", () => {
    render(<PinnedRows pinned={[warm]} />);
    expect(
      screen.getByRole("link", { name: /2-minute warm-up before your interview/ }),
    ).toHaveAttribute("href", `/rehearse/${ID}/warmup`);
  });

  it("'How did it go?' opens the rehearsal page, which asks the four taps", () => {
    render(<PinnedRows pinned={[followup]} />);
    expect(screen.getByRole("link", { name: /How did it go\?/ })).toHaveAttribute(
      "href",
      "/rehearse",
    );
  });
});

describe("RehearsalHero (event day)", () => {
  const ready = (pinned: PinnedItem[]) =>
    usePathMock.mockReturnValue({
      state: { kind: "ready", path: { pinned } as unknown as LearningPath },
    });

  it("takes the hero on the event day: interview today, the 2-minute warm-up, Start 2 minutes", () => {
    ready([warm]);
    render(<RehearsalHero course="en" />);
    expect(screen.getByText("Interview today")).toBeInTheDocument();
    expect(screen.getByText("2-minute warm-up")).toBeInTheDocument();
    expect(screen.getByText("Say the key phrases once more before you go")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start 2 minutes" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/warmup`,
    );
  });

  it("is not there on an ordinary rehearsal day, after the event, or without the path", () => {
    ready([stage]);
    const a = render(<RehearsalHero course="en" />);
    expect(a.container).toBeEmptyDOMElement();
    ready([followup]);
    const b = render(<RehearsalHero course="en" />);
    expect(b.container).toBeEmptyDOMElement();
    usePathMock.mockReturnValue({ state: { kind: "loading" } });
    const c = render(<RehearsalHero course="en" />);
    expect(c.container).toBeEmptyDOMElement();
  });

  it("an older path with no pinned list is just not there", () => {
    usePathMock.mockReturnValue({ state: { kind: "ready", path: {} as LearningPath } });
    const { container } = render(<RehearsalHero course="en" />);
    expect(container).toBeEmptyDOMElement();
  });
});
