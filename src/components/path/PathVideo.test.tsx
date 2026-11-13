// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import fixtures from "../../lib/learning-path.fixtures.json";

const links: { to: string; search?: unknown; params?: unknown }[] = [];
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    params,
    children,
    className,
  }: {
    to: string;
    search?: unknown;
    params?: unknown;
    children: React.ReactNode;
    className?: string;
  }) => {
    links.push({ to, search, params });
    return (
      <a href={to} className={className}>
        {children}
      </a>
    );
  },
}));
vi.mock("@/components/AppShell", () => ({
  MobileFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/GoalCard", () => ({ GoalCard: () => <div /> }));
vi.mock("@/lib/auth-headers", () => ({ authHeaders: async () => ({}) }));
vi.mock("../../lib/auth-headers", () => ({ authHeaders: async () => ({}) }));

const { ItemRow, TypeBadge } = await import("./PathParts");
const { BuildScreen } = await import("./PathScreens");

afterEach(() => {
  cleanup();
  links.length = 0;
  vi.unstubAllGlobals();
});

const videoItem = {
  type: "video" as const,
  id: "vid-order",
  title: "I'd like vs I want",
  subtitle: "Video",
  minutes: 1,
  state: "todo" as const,
  ref: { kind: "video" as const, id: "vid-order" },
};

describe("a video stop on the path", () => {
  it("opens the Library at /listen with the video id, so the player opens on arrival", () => {
    render(<ItemRow item={videoItem} />);
    expect(links).toContainEqual({
      to: "/listen",
      search: { video: "vid-order" },
      params: undefined,
    });
    expect(screen.getByText(/Video:/)).toBeTruthy();
  });

  it("a podcast stop still opens the Library without a video id", () => {
    render(
      <ItemRow
        item={{ ...videoItem, type: "podcast", ref: { kind: "podcast", id: "ep" }, title: "Cafe" }}
      />,
    );
    expect(links[0]).toMatchObject({ to: "/listen" });
    expect(links[0].search).toBeUndefined();
  });

  it("has its own badge", () => {
    const { container } = render(<TypeBadge type="video" />);
    expect(container.querySelector('[data-path-type="video"]')).not.toBeNull();
  });
});

describe("the Videos switch on Build my path", () => {
  function serve(path: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ path }), { status: 200 })),
    );
  }
  it("is not offered while there is nothing to watch", async () => {
    serve(fixtures.onTrack);
    render(<BuildScreen />);
    await screen.findByRole("switch", { name: "Podcasts in my path" });
    expect(screen.queryByRole("switch", { name: "Videos in my path" })).toBeNull();
  });
  it("is offered once a video gives the mix minutes", async () => {
    serve(fixtures.withVideo);
    render(<BuildScreen />);
    expect(await screen.findByRole("switch", { name: "Videos in my path" })).toBeTruthy();
  });
});
