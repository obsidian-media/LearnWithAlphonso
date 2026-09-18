# Design: Theme Foundation (Phase 1 of user-selectable themes)

> Written 2026-09-18. This is Phase 1 of a two-phase project: this phase
> builds the theme token system, the theme-switcher mechanism, persistence,
> and settings UI. Phase 2 (a separate spec/plan per screen) will
> bespoke-redesign each screen's layout to be genuinely card-free under the
> new theme -- that work is out of scope here and intentionally deferred so
> it can be reviewed and shipped incrementally, one screen at a time.

## Why

The app currently ships a single visual theme ("Meadow" -- warm parchment
background, moss/ember accents, Fraunces + Geist type, defined in
`src/styles.css`). The product wants users to be able to choose between
multiple themes, starting with a second theme ("Studio Ink" -- a nocturnal,
high-contrast editorial theme built around Instrument Serif + Switzer) and
expanding later. The mechanism must also be portable to the native iOS app
that's planned (see `docs/superpowers/specs/2026-09-17-native-ios-app-design.md`),
so the source of truth for a theme's values can't live only as CSS.

## Non-goals

- Redesigning any individual screen's layout or dropping "card" styling
  from existing components. Every screen keeps its current markup under
  both themes in this phase -- Studio Ink applies its palette/type to the
  existing card-based layouts as-is. Card-free bespoke layouts are Phase 2,
  screen by screen.
- A theme picker/marketplace UI beyond a simple two-option control on the
  Profile page.
- Visual regression testing infrastructure (none exists in this repo today;
  not worth introducing before Phase 2 redesigns make existing screenshots
  stale anyway).

## Token architecture

**Correction found while writing the implementation plan:** `styles.css`
actually defines *two* separate, mostly-unrelated token systems, and only
one of them is real. The first `@theme` block (lines 7-18) defines
`--color-surface`, `--color-parchment`, `--color-ink`, `--color-ink-soft`,
`--color-moss`, `--color-moss-deep`, `--color-ember`, `--color-ember-soft`,
`--color-hairline`, `--font-display`, `--font-sans` -- and a grep across
`src/` confirms these (`bg-surface`, `bg-parchment`, `text-ink`,
`border-hairline`, etc.) are what 20 of the app's real component/route
files actually use. The second block -- the shadcn-style `@theme inline` +
`:root`/`.dark` (`--background`, `--foreground`, `--primary`, `--card`,
etc.) -- is only consumed in two places, both in `__root.tsx`
(`NotFoundComponent`/`ErrorComponent`), and is otherwise scaffold
boilerplate nothing else reads. The original draft of this section
targeted the wrong (shadcn) token set. Corrected below.

A second theme is added by redefining the **first** (real) token set under
a `[data-theme="studio-ink"]` selector, plus the handful of shadcn tokens
that `__root.tsx` needs so the 404/error pages aren't left in Theme 1's
colors:

```css
[data-theme="studio-ink"] {
  --font-display: "Instrument Serif", ui-serif, Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;

  --color-surface: oklch(0.16 0.01 260);        /* graphite, not pure black */
  --color-parchment: oklch(0.2 0.012 260);      /* secondary surface, one step up from background */
  --color-ink: oklch(0.96 0.01 80);             /* warm bone white */
  --color-ink-soft: oklch(0.72 0.015 80);
  --color-moss: oklch(0.55 0.18 250);           /* cobalt accent -- reuses the "moss" slot (primary accent) */
  --color-moss-deep: oklch(0.4 0.16 250);
  --color-ember: oklch(0.55 0.18 250);          /* Studio Ink uses one accent, not two -- ember reuses moss's cobalt rather than introducing a second hue */
  --color-ember-soft: oklch(0.3 0.1 250);
  --color-hairline: oklch(1 0 0 / 0.1);

  /* shadcn tokens __root.tsx's 404/error pages read directly */
  --background: var(--color-surface);
  --foreground: var(--color-ink);
  --primary: var(--color-moss);
  --primary-foreground: oklch(0.98 0.01 80);
  --muted-foreground: var(--color-ink-soft);
  --input: var(--color-hairline);
}
```

Reusing the existing variable *names* (`--color-moss`, `--color-ember`)
for Studio Ink's completely different hues looks odd in isolation, but
renaming them would mean touching all 20 consuming files just to relabel,
not re-theme -- out of scope for Phase 1. A future cleanup could rename
`moss`/`ember` to theme-neutral names like `accent-primary`/`accent-secondary`
across the codebase, but that's a refactor independent of shipping a second
theme and isn't required for this phase to work correctly.

