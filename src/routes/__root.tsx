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
import { ReferralCapture } from "../components/ReferralBridge";
import { SHARE_IMAGE, SHARE_IMAGE_ALT, THEME_COLOR_LIGHT, THEME_COLOR_NIGHT } from "../lib/seo";
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
import { browserFirstRunStore } from "../lib/first-run";
import { takeStaleSessionDrop } from "../lib/auth-offline";

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
        <meta
          name="theme-color"
          content={THEME_COLOR_LIGHT}
          media="(prefers-color-scheme: light)"
        />
        <meta name="theme-color" content={THEME_COLOR_NIGHT} media="(prefers-color-scheme: dark)" />
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
        <ReferralCapture />
        <Outlet />
        <CookieConsent />
      </MotionConfig>
    </QueryClientProvider>
  );
}

function AuthSync() {
  const hydrate = useProgress((s) => s.hydrate);
  const reset = useProgress((s) => s.reset);
  const adoptUser = useProgress((s) => s.adoptUser);
  const hydrateTheme = useTheme((s) => s.hydrateFromServer);
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    // The account the app last loaded for. supabase-js emits SIGNED_IN again whenever a hidden tab becomes visible;
    // for the same account that is not a sign-in, and reloading on it threw away whatever the learner was doing.
    let currentUserId: string | null | undefined;
    async function load() {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const user = data.session?.user;
      if (!user) {
        currentUserId = null;
        reset();
        return;
      }
      currentUserId = user.id;
      // The account's own course (remembered in this browser), not the server's default of English.
      const course = adoptUser(user.id);
      try {
        const snap = await fetchProgress({ data: { course } });
        // A course switch while this was in flight has already loaded its own numbers.
        if (!cancelled && useProgress.getState().course === course) hydrate(snap);
        const profile = await getMyProfile();
        if (!cancelled) hydrateTheme(profile?.theme ?? null);
      } catch {
        /* ignore */
      }
    }
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_IN") {
        const id = session?.user?.id;
        if (id && id === currentUserId) return;
        if (id) currentUserId = id;
      }
      router.invalidate();
      if (event === "SIGNED_OUT") {
        currentUserId = null;
        reset();
        // Nothing the last account loaded may show to the next one on this browser (a shared computer).
        qc.clear();
        // A stale session dropped on the sign-in page keeps the draft: it belongs to the person signing up now.
        if (!takeStaleSessionDrop()) browserFirstRunStore().clearDraft();
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
  }, [hydrate, reset, adoptUser, hydrateTheme, router, qc]);
  return null;
}
