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
const clearQueries = vi.fn();
const queryClient = {
  invalidateQueries,
  clear: clearQueries,
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
// AttributionBridge shares the auth mock but has its own test (components/AttributionBridge.test.tsx);
// here it would add a second subscription and break the AuthSync call-count assertions.
vi.mock("../components/AttributionBridge", () => ({ AttributionBridge: () => null }));

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, onAuthStateChange } },
}));

const fetchProgress = vi.fn();
vi.mock("../lib/sync.functions", () => ({
  fetchProgress: (...args: unknown[]) => fetchProgress(...args),
}));
const getMyProfile = vi.fn();
vi.mock("../lib/leaderboard.functions", () => ({ getMyProfile: () => getMyProfile() }));

const hydrate = vi.fn();
const reset = vi.fn();
// The account's remembered course (lib/progress.ts adoptUser); the real store's own tests are progress-course.test.ts.
const progressState = { hydrate, reset, adoptUser: vi.fn((_id: string) => "en"), course: "en" };
vi.mock("../lib/progress", () => ({
  useProgress: Object.assign((sel: (s: unknown) => unknown) => sel(progressState), {
    getState: () => progressState,
  }),
}));
const hydrateFromServer = vi.fn();
vi.mock("../lib/theme", async (importOriginal) => ({
  // The real boot script: the shell tests below run the shipped string.
  THEME_BOOT_SCRIPT: (await importOriginal<typeof import("../lib/theme")>()).THEME_BOOT_SCRIPT,
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
      title: "Learn with Alphonso — English, French and Spanish, one lesson at a time",
    });
    expect(meta.find((m) => "name" in m && m.name === "description")).toBeTruthy();
  });

  it("links the app stylesheet and the web manifest", () => {
    const links = head.links;
    expect(links.find((l) => l.rel === "stylesheet" && l.href === "/styles.css")).toBeTruthy();
    expect(links).toContainEqual({ rel: "manifest", href: "/site.webmanifest" });
  });

  it("loads nothing from another origin: fonts come from this site", () => {
    // A stylesheet, preconnect or preload on a third-party host sends each visitor's IP address there.
    const external = head.links.filter((l) => /^(https?:)?\/\//.test(String(l.href)));
    expect(external).toEqual([]);
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
    document.documentElement.removeAttribute("data-palette");
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    new Function(script)();
    return document.documentElement.dataset.palette;
  }

  it("is actually present in the shell", () => {
    expect(script).toContain("localStorage");
  });

  it("sets the page language and a theme-colour for light and dark", () => {
    expect(markup).toContain('<html lang="en">');
    expect(markup).toContain(
      'name="theme-color" content="#FBF6EC" media="(prefers-color-scheme: light)"',
    );
    expect(markup).toContain(
      'name="theme-color" content="#0E1330" media="(prefers-color-scheme: dark)"',
    );
  });

  // Night: Royal follows the device's dark mode, Meadow never does (owner: "Meadow stays light, even in dark mode").
  function runDark(stored: string | null, dark: boolean | "throws" | "absent") {
    document.documentElement.removeAttribute("data-palette");
    document.documentElement.removeAttribute("data-ds-mode");
    if (stored === null) localStorage.removeItem("theme");
    else localStorage.setItem("theme", stored);
    const original = window.matchMedia;
    if (dark === "absent") {
      Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
    } else {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: (q: string) => {
          if (dark === "throws") throw new Error("blocked");
          return { matches: q.includes("prefers-color-scheme: dark") ? dark : false };
        },
      });
    }
    try {
      new Function(script)();
    } finally {
      Object.defineProperty(window, "matchMedia", { value: original, configurable: true });
    }
    return [document.documentElement.dataset.palette, document.documentElement.dataset.dsMode];
  }

  it("paints Royal night when the device is dark", () => {
    expect(runDark("royal", true)).toEqual(["royal", "night"]);
    expect(runDark(null, true)).toEqual(["royal", "night"]);
    expect(runDark("studio-ink", true)).toEqual(["royal", "night"]);
  });

  it("keeps Royal light when the device is light", () => {
    expect(runDark("royal", false)).toEqual(["royal", undefined]);
  });

  it("keeps Meadow light even when the device is dark", () => {
    expect(runDark("meadow", true)).toEqual(["meadow", undefined]);
  });

  it("still paints the palette when the browser cannot say whether it is dark", () => {
    expect(runDark("meadow", "throws")).toEqual(["meadow", undefined]);
    expect(runDark("royal", "throws")).toEqual(["royal", undefined]);
    expect(runDark("royal", "absent")).toEqual(["royal", undefined]);
  });

  it("defaults a brand-new visitor to royal", () => {
    expect(runWith(null)).toBe("royal");
  });

  it("applies meadow from localStorage", () => {
    expect(runWith("meadow")).toBe("meadow");
  });

  it("applies royal from localStorage", () => {
    expect(runWith("royal")).toBe("royal");
  });

  it.each(["studio-ink", "manuscript", "canopy", "not-a-theme"])(
    "paints royal for the stored value %s",
    (theme) => {
      expect(runWith(theme)).toBe("royal");
    },
  );

  it("survives localStorage throwing (private mode / blocked cookies)", () => {
    document.documentElement.removeAttribute("data-palette");
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => new Function(script)()).not.toThrow();
    expect(document.documentElement.dataset.palette).toBe("royal");
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
    clearQueries.mockReset();
    unsubscribe.mockReset();
    progressState.course = "en";
    progressState.adoptUser.mockReset().mockImplementation(() => progressState.course);
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
    getMyProfile.mockResolvedValue({ theme: "royal" });

    render(<RootComponent />);

    await waitFor(() => expect(hydrate).toHaveBeenCalledWith({ xp: 42 }));
    await waitFor(() => expect(hydrateFromServer).toHaveBeenCalledWith("royal"));
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

  it("forgets the signed-out account's cached voice choices on SIGNED_OUT", async () => {
    localStorage.setItem("alphonso.voicePrefs.v1", '{"hector":{"es":"aura-2-celeste-es"}}');
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string) => void;
    handler("SIGNED_OUT");
    expect(localStorage.getItem("alphonso.voicePrefs.v1")).toBeNull();
  });

  it("refetches on SIGNED_IN for a new account rather than resetting", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    fetchProgress.mockResolvedValue({ xp: 1 });
    getMyProfile.mockResolvedValue({ theme: "meadow" });
    render(<RootComponent />);
    await waitFor(() => expect(reset).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (
      e: string,
      s: { user: { id: string } } | null,
    ) => void;

    reset.mockClear();
    getSession.mockResolvedValue({ data: { session: { user: { id: "u2" } } } });
    handler("SIGNED_IN", { user: { id: "u2" } });

    expect(invalidate).toHaveBeenCalled();
    expect(invalidateQueries).toHaveBeenCalled();
    await waitFor(() => expect(hydrate).toHaveBeenCalledWith({ xp: 1 }));
    expect(reset).not.toHaveBeenCalled();
  });

  it("asks the server for the account's remembered course, not the default", async () => {
    progressState.adoptUser.mockImplementation(() => {
      progressState.course = "fr";
      return "fr";
    });
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchProgress.mockResolvedValue({ xp: 7 });
    getMyProfile.mockResolvedValue(null);
    render(<RootComponent />);
    await waitFor(() => expect(hydrate).toHaveBeenCalledWith({ xp: 7 }));
    expect(progressState.adoptUser).toHaveBeenCalledWith("u1", null);
    expect(fetchProgress).toHaveBeenCalledWith({ data: { course: "fr" } });
  });

  it("offers the account's profile course as the fallback for a new device", async () => {
    getSession.mockResolvedValue({
      data: {
        session: { user: { id: "u1", user_metadata: { learner_profile: { course: "es" } } } },
      },
    });
    fetchProgress.mockResolvedValue({ xp: 1 });
    getMyProfile.mockResolvedValue(null);
    render(<RootComponent />);
    await waitFor(() => expect(progressState.adoptUser).toHaveBeenCalledWith("u1", "es"));
  });

  it("does not hydrate a stale course's numbers over a switch made while they loaded", async () => {
    let resolve!: (v: unknown) => void;
    fetchProgress.mockReturnValue(new Promise((r) => (resolve = r)));
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    render(<RootComponent />);
    await waitFor(() => expect(fetchProgress).toHaveBeenCalled());
    progressState.course = "es"; // the learner switched course meanwhile
    resolve({ xp: 3 });
    await new Promise((r) => setTimeout(r, 0));
    expect(hydrate).not.toHaveBeenCalled();
  });

  it("ignores the SIGNED_IN supabase re-emits for the same account when a hidden tab comes back", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    fetchProgress.mockResolvedValue({ xp: 1 });
    getMyProfile.mockResolvedValue(null);
    render(<RootComponent />);
    await waitFor(() => expect(hydrate).toHaveBeenCalledTimes(1));
    const handler = onAuthStateChange.mock.calls[0]![0] as (
      e: string,
      s: { user: { id: string } } | null,
    ) => void;

    invalidate.mockClear();
    handler("SIGNED_IN", { user: { id: "u1" } });
    await new Promise((r) => setTimeout(r, 0));

    expect(invalidate).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("clears the query cache and the first-run draft on SIGNED_OUT (a shared browser)", async () => {
    localStorage.setItem("lwa.firstRun.v1", '{"name":"Sam"}');
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string) => void;
    handler("SIGNED_OUT");
    expect(clearQueries).toHaveBeenCalled();
    expect(localStorage.getItem("lwa.firstRun.v1")).toBeNull();
  });

  it("keeps the first-run draft when the sign-out was a stale session dropped on the sign-in page", async () => {
    localStorage.setItem("lwa.firstRun.v1", '{"name":"Sam"}');
    getSession.mockResolvedValue({ data: { session: null } });
    render(<RootComponent />);
    await waitFor(() => expect(onAuthStateChange).toHaveBeenCalled());
    const handler = onAuthStateChange.mock.calls[0]![0] as (e: string) => void;
    const { markStaleSessionDrop } = await import("@/lib/auth-offline");
    markStaleSessionDrop();
    handler("SIGNED_OUT");
    // The last account's data still goes; the draft is the person signing up now.
    expect(clearQueries).toHaveBeenCalled();
    expect(localStorage.getItem("lwa.firstRun.v1")).toBe('{"name":"Sam"}');
    // Only that one sign-out: the next one clears it again.
    handler("SIGNED_OUT");
    expect(localStorage.getItem("lwa.firstRun.v1")).toBeNull();
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