`destructive`/`destructive-foreground`, the `chart-*` series, and the
`sidebar-*` series (shadcn set) are intentionally left undefined here and
fall through to Theme 1's `:root` values via the cascade (same
specificity; a property not redeclared in a later rule keeps the earlier
rule's value) -- none of those surfaces are used by any real component
today.

`data-theme` is set on `<html>` (in `RootShell`, `src/routes/__root.tsx`),
not on `<body>`, so it's available before hydration and covers the whole
document including anything portaled to `document.body`.

The existing `.dark` block (lines 155-188) is disconnected leftover shadcn
boilerplate -- it doesn't share Theme 1's palette and nothing in the app
currently triggers the `.dark` class. It gets deleted as part of this work;
`@custom-variant dark` and any `dark:` utility usage should be audited and
removed or migrated to theme-based selectors if any exist (grep found none
using it meaningfully as of this writing).

**Correction found while writing the implementation plan:** Switzer is a
Fontshare-only font with no Google Fonts CDN listing, and self-hosting it
means downloading its `.woff2` binaries -- something no tool available in
this session/session-type can fetch (binary font assets, not text/markdown).
Rather than leave a plan task no one can execute, the sans pairing is
**Instrument Sans** instead -- same foundry and type family as Instrument
Serif (they're designed as a pair), equally distinctive versus
Inter/Roboto-generic defaults, and Google Fonts-hosted, so it loads exactly
the way Fraunces/Geist already do today: a `<link>` tag, no binary assets
to manage. Both fonts are added to `__root.tsx`'s `links` array alongside
the existing Fraunces/Geist `<link>`.

## iOS portability

Studio Ink's raw values (not the CSS custom properties, which are
web-only) are also written to `src/design-tokens/studio-ink.json`:

```json
{
  "name": "studio-ink",
  "colors": {
    "background": "#1b1d22",
    "foreground": "#f4f1ea",
    "primary": "#3c6ff0",
    "muted": "#33363f",
    "border": "#ffffff1a"
  },
  "fonts": { "display": "Instrument Serif", "sans": "Instrument Sans" },
  "radii": { "sm": 4, "md": 8, "lg": 12 }
}
```

Hex values are the sRGB equivalents of the `oklch()` values declared in
`styles.css` above -- Swift/iOS has no native `oklch()` parsing, so this
file trades the wider gamut for a format any platform can consume
directly, keeping the two files as the same design in two encodings. It's
hand-kept in sync with `styles.css` for Phase 1 (small, stable token set);
if theme count grows, generating one from the other becomes worth it, but
that's premature for two themes.

## Theme store

New file `src/lib/theme.ts`, following the existing `useProgress` store's
shape and conventions (`src/lib/progress.ts`):

```ts
export const THEME_NAMES = ["meadow", "studio-ink"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

// Server value wins when present and valid; otherwise fall back to
// whatever's in localStorage; otherwise the default. Pure function so it's
// unit-testable without a DOM or a browser's localStorage.
export function resolveInitialTheme(
  localStorageValue: unknown,
  serverValue: unknown,
): ThemeName {
  if (isThemeName(serverValue)) return serverValue;
  if (isThemeName(localStorageValue)) return localStorageValue;
  return "meadow";
}

type ThemeState = {
  theme: ThemeName;
  hydrated: boolean;
  setTheme: (theme: ThemeName) => void;
  hydrateFromServer: (serverValue: unknown) => void;
};

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: resolveInitialTheme(
    typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null,
    null,
  ),
  hydrated: false,
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    set({ theme });
    void updateProfile({ data: { theme } }); // fire-and-forget; profile.tsx already does this for name/country
  },
  hydrateFromServer: (serverValue) => {
    const resolved = resolveInitialTheme(localStorage.getItem("theme"), serverValue);
    if (resolved !== get().theme) {
      document.documentElement.dataset.theme = resolved;
      localStorage.setItem("theme", resolved);
    }
    set({ theme: resolved, hydrated: true });
  },
}));
```

**Load sequence** (avoids flash of wrong theme):
1. A tiny inline `<script>` in `RootShell`, before any stylesheet,
   reads `localStorage.theme` and sets `document.documentElement.dataset.theme`
   synchronously -- same technique already required for any localStorage-driven
   theme to avoid FOUC, since React hydration happens after first paint.
2. `useTheme`'s initial state also reads localStorage, so client and
   server-rendered markup agree once React takes over (the store's initial
   value must match what the inline script already applied, or React will
   flag a hydration mismatch -- both read the same `localStorage.theme` key
   via the same validation function to guarantee this).
3. `AuthSync` (`__root.tsx`) already fetches the user's profile-adjacent
   data on session resolution; it's extended to also call
   `useTheme.getState().hydrateFromServer(profile.theme)` once
   `getMyProfile()` resolves. Supabase wins over localStorage on conflict
   (e.g. user picked a theme on another device) but only after it loads --
   never causes a flash, only a possible one-time correction post-load.

