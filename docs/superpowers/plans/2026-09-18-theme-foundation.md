# Theme Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick between two visual themes ("Meadow", the current
default, and "Studio Ink", a new nocturnal editorial theme), with the
choice persisted locally and to their account, and the underlying tokens
structured so a future iOS app can consume the same values.

**Architecture:** A second CSS custom-property block keyed on
`[data-theme="studio-ink"]` overrides the token set every real component
already consumes (`--color-surface`, `--color-ink`, `--color-moss`, etc. --
NOT the separate, mostly-unused shadcn `:root`/`.dark` set). A small
Zustand store (`useTheme`) applies `data-theme` to `<html>`, mirrors the
choice to `localStorage` for instant reload, and syncs it to the user's
`profiles` row so it follows them across devices. An inline script in
`RootShell` applies the stored theme before first paint to avoid a flash.
Studio Ink's raw values are duplicated into a plain JSON file so a future
Swift client has a CSS-free source of truth.

**Tech Stack:** React 19, TanStack Start/Router, Tailwind CSS v4 (CSS
custom properties via `@theme`), Zustand, Supabase (Postgres +
`createServerFn`), Vitest (Node environment, no DOM), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-18-theme-foundation-design.md`

## Global Constraints

- Every existing screen keeps its current markup under both themes in this
  phase -- no component's JSX changes, only which token values it resolves
  to. Card-free bespoke layouts are a later, separate phase.
- The token set to override is `--color-surface`, `--color-parchment`,
  `--color-ink`, `--color-ink-soft`, `--color-moss`, `--color-moss-deep`,
  `--color-ember`, `--color-ember-soft`, `--color-hairline`,
  `--font-display`, `--font-sans` (defined in `src/styles.css` lines 7-18)
  -- this is the token set real components consume, not the shadcn
  `:root`/`.dark` block.
- Studio Ink fonts are **Instrument Serif** (display) and **Instrument
  Sans** (body/UI) -- both Google Fonts-hosted, loaded via `<link>` exactly
  like the existing Fraunces/Geist setup. No self-hosted font files.
- No new test infrastructure: Vitest stays Node-only (no jsdom/RTL added);
  Playwright coverage is limited to public (non-`_authenticated`) routes.
- No visual regression tooling is introduced.

---

### Task 1: Add `theme` column to `profiles`

**Files:**
- Create: `supabase/migrations/20260918130000_add_profile_theme.sql`
- Modify: `src/integrations/supabase/types.ts:206-235` (the `profiles` table's `Row`/`Insert`/`Update` types)

**Interfaces:**
- Produces: a `theme` column on `profiles`, default `'meadow'`, constrained to `'meadow' | 'studio-ink'`. `Database["public"]["Tables"]["profiles"]["Row"]["theme"]: string` (later tasks' `getMyProfile()` calls return this field since the handler already does `select("*")`).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260918130000_add_profile_theme.sql
alter table profiles
  add column theme text not null default 'meadow'
  check (theme in ('meadow', 'studio-ink'));
```

- [ ] **Step 2: Hand-update the generated types file**

In `src/integrations/supabase/types.ts`, inside the `profiles` table
definition (around line 206), add `theme` to all three shapes:

```ts
      profiles: {
        Row: {
          active_language: string;
          avatar_seed: string;
          country: string | null;
          created_at: string;
          display_name: string;
          id: string;
          theme: string;
          updated_at: string;
        };
        Insert: {
          active_language?: string;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name: string;
          id: string;
          theme?: string;
          updated_at?: string;
        };
        Update: {
          active_language?: string;
          avatar_seed?: string;
          country?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          theme?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] **Step 3: Verify the project still typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors (this step only changes a type shape that's a superset of before -- nothing currently reads `profiles.theme`, so nothing can be newly wrong yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260918130000_add_profile_theme.sql src/integrations/supabase/types.ts
git commit -m "feat(db): add theme column to profiles"
```

---

### Task 2: Theme resolution pure logic

**Files:**
- Create: `src/lib/theme.ts`
- Test: `src/lib/theme.test.ts`

