// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { PracticeCall } = await import("./PracticeCall");
const { ALPHONSO_KIT, kitFromManifest } = await import("@/lib/avatar/layers");

const base = {
  title: "Ordering a coffee",
  avatar: {
    phase: { kind: "idle" as const },
    replyText: null,
    getAudio: () => null,
    replyVerdict: { serial: 0, verdict: "none" as const },
    course: "en" as const,
    reducedMotion: false,
  },
  mode: "idle" as const,
  caption: null,
  recording: false,
  talkDisabled: false,
  onHoldStart: () => {},
  onHoldEnd: () => {},
  onToggle: () => {},
  getStream: () => null,
  ttsOn: true,
  onToggleTts: () => {},
  error: null,
  endTo: "/converse",
  messages: [],
  sheet: null,
  reducedMotion: false,
};

const room = (c: HTMLElement) =>
  (c.firstElementChild as HTMLElement).style.backgroundImage.replace(/url\(["']?|["']?\)/g, "");

describe("the room", () => {
  it("shows the scenario's own picture in light mode with no dimming", () => {
    const { container, queryByTestId } = render(
      <PracticeCall {...base} scenarioId="coffee" dark={false} />,
    );
    expect(room(container)).toBe("/avatar/scenes/coffee.webp");
    expect(queryByTestId("evening-overlay")).toBeNull();
  });

  it("dims the same picture with the navy multiply in dark mode", () => {
    const { container, getByTestId } = render(
      <PracticeCall {...base} scenarioId="coffee" dark={true} />,
    );
    expect(room(container)).toBe("/avatar/scenes/coffee.webp");
    const overlay = getByTestId("evening-overlay");
    expect(overlay.style.mixBlendMode).toBe("multiply");
    expect(overlay.style.background).toContain("22, 32, 60");
  });

  it("swaps the default room for its evening picture instead of dimming it", () => {
    const light = render(<PracticeCall {...base} scenarioId="city-day" dark={false} />);
    expect(room(light.container)).toBe("/avatar/scenes/room-light.webp");
    light.unmount();
    const dark = render(<PracticeCall {...base} scenarioId="city-day" dark={true} />);
    expect(room(dark.container)).toBe("/avatar/scenes/room-dark.webp");
    expect(dark.queryByTestId("evening-overlay")).toBeNull();
  });

  it("gives a conversation with no scenario (a campaign) the default room", () => {
    const { container } = render(<PracticeCall {...base} scenarioId={null} dark={false} />);
    expect(room(container)).toBe("/avatar/scenes/room-light.webp");
  });

  it("holds the caption to four lines, so a long reply cannot climb over his mouth", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const { getByTestId } = render(
      <PracticeCall
        {...base}
        scenarioId="coffee"
        dark={false}
        caption={{ text: long, mine: false, spoken: false }}
      />,
    );
    const caption = getByTestId("call-caption");
    expect(caption.firstElementChild).toHaveClass("line-clamp-4");
    // Clamped on screen only: the live region still holds every word.
    expect(caption).toHaveTextContent("word79");
  });

  it("marks the live dot red only while he speaks", () => {
    const quiet = render(<PracticeCall {...base} scenarioId="coffee" dark={false} />);
    expect(quiet.getByTestId("live-dot")).toHaveAttribute("data-live", "false");
    quiet.unmount();
    const talking = render(
      <PracticeCall {...base} scenarioId="coffee" dark={false} mode="speaking" />,
    );
    expect(talking.getByTestId("live-dot")).toHaveAttribute("data-live", "true");
    expect(talking.getByTestId("call-state")).toHaveTextContent("Speaking");
  });
});

describe("the character is a parameter", () => {
  const rect = (x: number) => ({ x, y: 0.1, w: 0.2, h: 0.1 });
  // A kit like the one Hector is expected to have: no ear layers, no glint, and an "eyes" expression group.
  const hector = kitFromManifest(
    {
      layers: {
        "mouth-ah": rect(0.4),
        "eyes-neutral": rect(0.3),
        "eyes-raised": rect(0.3),
        "eyes-lowered": rect(0.3),
      },
    },
    {
      id: "hector",
      displayName: "Hector",
      basePath: "/hector-kit",
      expressionPrefix: "eyes",
      defaultRoom: { light: "/hector-kit/office-light.webp", dark: "/hector-kit/office-dark.webp" },
    },
  );

  it("reads optional layers and the expression group from the manifest", () => {
    expect(hector.rects.earLeft).toBeUndefined();
    expect(hector.rects.earRight).toBeUndefined();
    expect(hector.rects.glint).toBeUndefined();
    expect(hector.rects.expression).toEqual(rect(0.3));
    expect(hector.expressionFiles).toEqual({
      neutral: "eyes-neutral.webp",
      raised: "eyes-raised.webp",
      lowered: "eyes-lowered.webp",
    });
    expect(ALPHONSO_KIT.rects.earLeft).toBeUndefined();
    expect(ALPHONSO_KIT.rects.glint).toBeDefined();
    expect(ALPHONSO_KIT.expressionFiles.raised).toBe("brows-raised.webp");
  });

  it("names the character, draws only the layers his kit has, from his own folder", () => {
    const { container, getByText } = render(
      <PracticeCall {...base} kit={hector} scenarioId="free-talk" dark={false} />,
    );
    expect(getByText("Hector")).toBeInTheDocument();
    const stage = container.querySelector("[data-testid=alphonso-stage]")!;
    const srcs = [...stage.querySelectorAll("img")].map((i) => i.getAttribute("src")!);
    // base + 6 mouths + 3 expression layers; no ears.
    expect(srcs).toHaveLength(10);
    for (const src of srcs) expect(src).toMatch(/^\/hector-kit\//);
    expect(srcs.some((s) => s.includes("ear-"))).toBe(false);
    expect(srcs).toContain("/hector-kit/eyes-raised.webp");
    const mouth = stage.querySelector('img[src$="mouth-ah.webp"]') as HTMLImageElement;
    expect(mouth.style.left).toBe("40%");
    expect(room(container)).toBe("/hector-kit/office-light.webp");
  });

  it("defaults to Alphonso", () => {
    const { getByText } = render(<PracticeCall {...base} scenarioId="coffee" dark={false} />);
    expect(getByText("Alphonso")).toBeInTheDocument();
  });
});
