// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";

const invalidate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    useRouter: () => ({ invalidate }),
    // Both read router context that a bare renderToStaticMarkup of the
    // shell has no way to provide -- stubbed so the shell's own markup
    // (notably the first-paint theme script) can be rendered in isolation.
    HeadContent: () => null,
    Scripts: () => null,
    Outlet: () => null,
  };
});

const invalidateQueries = vi.fn();
const queryClient = {
  invalidateQueries,
  // QueryClientProvider pokes at these on mount.
  mount: () => {},
  unmount: () => {},
  getDefaultOptions: () => ({}),
} as unknown as import("@tanstack/react-query").QueryClient;

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useQueryClient: () => queryClient,
  };
});

vi.mock("../components/CookieConsent", () => ({ CookieConsent: () => null }));

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}));

const fetchProgress = vi.fn();
vi.mock("../lib/sync.functions", () => ({ fetchProgress: () => fetchProgress() }));
const getMyProfile = vi.fn();
vi.mock("../lib/leaderboard.functions", () => ({ getMyProfile: () => getMyProfile() }));

const hydrate = vi.fn();
const reset = vi.fn();
vi.mock("../lib/progress", () => ({
  useProgress: (sel: (s: unknown) => unknown) => sel({ hydrate, reset }),
}));
const hydrateFromServer = vi.fn();
vi.mock("../lib/theme", () => ({
  useTheme: (sel: (s: unknown) => unknown) => sel({ hydrateFromServer }),
}));

const reportError = vi.fn();
vi.mock("../lib/error-reporting", () => ({ reportError }));

// Avoid importing the real ?url-suffixed CSS asset (a Vite-only import
// specifier that doesn't resolve under plain vitest module resolution).
vi.mock("../styles.css?url", () => ({ default: "/styles.css" }));

const { Route } = await import("./__root");

beforeEach(() => {
  invalidate.mockClear();
  reportError.mockClear();
});

