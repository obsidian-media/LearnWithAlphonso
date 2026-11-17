import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { track } from "../lib/analytics";
import {
  Outlet,
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
import { AttributionBridge } from "../components/AttributionBridge";
import { SHARE_IMAGE, SHARE_IMAGE_ALT } from "../lib/seo";
import { StatusPage } from "../components/StatusPage";
import { dsButtonClass } from "../components/ds/buttons";
import { SuspendedScreen } from "../components/SuspendedScreen";
import { useAccountStatus } from "../lib/account-suspended";

import { supabase } from "@/integrations/supabase/client";
import { useProgress } from "../lib/progress";
import { THEME_BOOT_SCRIPT, useTheme } from "../lib/theme";
import { fetchProgress } from "../lib/sync.functions";
import { getMyProfile } from "../lib/leaderboard.functions";
import { clearCachedVoicePrefs } from "../lib/voice-prefs";

function NotFoundComponent() {
  return (
    <StatusPage
      kind="not-found"
      image="/mascots/alphonso-explaining-pointer.webp"
      code="404"
      title="Page not found"
      body="The page you're looking for doesn't exist or has been moved."
    />
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <StatusPage
      kind="error"
      image="/mascots/alphonso-sleepy-night.webp"
      title="This page didn't load"
      body="Something went wrong on our end. You can try refreshing or head back home."
    >
      <button
        type="button"
        onClick={() => {
          router.invalidate();
          reset();
        }}
        className={dsButtonClass("primary")}
      >
        Try again
      </button>
    </StatusPage>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Learn with Alphonso — English, French and Spanish, one lesson at a time" },
      {
        name: "description",
        content:
          "A calm, gamified way to build real English, French or Spanish skills. Bite-size lessons, streaks, and progress that stays with you.",
      },
      {
        property: "og:title",
        content: "Learn with Alphonso — English, French and Spanish, one lesson at a time",
      },
      {
        property: "og:description",
        content: "A calm, gamified way to build real English, French or Spanish skills.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Learn With Alphonso" },
      { property: "og:image", content: SHARE_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: SHARE_IMAGE_ALT },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: SHARE_IMAGE },
    ],
    links: [
      // Fonts are bundled into the app stylesheet (src/styles.css), so no request leaves this site for them.
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
  const nonce = useRouter().options?.ssr?.nonce;
  return (
    <html lang="en">
      <head>
        {/* The theme (src/lib/theme.ts), set before first paint so the page never flashes the wrong one. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {/* Royal light and Royal night page backgrounds (--c-surface); the browser picks by the OS setting.
            Written here, not in head(): the head merges meta tags of the same name into one. */}
        <meta name="theme-color" content="#FBF6EC" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0E1330" media="(prefers-color-scheme: dark)" />
        <HeadContent />
      </head>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ds-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ds-card"
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
  const suspended = useAccountStatus((s) => s.suspended);
  useEffect(() => {
    void track("app_open");
  }, []);

  // A suspended account sees one plain screen instead of the app, whatever page it was on.
  if (suspended) return <SuspendedScreen />;

  return (
    <QueryClientProvider client={queryClient}>
      {/* Makes every framer-motion component in the app respect the OS
          "reduce motion" setting automatically, with no per-component work. */}
      <MotionConfig reducedMotion="user">
        <AuthSync />
        <AttributionBridge />
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
        // Voice choices are the account's; the next account on this browser starts from its own.
        clearCachedVoicePrefs();
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
