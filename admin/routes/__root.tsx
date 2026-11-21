import {
  createRootRoute,
  Outlet,
  HeadContent,
  Scripts,
  useLocation,
  useRouter,
} from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { staffNavCounts, type NavCounts } from "@/lib/staff-home.functions";
import { ClientLinks } from "@/components/console/ClientLinks";
import { ConsoleFrame, type ConsoleIdentity } from "@/components/console/ConsoleFrame";
import { CONSOLE_THEME_BOOT_SCRIPT } from "@/lib/console-theme";
import { signOutAndLeave } from "@/lib/staff-signout";
import { supabase } from "@/integrations/supabase/client";
// The learner root imports the stylesheet the same way -- as a URL
// registered in head.links, not as a side-effect import. There is no
// src/index.css in this repo.
import appCss from "@/styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: appCss }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Alphonso Admin" },
      // Keeps the admin app out of search results. Not a security
      // control -- the allowlist is -- but an admin login page in a
      // search index invites traffic that has no business here.
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RootDocument,
});

/**
 * Who is signed in, for the rail: read in the browser, where the session lives (a server render has no bearer token, so
 * a root loader could never know). adminWhoAmI throws for anyone who is not active staff; the rail's pips are real
 * counts and a pip that cannot be read shows nothing.
 */
async function loadIdentity(): Promise<ConsoleIdentity> {
  const me = await adminWhoAmI();
  const counts: NavCounts | null = await staffNavCounts().catch(() => null);
  return { me, counts };
}

function subscribeAuth(onChange: (event: "in" | "out") => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") onChange("in");
    else if (event === "SIGNED_OUT") onChange("out");
  });
  return () => data.subscription.unsubscribe();
}

function RootDocument() {
  const { pathname } = useLocation();
  const router = useRouter();
  const nonce = router.options?.ssr?.nonce;
  return (
    // Royal light by default; the console's day/night choice (src/lib/console-theme.ts) is applied before first paint by
    // the inline script below, which adds data-ds-mode="night" for the app's Royal Night tokens. The fonts are the
    // design system's Bricolage Grotesque (display) and Figtree (body), set on <html> so every utility follows.
    <html
      lang="en"
      data-palette="royal"
      suppressHydrationWarning
      style={
        {
          "--font-display": "var(--ds-font-display)",
          "--font-sans": "var(--ds-font-body)",
        } as React.CSSProperties
      }
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: CONSOLE_THEME_BOOT_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="bg-ds-surface text-ds-ink font-sans">
        <ClientLinks navigate={(href) => router.history.push(href)}>
          <ConsoleFrame
            pathname={pathname}
            loadIdentity={loadIdentity}
            subscribeAuth={subscribeAuth}
            onSignOut={() =>
              void signOutAndLeave(supabase.auth, (path) => window.location.assign(path))
            }
          >
            <Outlet />
          </ConsoleFrame>
        </ClientLinks>
        <Scripts />
      </body>
    </html>
  );
}