describe("NotFoundComponent", () => {
  it("shows a 404 message with a link home", () => {
    // The real component ignores its props entirely; the type requires
    // them anyway since it's typed generically for any route's 404.
    const NotFound = Route.options.notFoundComponent! as React.ComponentType<object>;
    render(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});

describe("ErrorComponent", () => {
  it("reports the error once on mount", () => {
    const ErrorComponent = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    const error = new Error("boom");
    render(<ErrorComponent error={error} reset={() => {}} />);
    expect(reportError).toHaveBeenCalledWith(error, { boundary: "tanstack_root_error_component" });
  });

  it("invalidates the router and resets on 'Try again'", async () => {
    const ErrorComponent = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    const reset = vi.fn();
    const user = userEvent.setup();
    render(<ErrorComponent error={new Error("boom")} reset={reset} />);

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(invalidate).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });

  it("offers a link back home", () => {
    const ErrorComponent = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    render(<ErrorComponent error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});

describe("head()", () => {
  // head() is typed as possibly-async on RouteOptions; this route's is
  // synchronous, so narrow it here rather than awaiting in every test.
  type HeadEntry = { rel?: string; href?: string; name?: string; title?: string };
  const head = Route.options.head!({} as never) as unknown as {
    meta: HeadEntry[];
    links: HeadEntry[];
  };

  it("sets the page title and description", () => {
    const meta = head.meta;
    expect(meta).toContainEqual({
      title: "Learn with Alphonso — English, one lesson at a time",
    });
    expect(meta.find((m) => "name" in m && m.name === "description")).toBeTruthy();
  });

  it("links the app stylesheet and the web manifest", () => {
    const links = head.links;
    expect(links.find((l) => l.rel === "stylesheet" && l.href === "/styles.css")).toBeTruthy();
    expect(links).toContainEqual({ rel: "manifest", href: "/site.webmanifest" });
  });

  it("preconnects to the font hosts it then loads stylesheets from", () => {
    const links = head.links;
    const preconnects = links.filter((l) => l.rel === "preconnect").map((l) => l.href);
    expect(preconnects).toContain("https://fonts.googleapis.com");
    expect(preconnects).toContain("https://fonts.gstatic.com");
    // Every Google-hosted stylesheet must be covered by one of those
    // preconnects, or the preconnect is doing nothing.
    const googleSheets = links.filter(
      (l) => l.rel === "stylesheet" && String(l.href).startsWith("https://fonts.googleapis.com"),
    );
    expect(googleSheets.length).toBeGreaterThan(0);
  });
});

describe("first-paint theme script", () => {
  // The inline script in RootShell runs before React hydrates. If it ever
  // disagrees with resolveInitialTheme, the page paints one theme while the
  // store reports another -- the exact flash-of-wrong-theme the script
  // exists to prevent. These tests run the real shipped string.
  // shellComponent isn't on the public RouteOptions type yet, though it is
  // a real, supported option (set in __root.tsx) -- narrow through the
  // options object rather than loosening the component's own typing.
  const Shell = (
    Route.options as unknown as {
      shellComponent: React.ComponentType<{ children: React.ReactNode }>;
    }
  ).shellComponent;
  const markup = renderToStaticMarkup(<Shell>{null}</Shell>);
  const script = /<script>([\s\S]*?)<\/script>/.exec(markup)?.[1] ?? "";

  function runWith(stored: string | null): string | undefined {
    document.documentElement.removeAttribute("data-theme");
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    new Function(script)();
    return document.documentElement.dataset.theme;
  }

  it("is actually present in the shell", () => {
    expect(script).toContain("localStorage");
  });

  it("defaults a brand-new visitor to canopy", () => {
    expect(runWith(null)).toBe("canopy");
  });

  it("leaves meadow to :root rather than setting an attribute", () => {
    // Meadow IS :root, so setting data-theme="meadow" would be a no-op at
    // best -- the script deliberately skips it.
    expect(runWith("meadow")).toBeUndefined();
  });

  it.each(["studio-ink", "manuscript", "canopy"])("applies %s from localStorage", (theme) => {
    expect(runWith(theme)).toBe(theme);
  });

  it("ignores a garbage stored value instead of applying it", () => {
    expect(runWith("not-a-theme")).toBeUndefined();
  });

  it("survives localStorage throwing (private mode / blocked cookies)", () => {
    document.documentElement.removeAttribute("data-theme");
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => new Function(script)()).not.toThrow();
    spy.mockRestore();
  });
});

describe("AuthSync (inside RootComponent)", () => {
  const RootComponent = Route.options.component! as React.ComponentType<object>;

  beforeEach(() => {
    // Route.useRouteContext is a method ON the Route object, not the
    // module-level export of the same name -- mocking the module does not
    // intercept it, so spy on the Route itself.
    vi.spyOn(Route, "useRouteContext").mockReturnValue({ queryClient } as never);
    getSession.mockReset();
    onAuthStateChange.mockReset().mockReturnValue({ subscription: { unsubscribe } });
    onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    fetchProgress.mockReset();
    getMyProfile.mockReset();
    hydrate.mockReset();
    reset.mockReset();
    hydrateFromServer.mockReset();
    invalidateQueries.mockReset();
    unsubscribe.mockReset();
  });

  it("resets progress when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RootComponent />);
    await waitFor(() => expect(reset).toHaveBeenCalled());
    expect(fetchProgress).not.toHaveBeenCalled();
  });

  it("hydrates progress and theme when a session exists", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchProgress.mockResolvedValue({ xp: 42 });
    getMyProfile.mockResolvedValue({ theme: "canopy" });

    render(<RootComponent />);

    await waitFor(() => expect(hydrate).toHaveBeenCalledWith({ xp: 42 }));
    await waitFor(() => expect(hydrateFromServer).toHaveBeenCalledWith("canopy"));
    expect(reset).not.toHaveBeenCalled();
  });

  it("passes null rather than undefined when the profile has no theme", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchProgress.mockResolvedValue({ xp: 0 });
    getMyProfile.mockResolvedValue(null);

    render(<RootComponent />);

    await waitFor(() => expect(hydrateFromServer).toHaveBeenCalledWith(null));
  });

  it("swallows a failed progress fetch instead of crashing the app shell", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchProgress.mockRejectedValue(new Error("offline"));

    render(<RootComponent />);

    await waitFor(() => expect(fetchProgress).toHaveBeenCalled());
    expect(hydrate).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("unsubscribes from auth changes on unmount", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const { unmount } = render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("resets on SIGNED_OUT and invalidates the router", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string) => void;

    reset.mockClear();
    invalidate.mockClear();
    handler("SIGNED_OUT");

    expect(invalidate).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("refetches on SIGNED_IN rather than resetting", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchProgress.mockResolvedValue({ xp: 1 });
    getMyProfile.mockResolvedValue({ theme: "meadow" });
    render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string) => void;

    reset.mockClear();
    handler("SIGNED_IN");

    expect(invalidateQueries).toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("ignores auth events it does not care about", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string) => void;

    invalidate.mockClear();
    reset.mockClear();
    handler("TOKEN_REFRESHED");

    expect(invalidate).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });
});