**Interfaces:**
- Produces: `THEME_NAMES: readonly ["meadow", "studio-ink"]`, `type ThemeName = "meadow" | "studio-ink"`, `isThemeName(value: unknown): value is ThemeName`, `resolveInitialTheme(localStorageValue: unknown, serverValue: unknown): ThemeName`.
- Consumes: nothing (pure, no imports beyond nothing).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/theme.test.ts
import { describe, expect, it } from "vitest";
import { isThemeName, resolveInitialTheme, THEME_NAMES } from "./theme";

describe("isThemeName", () => {
  it("accepts every value in THEME_NAMES", () => {
    for (const name of THEME_NAMES) {
      expect(isThemeName(name)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isThemeName("solarized")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isThemeName(null)).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
    expect(isThemeName(42)).toBe(false);
  });
});

describe("resolveInitialTheme", () => {
  it("prefers a valid server value over localStorage", () => {
    expect(resolveInitialTheme("meadow", "studio-ink")).toBe("studio-ink");
  });

  it("falls back to localStorage when the server value is invalid", () => {
    expect(resolveInitialTheme("studio-ink", null)).toBe("studio-ink");
    expect(resolveInitialTheme("studio-ink", "not-a-theme")).toBe("studio-ink");
  });

  it("falls back to the meadow default when both are invalid or missing", () => {
    expect(resolveInitialTheme(null, null)).toBe("meadow");
    expect(resolveInitialTheme("garbage", undefined)).toBe("meadow");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: FAIL -- `./theme` has no exported members (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/theme.ts
export const THEME_NAMES = ["meadow", "studio-ink"] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as readonly string[]).includes(value);
}

/**
 * Server value wins when present and valid; otherwise fall back to
 * localStorage; otherwise the default. Pure so it's testable without a
 * DOM or a real localStorage.
 */
export function resolveInitialTheme(localStorageValue: unknown, serverValue: unknown): ThemeName {
  if (isThemeName(serverValue)) return serverValue;
  if (isThemeName(localStorageValue)) return localStorageValue;
  return "meadow";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat: add pure theme-resolution logic"
```

---

### Task 3: Theme store + profile sync

**Files:**
- Modify: `src/lib/theme.ts` (append the store to the file created in Task 2)
- Modify: `src/lib/leaderboard.functions.ts:40-54` (`updateProfile`'s schema)

**Interfaces:**
- Consumes: `resolveInitialTheme`, `isThemeName`, `ThemeName` from Task 2 (same file). `updateProfile` from `./leaderboard.functions` (existing `createServerFn`).
- Produces: `useTheme` Zustand hook with shape `{ theme: ThemeName; hydrated: boolean; setTheme: (theme: ThemeName) => void; hydrateFromServer: (serverValue: unknown) => void }`. `updateProfile`'s accepted input gains an optional `theme: ThemeName`.

- [ ] **Step 1: Extend `updateProfile`'s schema**

In `src/lib/leaderboard.functions.ts`, change:

```ts
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(40).optional(),
        country: z.string().max(2).optional().nullable(),
      })
      .parse(d),
  )
```

to:

```ts
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        display_name: z.string().min(1).max(40).optional(),
        country: z.string().max(2).optional().nullable(),
        theme: z.enum(["meadow", "studio-ink"]).optional(),
      })
      .parse(d),
  )
```

- [ ] **Step 2: Verify existing callers still typecheck**

Run: `npx tsc --noEmit`
Expected: no errors -- `theme` is optional, so `profile.tsx`'s existing `updateProfile({ data: { display_name, country } })` call remains valid.

- [ ] **Step 3: Append the store to `src/lib/theme.ts`**

```ts
import { create } from "zustand";
import { updateProfile } from "./leaderboard.functions";

type ThemeState = {
  theme: ThemeName;
  hydrated: boolean;
  setTheme: (theme: ThemeName) => void;
  hydrateFromServer: (serverValue: unknown) => void;
};

function readLocalTheme(): string | null {
  try {
    return localStorage.getItem("theme");
  } catch {
    return null;
  }
}

