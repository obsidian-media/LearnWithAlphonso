import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { CookieConsent } from "../components/CookieConsent";

import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "../lib/progress";
import { useTheme } from "../lib/theme";
import { fetchProgress } from "../lib/sync.functions";
import { getMyProfile } from "../lib/leaderboard.functions";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Learn with Alphonso — English, one lesson at a time" },
      {
        name: "description",
        content:
          "A calm, gamified way to build real English skills. Bite-size lessons, streaks, and progress that stays with you.",
      },
      { property: "og:title", content: "Learn with Alphonso — English, one lesson at a time" },
      { property: "og:description", content: "A calm, gamified way to build real English skills." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Geist:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400&family=Source+Sans+3:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          // Runs before first paint to avoid a flash of the wrong theme.
          // Kept inline (not an external file) so it blocks nothing.
          dangerouslySetInnerHTML={{
            // "canopy" is the default now (see theme.ts's
            // resolveInitialTheme) -- a visitor with NO stored theme
            // must get the same first-paint result the client store
            // will compute a moment later, or the picker will say
            // Canopy while the page renders Meadow (:root). Only an
            // explicit "meadow" string (or nothing) skips setting
            // data-theme at all, since :root already is Meadow.
            __html: `(function(){try{var t=localStorage.getItem("theme")||"canopy";if(t==="studio-ink"||t==="manuscript"||t==="canopy")document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-surface"
        >
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Makes every framer-motion component in the app respect the OS
          "reduce motion" setting automatically, with no per-component work. */}
      <MotionConfig reducedMotion="user">
        <AuthSync />
        <Outlet />
        <CookieConsent />
      </MotionConfig>
    </QueryClientProvider>
  );
}

function AuthSync() {
  const hydrate = useProgress((s) => s.hydrate);
  const reset = useProgress((s) => s.reset);
  const hydrateTheme = useTheme((s) => s.hydrateFromServer);
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        reset();
        return;
      }
      try {
        const snap = await fetchProgress();
        if (!cancelled) hydrate(snap);
        const profile = await getMyProfile();
        if (!cancelled) hydrateTheme(profile?.theme ?? null);
      } catch {
        /* ignore */
      }
    }
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event === "SIGNED_OUT") {
        reset();
      } else {
        qc.invalidateQueries();
        void load();
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [hydrate, reset, hydrateTheme, router, qc]);
  return null;
}
