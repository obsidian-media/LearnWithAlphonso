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
  --font-sans: "Switzer", ui-sans-serif, system-ui, sans-serif;

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

Studio Ink's font imports (Instrument Serif, Switzer) are added to
`__root.tsx`'s `links` array alongside the existing Google Fonts
`<link>` for Fraunces/Geist. Switzer isn't on Google Fonts (it's a
Fontshare font) -- it will be self-hosted: `.woff2` files checked into
`public/fonts/switzer/` and referenced via `@font-face` in `styles.css`,
per Fontshare's free license terms.

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
  "fonts": { "display": "Instrument Serif", "sans": "Switzer" },
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
export type ThemeName = "meadow" | "studio-ink";

type ThemeState = {
  theme: ThemeName;
  hydrated: boolean;
  setTheme: (theme: ThemeName) => void;
  hydrateFromServer: (theme: ThemeName | null) => void;
};

export const useTheme = create<ThemeState>()((set) => ({
  theme: readLocalTheme(), // localStorage, falls back to "meadow"
  hydrated: false,
  setTheme: (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
    set({ theme });
    void updateProfile({ data: { theme } }); // fire-and-forget; profile.tsx already does this for name/country
  },
  hydrateFromServer: (theme) => {
    if (theme && theme !== useTheme.getState().theme) {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("theme", theme);
    }
    set({ theme: theme ?? useTheme.getState().theme, hydrated: true });
  },
}));
```

`readLocalTheme()` reads `localStorage.getItem("theme")`, validates it's a
known `ThemeName`, defaults to `"meadow"` otherwise (covers first visit,
corrupted storage, and old values from a removed theme).

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

- **Vitest** (`src/lib/theme.test.ts`): `readLocalTheme` fallback behavior
  (missing key, invalid value, valid value); `setTheme` writes
  `data-theme` + localStorage; `hydrateFromServer` only overrides when
  the server value differs and is valid.
- **Playwright** (extends existing e2e suite): visit Profile, toggle the
  theme control, assert `document.documentElement.dataset.theme` updates
  and a Studio Ink-only CSS custom property (e.g. `--font-display`)
  resolves to `"Instrument Serif"` via `getComputedStyle`.
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
- `public/fonts/switzer/*.woff2` -- new, self-hosted font files
- `supabase/migrations/<timestamp>_add_profile_theme.sql` -- new