function writeLocalTheme(theme: ThemeName) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* ignore (e.g. private browsing storage denial) */
  }
}

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: resolveInitialTheme(typeof window === "undefined" ? null : readLocalTheme(), null),
  hydrated: false,
  setTheme: (theme) => {
    if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
    writeLocalTheme(theme);
    set({ theme });
    void updateProfile({ data: { theme } });
  },
  hydrateFromServer: (serverValue) => {
    const resolved = resolveInitialTheme(readLocalTheme(), serverValue);
    if (resolved !== get().theme) {
      document.documentElement.dataset.theme = resolved;
      writeLocalTheme(resolved);
    }
    set({ theme: resolved, hydrated: true });
  },
}));
```

Note the `typeof window === "undefined"` guard on the store's initial
state: this file is imported by server-rendered route modules (TanStack
Start renders on the server first), where `localStorage` doesn't exist.
`setTheme`/`hydrateFromServer` are only ever called from client-side event
handlers/effects, so they don't need the guard, but `document.documentElement`
in `setTheme` is guarded anyway for the same reason (a stray server-side
call must not throw).

- [ ] **Step 4: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/leaderboard.functions.ts
git commit -m "feat: add theme store with localStorage + profile sync"
```

---

### Task 4: Studio Ink tokens, fonts, and iOS token export

**Files:**
- Modify: `src/styles.css`
- Create: `src/design-tokens/studio-ink.json`

**Interfaces:**
- Consumes: nothing new.
- Produces: `[data-theme="studio-ink"]` CSS block; `src/design-tokens/studio-ink.json` (no code consumes this yet -- it's the iOS hand-off artifact described in the spec).

- [ ] **Step 1: Remove the dead shadcn `.dark` block and add Studio Ink's overrides**

In `src/styles.css`, delete the entire `.dark { ... }` block (current lines
155-188) -- it's disconnected boilerplate nothing in the app triggers or
reads meaningfully today. Immediately after the existing `:root { ... }`
block (which ends around line 153), add:

```css
[data-theme="studio-ink"] {
  --font-display: "Instrument Serif", ui-serif, Georgia, serif;
  --font-sans: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;

  --color-surface: oklch(0.16 0.01 260);
  --color-parchment: oklch(0.2 0.012 260);
  --color-ink: oklch(0.96 0.01 80);
  --color-ink-soft: oklch(0.72 0.015 80);
  --color-moss: oklch(0.55 0.18 250);
  --color-moss-deep: oklch(0.4 0.16 250);
  --color-ember: oklch(0.55 0.18 250);
  --color-ember-soft: oklch(0.3 0.1 250);
  --color-hairline: oklch(1 0 0 / 0.1);

  --background: var(--color-surface);
  --foreground: var(--color-ink);
  --primary: var(--color-moss);
  --primary-foreground: oklch(0.98 0.01 80);
  --muted-foreground: var(--color-ink-soft);
  --input: var(--color-hairline);
}
```

- [ ] **Step 2: Add the Studio Ink font `<link>`**

This step is verified together with Task 5's root wiring (the `<link>` is
added to the same `head()` array touched there) -- see Task 5, Step 1.

- [ ] **Step 3: Write the iOS-portable token file**

```json
// src/design-tokens/studio-ink.json
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

- [ ] **Step 4: Manually verify the CSS parses**

Run: `npx vite build --mode development`
Expected: build succeeds (Tailwind v4's `@theme`/custom-property parsing would fail the build on malformed CSS).

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/design-tokens/studio-ink.json
git commit -m "feat: add Studio Ink theme tokens and iOS token export"
```

---

### Task 5: Wire theme into the app shell

**Files:**
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: `useTheme` from `../lib/theme` (Task 3). `getMyProfile` from `../lib/leaderboard.functions` (existing).
- Produces: `<html data-theme="...">` set before first paint; `AuthSync` calls `useTheme.getState().hydrateFromServer(profile?.theme)` once the profile loads.

- [ ] **Step 1: Add the Studio Ink font `<link>` and the anti-FOUC inline script**

In `src/routes/__root.tsx`, add to the `links` array (alongside the
existing Fraunces/Geist stylesheet link):

```ts
{
  rel: "stylesheet",
  href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500;600;700&display=swap",
},
```

