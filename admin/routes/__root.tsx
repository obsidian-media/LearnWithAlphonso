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
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { CONSOLE_THEME_BOOT_SCRIPT } from "@/lib/console-theme";
import { NAV_ITEMS } from "@/lib/staff-nav";
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
  // Who is signed in and what they may use, for the rail, and the rail's pips (real counts, only the ones this
  // person's scopes allow). A signed-out visitor (or anyone who is not staff) gets null and sees no rail; the pages
  // themselves are gated by their own server calls. A pip count that cannot be read shows no pip, never a 0.
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      const counts: NavCounts | null = await staffNavCounts().catch(() => null);
      return { me, counts };
    } catch {
      return { me: null, counts: null };
    }
  },
  component: RootDocument,
});

function RootDocument() {
  const { me, counts } = Route.useLoaderData();
  const { pathname } = useLocation();
  const nonce = useRouter().options?.ssr?.nonce;
  const current =
    pathname === "/"
      ? "home"
      : NAV_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))?.key;
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
        {me ? (
          <ConsoleShell
            me={me}
            counts={counts}
            current={current}
            onSignOut={() =>
              void signOutAndLeave(supabase.auth, (path) => window.location.assign(path))
            }
          >
            <Outlet />
          </ConsoleShell>
        ) : (
          <Outlet />
        )}
        <Scripts />
      </body>
    </html>
  );
}
