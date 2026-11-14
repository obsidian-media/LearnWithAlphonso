import { createRootRoute, Outlet, HeadContent, Scripts, useLocation } from "@tanstack/react-router";
import { adminWhoAmI } from "@/lib/admin.functions";
import { ConsoleNav } from "@/components/staff/ConsoleNav";
import { NAV_ITEMS } from "@/lib/staff-nav";
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
  // Who is signed in and what they may use, for the navigation. A signed-out visitor (or anyone who is not staff)
  // gets null and sees no navigation; the pages themselves are gated by their own server calls.
  loader: async () => {
    try {
      return { me: await adminWhoAmI() };
    } catch {
      return { me: null };
    }
  },
  component: RootDocument,
});

function RootDocument() {
  const { me } = Route.useLoaderData();
  const { pathname } = useLocation();
  const current = NAV_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))?.key;
  return (
    // The palette is set statically (Royal), unlike the learner app which reads a stored preference before
    // first paint. There is no theme picker here and no reason for one.
    <html lang="en" data-palette="royal">
      <head>
        <HeadContent />
      </head>
      <body className="bg-surface text-ink font-sans">
        {me ? <ConsoleNav scopes={me.scopes} role={me.role} current={current} /> : null}
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