In `RootShell`, add an inline script as the very first child of `<head>`
(before `<HeadContent />`), so it runs before the stylesheet paints:

```tsx
function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          // Runs before first paint to avoid a flash of the wrong theme.
          // Kept inline (not an external file) so it blocks nothing.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="studio-ink")document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {/* ...unchanged... */}
      </body>
    </html>
  );
}
```

(Only `"studio-ink"` needs an explicit check -- `"meadow"` is the
CSS default when `data-theme` is absent, so there's nothing to set for it.)

- [ ] **Step 2: Wire server hydration into `AuthSync`**

In `__root.tsx`'s `AuthSync` function, import `useTheme` and
`getMyProfile`, and call `hydrateFromServer` once the profile resolves:

```tsx
import { useTheme } from "../lib/theme";
import { getMyProfile } from "../lib/leaderboard.functions";

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
```

- [ ] **Step 3: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual smoke check**

Run: `bun run dev`, open `http://localhost:8080`, open devtools console and run `localStorage.setItem("theme", "studio-ink")`, reload.
Expected: page background/text/fonts switch to Studio Ink's graphite/bone-white/Instrument Serif on reload, with no visible flash of the Meadow theme first.

- [ ] **Step 5: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat: apply theme on load and sync from profile on sign-in"
```

---

### Task 6: Public-route e2e coverage

**Files:**
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: the `data-theme` mechanism from Tasks 4-5. No app code changes.

- [ ] **Step 1: Write the e2e tests**

Append to `e2e/smoke.spec.ts`:

```ts
test("defaults to the meadow theme with no stored preference", async ({ page }) => {
  await page.goto("/");
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(theme).toBeUndefined();
});

test("applies the studio-ink theme from localStorage before first paint", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "studio-ink");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "studio-ink");
  const fontDisplay = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-display"),
  );
  expect(fontDisplay).toContain("Instrument Serif");
});
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test e2e/smoke.spec.ts -g "theme"`
Expected: PASS (2 tests)

- [ ] **Step 3: Commit**

```bash
git add e2e/smoke.spec.ts
git commit -m "test: cover theme default and localStorage application"
```

---

### Task 7: Profile page theme picker

**Files:**
- Modify: `src/routes/_authenticated/profile.tsx`

**Interfaces:**
- Consumes: `useTheme` from `../../lib/theme` (Task 3), `SegmentedControl` from `../../components/SegmentedControl` (existing, unmodified).

- [ ] **Step 1: Add the theme control to `ProfilePage`**

In `src/routes/_authenticated/profile.tsx`, import `useTheme` and
`SegmentedControl`:

```tsx
import { useTheme } from "../../lib/theme";
import { SegmentedControl } from "../../components/SegmentedControl";
```

Inside `ProfilePage`, add:

```tsx
const theme = useTheme((s) => s.theme);
const setTheme = useTheme((s) => s.setTheme);
```

And in the JSX, immediately before the `<h2>Account</h2>` section, add:

```tsx
<h2 className="mt-8 font-display text-[18px] font-semibold text-ink">Theme</h2>
<div className="mt-3 rounded-2xl border border-hairline bg-surface p-4">
  <SegmentedControl
    ariaLabel="Choose a theme"
    value={theme}
    onChange={setTheme}
    options={[
      { value: "meadow", label: "Meadow" },
      { value: "studio-ink", label: "Studio Ink" },
    ]}
  />
</div>
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors (`SegmentedControl<T extends string>`'s generic infers `T = ThemeName` from `value`/`options`, matching `onChange: (v: ThemeName) => void` against `setTheme`).

- [ ] **Step 3: Manual smoke check**

Run: `bun run dev`, sign in, go to `/profile`, click "Studio Ink" in the new control.
Expected: the whole app immediately re-themes; reloading the page keeps Studio Ink active (localStorage); signing out and back in on a different browser profile with the same account also shows Studio Ink (Supabase sync) -- this last part needs a real signed-in session so isn't automatable in this repo's current e2e setup, per the spec's Testing section.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_authenticated/profile.tsx
git commit -m "feat: add theme picker to the profile page"
```
