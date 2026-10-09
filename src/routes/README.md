# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## What lives here

- `_authenticated/` holds the signed-in pages (learn, lesson, review, profile, league, converse, campaign, friends, listen and so on); the layout route there redirects signed-out visitors.
- `api/` holds server routes, not pages: the AI endpoints (`chat`, `tts`, `stt`, `hector-respond`, `define-word`, `generate-practice`, `grade-translation`, `analyze-weaknesses`), `learning-goal`, `account-export`, `account-delete`, `apple-link`, `review-demo-code`, and `internal/` (called only by the database, for example `report-notify`). Every AI route runs auth, then the account's AI consent, then quota, in that order.
- The public legal pages are `terms.tsx`, `privacy.tsx`, `cookies.tsx`, `support.tsx` and `accessibility.tsx`. They must render their full text in the server response (a plain GET with no JavaScript is what App Review and crawlers see); `legal-content.test.tsx` and `scripts/check-legal-live.ts` enforce it.
- Tests sit beside the route they cover (`*.test.ts`/`*.test.tsx`).
