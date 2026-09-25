import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
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

function RootDocument() {
  return (
    // data-theme is set statically, unlike the learner app which reads a
    // stored preference before first paint. `:root` in styles.css is
    // Meadow; Canopy's token values live under [data-theme="canopy"], so
    // without this attribute the admin app would silently render in the
    // wrong palette while claiming to follow the Canopy constraint.
    // There is no theme picker here and no reason for one.
    <html lang="en" data-theme="canopy">
      <head>
        <HeadContent />
      </head>
      <body className="bg-surface text-ink font-sans">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
