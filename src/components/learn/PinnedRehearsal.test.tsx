// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("@/lib/use-pro-status", () => ({ useProStatus: () => ({ state: "free" }) }));
vi.mock("@/components/WebPaywall", () => ({ WebPaywallSheet: () => <p>paywall</p> }));
const usePathMock = vi.fn();
vi.mock("@/lib/learning-path-client", () => ({ usePath: usePathMock }));

const { PinnedRows, RehearsalHero, useHeroPinned } = await import("./PinnedRehearsal");

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

  it("a stage item opens the partner sheet for that stage, not a call", async () => {
    const user = userEvent.setup();
    render(<PinnedRows pinned={[stage]} />);
    expect(screen.queryByRole("link", { name: /Start with/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /The real conversation/ }));
    expect(screen.getByRole("link", { name: "Start with Alphonso" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/conversation`,
    );
  });

  it("the event-day warm-up opens the sheet for stage 1", async () => {
    const user = userEvent.setup();
    render(<PinnedRows pinned={[warm]} />);
    await user.click(
      screen.getByRole("button", { name: /2-minute warm-up before your interview/ }),
    );
    expect(screen.getByRole("link", { name: "Start with Alphonso" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/warmup`,
    );
  });

  it("'How did it go?' opens the rehearsal page, which asks the four taps", () => {
    render(<PinnedRows pinned={[followup]} />);
    expect(screen.getByRole("link", { name: /How did it go\?/ })).toHaveAttribute(
      "href",
      "/rehearse",
    );
  });
});

describe("the event-day hero", () => {
  const ready = (pinned: PinnedItem[]) =>
    usePathMock.mockReturnValue({
      state: { kind: "ready", path: { pinned } as unknown as LearningPath },
    });
  const hero = () => {
    let out: PinnedItem | null = null;
    const Probe = () => {
      out = useHeroPinned("en");
      return null;
    };
    render(<Probe />);
    return out;
  };

  it("RehearsalHero shows: interview today, the 2-minute warm-up, Start 2 minutes", async () => {
    const user = userEvent.setup();
    render(<RehearsalHero item={warm} />);
    expect(screen.getByText("Interview today")).toBeInTheDocument();
    expect(screen.getByText("2-minute warm-up")).toBeInTheDocument();
    expect(screen.getByText("Say the key phrases once more before you go")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start 2 minutes" }));
    expect(screen.getByRole("link", { name: "Start with Alphonso" })).toHaveAttribute(
      "href",
      `/rehearse/${ID}/warmup`,
    );
  });

  it("useHeroPinned finds the hero item on the event day", () => {
    ready([warm]);
    expect(hero()).toEqual(warm);
  });

  it("is null on an ordinary rehearsal day, after the event, with an older path, or while loading", () => {
    ready([stage]);
    expect(hero()).toBeNull();
    ready([followup]);
    expect(hero()).toBeNull();
    usePathMock.mockReturnValue({ state: { kind: "ready", path: {} as LearningPath } });
    expect(hero()).toBeNull();
    usePathMock.mockReturnValue({ state: { kind: "loading" } });
    expect(hero()).toBeNull();
  });
});