## Data model

One migration, following the existing migration naming convention in
`supabase/migrations/`:

```sql
alter table profiles
  add column theme text not null default 'meadow'
  check (theme in ('meadow', 'studio-ink'));
```

`updateProfile`'s Zod schema (`src/lib/leaderboard.functions.ts`) gains:

```ts
theme: z.enum(["meadow", "studio-ink"]).optional(),
```

`getMyProfile`'s return type gains `theme: string` (already a passthrough
select, per the existing handler).

## Settings UI

Profile page (`src/routes/_authenticated/profile.tsx`) gets a "Theme"
section using the existing `SegmentedControl` component (already used
elsewhere in the app, so no new picker pattern is introduced) with two
options, "Meadow" and "Studio Ink". Selecting an option calls
`useTheme().setTheme(...)` directly -- no separate "Save" step, consistent
with how instant-apply settings typically behave, and distinct from the
existing name/country fields which do have an explicit Save button (those
stay as-is; only the new theme control is instant-apply).

## Error handling

- `updateProfile`'s fire-and-forget call in `setTheme` can fail silently
  (network error, logged out) -- the local theme still applies immediately
  via `data-theme` + localStorage regardless of server sync success. A
  failed sync just means the choice won't follow to another device until
  the next successful `setTheme` call; this is an acceptable, low-stakes
  failure mode (matches the pattern `updateProfile` already uses for
  `display_name`/`country`, which also don't surface sync errors to the
  user today).
- An unknown/invalid `theme` value from localStorage or the server (e.g.
  a theme that's since been removed) falls back to `"meadow"` rather than
  throwing.

## Testing

**Correction found while writing the implementation plan:** the Profile
page is behind `_authenticated`, and `playwright.config.ts`'s own header
comment states authenticated routes have no e2e coverage today (no seeded
test account exists yet -- a known, pre-existing gap, not something this
phase needs to fix). There's also no jsdom/React Testing Library in this
repo (`vitest.config.ts` runs plain Node, per the existing
`progress-math.test.ts`-style pure-function tests) -- adding a DOM test
environment just for this feature would be new test infra, not "using
existing patterns." Testing is corrected to fit what's actually there:

- **Vitest** (`src/lib/theme.ts` + `src/lib/theme.test.ts`): the theme
  store's *decision logic* is written as plain, DOM-free functions --
  `isThemeName(value): value is ThemeName` and
  `resolveInitialTheme(localStorageValue, serverValue): ThemeName` -- and
  those are what's unit tested (unknown/missing/valid values for each
  input independently, and server-vs-local precedence). This mirrors how
  `progress.ts` (the Zustand store, untested directly) relies on
  `progress-math.ts` (pure functions, tested) -- the store itself is thin
  wiring around tested logic, not tested itself.
- **Playwright** (extends existing e2e suite, public routes only): visit
  `/` with no `theme` key in localStorage and assert
  `document.documentElement.dataset.theme` is `"meadow"` (the default);
  separately, set `localStorage.theme = "studio-ink"` before navigation
  (`page.addInitScript`) and assert it's `"studio-ink"` after load and
  that `getComputedStyle(document.documentElement).getPropertyValue("--font-display")`
  contains `"Instrument Serif"`. This exercises the anti-FOUC inline
  script and the CSS token block end-to-end without needing an
  authenticated session -- the actual Profile-page toggle UI itself
  isn't e2e-covered, consistent with every other `_authenticated` screen
  in this repo today.
- No visual regression tooling is introduced (see Non-goals).

## Files touched

- `src/styles.css` -- add `[data-theme="studio-ink"]` token block, remove
  dead `.dark` block, add `@font-face` for self-hosted Switzer
- `src/routes/__root.tsx` -- inline anti-FOUC script, Studio Ink font
  `<link>`/`@font-face` wiring, `AuthSync` extension
- `src/lib/theme.ts` -- new, theme store
- `src/lib/theme.test.ts` -- new
- `src/lib/leaderboard.functions.ts` -- extend `updateProfile` schema and
  `getMyProfile` return type with `theme`
- `src/routes/_authenticated/profile.tsx` -- theme `SegmentedControl`
- `src/design-tokens/studio-ink.json` -- new, iOS-portable token source
- `supabase/migrations/<timestamp>_add_profile_theme.sql` -- new
- `src/integrations/supabase/types.ts` -- hand-add `theme: string` to the
  `profiles` table's `Row`/`Insert`/`Update` types (this repo hand-maintains
  this file alongside migrations rather than generating it from a live
  project; no other migration in `supabase/migrations/` has a matching
  automated regen step either)
