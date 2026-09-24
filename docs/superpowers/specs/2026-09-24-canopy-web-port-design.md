# Canopy for web — design + implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the Tasks section below task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Combined spec+plan (not two documents) — scope was already substantially fixed by the account owner's own brief plus verification done while writing this; see "Background" for what was given vs. decided here.

**Goal:** Port Canopy (iOS's 4th theme) to web: real oklch tokens, Baloo 2 font, theme-picker option, and a genuine mascot-forward redesign of the two lesson/review players (not just a retint) — landing before the English Phase 2 branch's listening-question insertion into the same two files.

**Spec this ports from:** `docs/superpowers/specs/2026-09-23-ios-canopy-theme-redesign-design.md`

## Background

- Account owner's ask (verbatim, abbreviated): port Canopy to web, sequenced to merge before English Phase 2's listening-question branch (which touches the same two files, `lesson.$id.tsx`/`review.tsx`, via a small ~16-line diff each — confirmed by reading branch `worktree-english-content-phase2`, commits `c33b916`/`4a6510b`). Treat both players as one unit — `review.tsx` duplicates `lesson.$id.tsx`'s rendering (confirmed by reading both in full).
- **Default-parity decision, settled with the account owner before writing this**: web's `resolveInitialTheme` fallback changes from `"meadow"` to `"canopy"`, matching iOS's already-shipped default. iOS's decision stands; this is not revisited.
- Palette source of truth: `ios/LearnWithAlphonso/Sources/DesignSystem/AlphonsoTheme.swift:155` (unchanged since PR #83 merged — confirmed by reading it fresh in this worktree, and `docs/BACKLOG.md` §0.7 confirms Canopy's real-device QA pass is still open/pending, so no palette changes have landed from that yet — sync again before deep visual polish if that changes).
- Already true on `main` (confirmed by reading, not assumed): `leaderboard.functions.ts:47`'s Zod enum accepts `"canopy"`; the Postgres CHECK constraint includes it; `THEME_NAMES` excludes it, asserted by two tests in `theme.test.ts`.
- `eslint .` is usable again (`.claude/worktrees/**` now ignored, confirmed in `main`'s current `eslint.config.js`).

## Derived color tokens

The account owner gave sRGB hex (iOS's source of truth) and asked for oklch derived, not eyeballed. Rather than reverse the exact hex (lossy — hex has already been rounded once), I used the **original oklch inputs** the iOS port was computed forward from (I authored that port) and **re-verified them forward** in this session with a fresh script, confirming an exact match to every one of the 8 given hex values with zero gamut clipping:

| Token | oklch | sRGB hex (verified match) |
|---|---|---|
| `surface` | `oklch(0.975 0.014 165)` | `#EFFAF4` |
| `parchment` | `oklch(0.945 0.028 165)` | `#DCF3E8` |
| `ink` | `oklch(0.24 0.045 165)` | `#05261A` |
| `ink-soft` | `oklch(0.46 0.045 165)` | `#406052` |
| `moss` | `oklch(0.46 0.10 160)` | `#0C6944` |
| `moss-deep` | `oklch(0.33 0.06 160)` | `#133F2B` |
| `ember` | `oklch(0.64 0.18 32)` | `#E4573F` |
| `ember-soft` | `oklch(0.90 0.05 32)` | `#FDD3CA` |
| `hairline` | `ink @ 10%` | — |
| `destructive` | shared, unchanged | `oklch(0.577 0.245 27.325)` (already in `:root`) |

## A second contrast bug, found while reading the codebase (not eyeballed either)

The iOS port needed a fix mid-implementation last time for `text-*-on-ember` contrast (bright coral fill + light text failing WCAG). The same defect exists on web, and it's **wider** here: `grep -rn "bg-ember" src --include="*.tsx"` finds ~15 files pairing `bg-ember` with hardcoded `text-surface` (white-on-coral). For the three existing themes this renders fine (their `ember` is dark/medium — Meadow's own burnt orange, or literally `= moss` for Studio Ink/Manuscript). For Canopy's bright coral, `text-surface` on `bg-ember` computes to ~2.7:1, the same failure the iOS spec rejected.

Web has no `onAccent`-equivalent token today (button text is hardcoded per call site, not resolved through a semantic layer the way iOS's `AlphonsoColor` is). Rather than leave this broken for every `bg-ember` button once Canopy ships, or invent a Canopy-only special case, this plan adds one new semantic color — `--color-ink-on-ember`, wired through `@theme` exactly like `--color-ember` etc. — equal to `--color-surface` for Meadow/Studio Ink/Manuscript (preserving their exact current rendering) and `--color-ink` for Canopy (fixing it), then sweeps every `bg-ember` + `text-surface` pairing in the codebase to use `text-ink-on-ember` instead. This mirrors the iOS `onAccent` fix exactly, done completely (grep-swept) rather than partially — the iOS final review's own recommendation after finding the partial-application gap there.

**The moss/gradient case does not need an equivalent new token.** Checked directly: web's existing `--primary-foreground` (the moss-fill text color) is *already* a fixed light value for all three existing themes — never `= surface` the way iOS's original `onPrimary` was, so web never had iOS's dark-theme trap (iOS's Studio Ink `onPrimary = surface` is dark, which is wrong against its medium-blue moss; web's `primary-foreground` is light unconditionally, which is right against every theme's moss, Canopy's dark emerald included — verified: light text lands at 4.27–7.98:1 against Studio Ink's own moss/moss-deep, the exact pair iOS got wrong). Canopy's `primary-foreground` follows the same "light, unconditional" convention — no new token, no divergent case.

**One pre-existing bug found, explicitly out of scope, logged instead of fixed**: `bg-moss text-surface` (the lesson-finish and review-empty checkmark circles, `lesson.$id.tsx:676`, `review.tsx:351`) hardcodes `text-surface` directly rather than going through `--primary-foreground` — for Studio Ink, whose `surface` is dark, this is the same dark-on-medium-blue failure, and it predates this branch entirely (unrelated to Canopy). Per the same non-goal that governed the iOS port (don't touch the existing three themes' own rendering unless this branch's own new code is what's broken), this is not fixed here — logged to `docs/BACKLOG.md` instead (Task 10).

## Mascot-forward, not decoration

Web has never had Alphonso/Hector art anywhere (`find public src -iname "*alphonso*" -o -iname "*hector*"` returns nothing) — the portraits exist only in `ios/.../Assets.xcassets/`. Per the account owner's instruction to look at how iOS actually used the mascot art before deciding web can skip it: iOS used it in exactly two structural moments relevant to these two files — a wrong-answer helper (`AlphonsoTipCard`, shown only on incorrect answers) and a lesson-finish celebration (`FinishView`'s banner). Both have a direct, already-duplicated web equivalent:

- **`AnswerFeedback.tsx`** — shared by both players (its own doc comment says so). Wrong-answer state gets Alphonso's portrait; correct-answer state is unchanged. One component edit fixes both players at once, matching "treat both as one unit."
- **A new shared `MascotBanner` component** (`src/components/MascotBanner.tsx`) — portrait + message on a `moss`→`moss-deep` gradient, mirroring iOS's `AlphonsoMascotBanner` for visual consistency between platforms. Used in `lesson.$id.tsx`'s `FinishScreen` (lesson complete) and `review.tsx`'s `Empty` component *only* for the "Review complete" state — not "Nothing due today", which stays a routine informational empty state (mirrors the iOS spec's own restraint principle: mascot banners are for genuine celebration/greeting moments, not blanket-applied to every empty state).

Not gated behind `theme === "canopy"` — added unconditionally, same as iOS (`AlphonsoMascotBanner` isn't theme-conditional there either). Every web theme gets mascot presence for the first time; Canopy is the reason, not a special case.

Images: copy the already-compressed `Alphonso.png`/`Hector.png` straight from `ios/.../Assets.xcassets/*.imageset/` into `public/mascots/` — no new art, matching the iOS spec's own non-goal.

## Global Constraints

- Meadow/Studio Ink/Manuscript's own rendered output must not change — every task touching a shared file must leave their existing behavior byte-equivalent (the `--color-ink-on-ember` backfill and the unconditional `MascotBanner` additions are the two exceptions explicitly designed to be safe: the former is provably identical for the three existing themes, the latter is new UI, not a retint).
- No `if (theme === "canopy")` branches anywhere — component adoption, not theme-conditional branching (matches the iOS plan's same rule, and matches this codebase's own existing `isStudioInk` pattern being a *structural* fork, not a Canopy-specific one).
- Real TDD applies here — unlike the iOS work, this is a normal Vite/Vitest/RTL web app with a working local test command. No "no compiler available" exception.
- English Phase 2 (branch `worktree-english-content-phase2`) is actively waiting on this branch merging first — don't let this branch sit once started.

## Review Focus

- **A user with `localStorage.theme === "canopy"` reloading the page** must not flash Meadow before first paint — the inline flash-prevention script in `__root.tsx` only checks `studio-ink`/`manuscript` today; must add `canopy`.
- **Every existing `bg-ember` + `text-surface` call site**, not just the two named files — the grep sweep must be complete, and each swapped site must still render identically for the three existing themes (their `--color-ink-on-ember` equals their `--color-surface`).
- **The "Nothing due today" empty state must NOT get the mascot banner** — only "Review complete" — a task that adds the banner to `Empty` must gate it by which title is passed, not add it unconditionally to the whole component.
- **Existing `isStudioInk` structural branches in both player files must keep working unmodified** — Canopy must render via the *default* (non-Studio-Ink) branch automatically; no task should need to touch that conditional's logic, only confirm it.
- **Two large, independently-testable, currently-passing test files exist for these exact components** (`AnswerFeedback.test.tsx`, `AnswerOption.test.tsx`) — any task touching `AnswerFeedback.tsx` must keep its 4 existing tests green, not just add new ones.

---

## Task 1: Canopy CSS tokens + design-tokens JSON

**Files:**
- Modify: `src/styles.css`
- Create: `src/design-tokens/canopy.json`

**Interfaces:**
- Produces: `[data-theme="canopy"]` CSS block; `document.documentElement.dataset.theme = "canopy"` (set by `theme.ts`, unchanged mechanism) activates it.

- [ ] **Step 1: Add the Canopy CSS block**

After the `[data-theme="manuscript"]` block (line 197), add:

```css
[data-theme="canopy"] {
  --font-display: "Baloo 2", ui-rounded, "Segoe UI", sans-serif;
  --font-sans: "Geist", ui-sans-serif, system-ui, sans-serif;

  --color-surface: oklch(0.975 0.014 165);
  --color-parchment: oklch(0.945 0.028 165);
  --color-ink: oklch(0.24 0.045 165);
  --color-ink-soft: oklch(0.46 0.045 165);
  --color-moss: oklch(0.46 0.10 160);
  --color-moss-deep: oklch(0.33 0.06 160);
  --color-ember: oklch(0.64 0.18 32);
  --color-ember-soft: oklch(0.90 0.05 32);
  --color-hairline: oklch(0.24 0.045 165 / 0.1);
  --color-ink-on-ember: var(--color-ink);

  --background: var(--color-surface);
  --foreground: var(--color-ink);
  --primary: var(--color-moss);
  --primary-foreground: oklch(0.975 0.014 165);
  --muted-foreground: var(--color-ink-soft);
  --input: var(--color-hairline);
}
```

(`--font-display` falls back through `ui-rounded` before the generic sans stack — Baloo 2 is a rounded display face, closer in spirit to `ui-rounded` than to serif/plain-sans fallbacks. `--color-ink-on-ember` here is the Canopy-specific override; Step 2 adds the token itself plus the other three themes' identity-preserving values.)

- [ ] **Step 2: Add `--color-ink-on-ember` to the base `@theme` block and backfill the two existing per-theme blocks**

In the base `@theme { ... }` block (top of file, after `--color-hairline: oklch(0.24 0.035 155 / 0.1);` at line 18):

```css
  --color-ink-on-ember: var(--color-surface);
```

(This is Meadow's — the `:root`-level default — identity-preserving: `--color-ink-on-ember` resolves to the same thing `--color-surface` already does for Meadow, since Meadow has no per-theme override block of its own, same pattern as every other `--color-*` token here.)

In `[data-theme="studio-ink"]` (after its own `--color-hairline` line):

```css
  --color-ink-on-ember: var(--color-surface);
```

In `[data-theme="manuscript"]` (same position):

```css
  --color-ink-on-ember: var(--color-surface);
```

- [ ] **Step 3: Create `src/design-tokens/canopy.json`**

Matching `studio-ink.json`/`manuscript.json`'s exact shape:

```json
{
  "name": "canopy",
  "colors": {
    "background": "#EFFAF4",
    "foreground": "#05261A",
    "primary": "#0C6944",
    "muted": "#DCF3E8",
    "border": "#05261A1a"
  },
  "fonts": { "display": "Baloo 2", "sans": "Geist" },
  "radii": { "sm": 4, "md": 8, "lg": 12 }
}
```

(`border` follows the existing files' own convention of an 8-digit hex with a trailing alpha suffix — `1a` = ~10%, matching `--color-hairline`'s 10% opacity and Studio Ink's own `#ffffff1a`/Manuscript's `#25242b1f`.)

- [ ] **Step 4: Verify no build-time CSS error**

```bash
bun run build 2>&1 | tail -30
```

Expected: build succeeds (Tailwind v4 parses the new `oklch()` values and the new `--color-ink-on-ember` token without error — a malformed value here fails the whole build, so this is a real, meaningful check even though it's not a unit test).

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/design-tokens/canopy.json
git commit -m "feat: add Canopy CSS theme tokens and design-tokens JSON"
```

---

## Task 2: `theme.ts` — add canopy, flip the default, update tests (TDD)

**Files:**
- Modify: `src/lib/theme.ts`
- Modify: `src/lib/theme.test.ts`

**Interfaces:**
- Produces: `THEME_NAMES` includes `"canopy"`; `resolveInitialTheme`'s fallback is `"canopy"`, not `"meadow"`.

- [ ] **Step 1: Update the tests first (RED)**

In `theme.test.ts`, the `"falls back to the meadow default..."` test and the whole `"canopy (iOS-only theme)"` describe block need to change to match the new, decided behavior — this is a deliberate behavior change, not a bug, so update the tests to state the new intent before making it pass:

```typescript
  it("falls back to the canopy default when both are invalid or missing", () => {
    expect(resolveInitialTheme(null, null)).toBe("canopy");
    expect(resolveInitialTheme("garbage", undefined)).toBe("canopy");
  });
```

(replaces the old `"falls back to the meadow default..."` test — same two assertions, new expected value, renamed to state the new behavior truthfully). Replace the `"canopy (iOS-only theme)"` describe block:

```typescript
describe("canopy", () => {
  it("is a valid web theme name", () => {
    expect(isThemeName("canopy")).toBe(true);
  });

  it("is preferred over localStorage when the server reports it", () => {
    expect(resolveInitialTheme("meadow", "canopy")).toBe("canopy");
  });

  it("is used as localStorage's fallback when the server value is invalid", () => {
    expect(resolveInitialTheme("canopy", null)).toBe("canopy");
  });
});
```

- [ ] **Step 2: Run the tests, confirm RED for the right reason**

```bash
bun run test src/lib/theme.test.ts
```

Expected: FAIL — `isThemeName("canopy")` still returns `false` (canopy isn't in `THEME_NAMES` yet) and `resolveInitialTheme(null, null)` still returns `"meadow"`. Confirms the tests fail because the feature is missing, not because of a typo.

- [ ] **Step 3: Implement (GREEN)**

```typescript
export const THEME_NAMES = ["meadow", "studio-ink", "manuscript", "canopy"] as const;
```

```typescript
export function resolveInitialTheme(localStorageValue: unknown, serverValue: unknown): ThemeName {
  if (isThemeName(serverValue)) return serverValue;
  if (isThemeName(localStorageValue)) return localStorageValue;
  return "canopy";
}
```

- [ ] **Step 4: Run the tests again, confirm GREEN**

```bash
bun run test src/lib/theme.test.ts
```

Expected: all tests pass, including the modified/new ones above.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat: add canopy to THEME_NAMES, make it the default theme"
```

---

## Task 3: `__root.tsx` — flash-prevention script + Baloo 2 font

**Files:**
- Modify: `src/routes/__root.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: Baloo 2 loaded and available for `--font-display: "Baloo 2", ...` (Task 1) to actually resolve.

- [ ] **Step 1: Add `canopy` to the inline flash-prevention script**

Current (line 139):

```javascript
(function(){try{var t=localStorage.getItem("theme");if(t==="studio-ink"||t==="manuscript")document.documentElement.dataset.theme=t;}catch(e){}})();
```

Replace with:

```javascript
(function(){try{var t=localStorage.getItem("theme");if(t==="studio-ink"||t==="manuscript"||t==="canopy")document.documentElement.dataset.theme=t;}catch(e){}})();
```

(The `meadow` case still needs no entry — the CSS `:root` block already is Meadow, so no `data-theme` attribute at all correctly renders Meadow, same as before this change. Canopy is now the *default* fallback inside `resolveInitialTheme`, but this inline script runs before any JS store hydration — it only prevents a flash for a user who already has an explicit `"canopy"` string in `localStorage` from a previous visit, exactly the same job it already does for `studio-ink`/`manuscript`.)

- [ ] **Step 2: Add the Baloo 2 font stylesheet link**

After the Newsreader/Source Sans 3 `<link>` (line 112-113), add:

```typescript
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700;800&display=swap",
      },
```

(Baloo 2 has no optical-size axis — matches the iOS port's own finding via `fontTools` inspection — so this is a plain `wght` list, same pattern as the existing `Geist:wght@400;500;600;700` link, not the `opsz,wght` range syntax Fraunces/Newsreader use.)

- [ ] **Step 3: Verify the build**

```bash
bun run build 2>&1 | tail -20
```

Expected: succeeds (this task only adds a `<link>` and a string-comparison branch, both low-risk, but a broken `head()` config can fail the build — worth the real check).

- [ ] **Step 4: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat: load Baloo 2 and recognize canopy in the flash-prevention script"
```

---

## Task 4: `--color-ink-on-ember` sweep — fix Canopy's bright-coral contrast everywhere

**Files:**
- Modify: every file `grep -rln "bg-ember" src --include="*.tsx"` finds paired with `text-surface` in the same className (confirmed list as of this plan's writing — re-run the grep at execution time in case Phase 2/other branches added more before this merges):
  - `src/routes/auth.tsx`
  - `src/routes/index.tsx`
  - `src/routes/reset-password.tsx`
  - `src/routes/_authenticated/campaign_.$campaignId.tsx`
  - `src/routes/_authenticated/converse_.$scenarioId.tsx`
  - `src/routes/_authenticated/league.tsx`
  - `src/routes/_authenticated/learn.tsx`
  - `src/routes/_authenticated/lesson.$id.tsx`
  - `src/routes/_authenticated/review.tsx`

**Interfaces:**
- Consumes: `--color-ink-on-ember` (Task 1).
- Produces: nothing new consumed by later tasks — this is a leaf sweep.

- [ ] **Step 1: Re-run the discovery grep to get the authoritative, current list**

```bash
grep -rln "bg-ember" src --include="*.tsx" | xargs grep -l "text-surface"
```

Treat this as the real task list — the bullet list above is what it found while writing this plan; if English Phase 2 or anything else added more `bg-ember`/`text-surface` pairs before this task runs, include them too.

- [ ] **Step 2: For each file, replace every `text-surface` that's paired with `bg-ember` in the same className string with `text-ink-on-ember`**

Do **not** touch a `text-surface` that isn't paired with `bg-ember` in that same class string (e.g. `bg-ink text-surface`, `bg-moss text-surface` are correct as-is — `ink`/`moss` are dark or the "light text is always correct" case covered in this plan's Background, only `ember` has the divergent-per-theme problem). Concretely, in `lesson.$id.tsx` this means line 459 (`bg-ember px-4 py-3.5 text-sm font-semibold text-surface`) and line 759 (`bg-ember text-surface`); in `review.tsx` line 333; and the equivalent single `text-surface` occurrence inside each other listed file's own `bg-ember ...` className. Read each file's actual current line before editing — do not pattern-match blindly, since a `text-surface` elsewhere in the same file (not paired with `bg-ember`) must stay untouched.

- [ ] **Step 3: Confirm no `bg-ember` + `text-surface` pairing remains**

```bash
grep -rn "bg-ember" src --include="*.tsx" | grep "text-surface"
```

Expected: no output (empty). Any remaining line is a miss from Step 2, not an intentional exception — this plan found no legitimate reason for `bg-ember` to ever pair with `text-surface`.

- [ ] **Step 4: Run the full test suite**

```bash
bun run test 2>&1 | tail -20
```

Expected: all tests still pass — this is a pure className swap with no behavior change for the three existing themes (their `--color-ink-on-ember` literally equals `--color-surface`), so nothing should break; if something does, the swap touched a file it shouldn't have.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: swap bg-ember/text-surface for text-ink-on-ember (Canopy contrast fix, all 4 themes)"
```

---

## Task 5: Theme picker — add Canopy as a 4th option

**Files:**
- Modify: `src/routes/_authenticated/profile.tsx`
- Modify: `src/routes/_authenticated/profile.test.tsx` (if it asserts the current 3-option list — check and extend, don't just leave it silently under-covering)

**Interfaces:** none new.

- [ ] **Step 1: Read `profile.test.tsx` first**

```bash
grep -n "SegmentedControl\|options\|Meadow\|Studio Ink\|Manuscript" src/routes/_authenticated/profile.test.tsx
```

If it asserts the exact option list or count, that assertion needs updating in this task (Step 3), not left to silently pass on a stale expectation or fail unexpectedly.

- [ ] **Step 2: Add the option**

In `profile.tsx`'s `SegmentedControl` (line 177-181):

```typescript
            options={[
              { value: "meadow", label: "Meadow" },
              { value: "studio-ink", label: "Studio Ink" },
              { value: "manuscript", label: "Manuscript" },
              { value: "canopy", label: "Canopy" },
            ]}
```

- [ ] **Step 3: Update `profile.test.tsx` if needed**

Based on what Step 1 found — add an assertion that "Canopy" is present/selectable, following whatever pattern the existing 3-theme tests there already use (read the surrounding test file for the exact style before writing this, don't guess the API).

- [ ] **Step 4: Run the test file**

```bash
bun run test src/routes/_authenticated/profile.test.tsx
```

Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/routes/_authenticated/profile.tsx src/routes/_authenticated/profile.test.tsx
git commit -m "feat: add Canopy to the web theme picker"
```

---

## Task 6: Mascot assets + shared `MascotBanner` component (TDD)

**Files:**
- Create: `public/mascots/alphonso.png` (copied from `ios/LearnWithAlphonso/Sources/Assets.xcassets/Alphonso.imageset/Alphonso.png`)
- Create: `public/mascots/hector.png` (copied from `ios/LearnWithAlphonso/Sources/Assets.xcassets/Hector.imageset/Hector.png`)
- Create: `src/components/MascotBanner.tsx`
- Create: `src/components/MascotBanner.test.tsx`

**Interfaces:**
- Produces: `<MascotBanner mascot="alphonso" | "hector" message="..." />`, consumed by Task 7 (`AnswerFeedback.tsx`) and Task 8 (`lesson.$id.tsx` + `review.tsx`).

- [ ] **Step 1: Copy the mascot images**

```bash
mkdir -p public/mascots
cp ios/LearnWithAlphonso/Sources/Assets.xcassets/Alphonso.imageset/Alphonso.png public/mascots/alphonso.png
cp ios/LearnWithAlphonso/Sources/Assets.xcassets/Hector.imageset/Hector.png public/mascots/hector.png
ls -la public/mascots/
```

Expected: `alphonso.png` (469,518 bytes) and `hector.png` (752,335 bytes), matching the source files' exact sizes (a mismatch means the copy truncated or picked up the wrong file).

- [ ] **Step 2: Write the failing test**

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MascotBanner } from "./MascotBanner";

describe("MascotBanner", () => {
  it("shows the mascot image and message", () => {
    render(<MascotBanner mascot="alphonso" message="Nice work!" />);
    const img = screen.getByRole("img", { name: /alphonso/i });
    expect(img).toHaveAttribute("src", "/mascots/alphonso.png");
    expect(screen.getByText("Nice work!")).toBeInTheDocument();
  });

  it("uses the hector image when mascot is hector", () => {
    render(<MascotBanner mascot="hector" message="Hi" />);
    expect(screen.getByRole("img", { name: /hector/i })).toHaveAttribute(
      "src",
      "/mascots/hector.png",
    );
  });

  it("gives the image a real accessible name, not decorative alt text", () => {
    render(<MascotBanner mascot="alphonso" message="Streak saved" />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/alphonso/i);
  });
});
```

- [ ] **Step 3: Run it, confirm RED**

```bash
bun run test src/components/MascotBanner.test.tsx
```

Expected: FAIL — `MascotBanner.tsx` doesn't exist yet (module not found).

- [ ] **Step 4: Implement**

```typescript
const MASCOT_SRC = {
  alphonso: "/mascots/alphonso.png",
  hector: "/mascots/hector.png",
} as const;

const MASCOT_NAME = {
  alphonso: "Alphonso",
  hector: "Hector",
} as const;

/**
 * A mascot portrait + a short message on a moss->moss-deep gradient --
 * the web equivalent of iOS's AlphonsoMascotBanner (see
 * docs/superpowers/specs/2026-09-24-canopy-web-port-design.md). Not
 * Canopy-conditional -- every theme's own moss/moss-deep renders here,
 * same as every other moss-colored surface in this app.
 */
export function MascotBanner({
  mascot,
  message,
}: {
  mascot: "alphonso" | "hector";
  message: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-moss to-moss-deep p-4">
      <img
        src={MASCOT_SRC[mascot]}
        alt={MASCOT_NAME[mascot]}
        className="size-13 shrink-0 rounded-xl border-2 border-white/60 object-cover"
      />
      <p className="text-sm font-bold text-primary-foreground">{message}</p>
    </div>
  );
}
```

(`text-primary-foreground` — this plan's Background section already established that token is safely light for every theme's moss/moss-deep, Canopy's included, with no new token needed. `alt={MASCOT_NAME[mascot]}` gives `getByRole("img", { name: ... })` a real accessible name via the image's own alt text — simpler than iOS's separate `accessibilityLabel` combining name+message, appropriate for `<img>`'s own semantics on web, and the adjacent `<p>` already carries the message for sighted and screen-reader users alike via normal document flow.)

- [ ] **Step 5: Run it, confirm GREEN**

```bash
bun run test src/components/MascotBanner.test.tsx
```

Expected: all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/mascots/ src/components/MascotBanner.tsx src/components/MascotBanner.test.tsx
git commit -m "feat: add MascotBanner component and copy mascot art from iOS"
```

---

## Task 7: `AnswerFeedback.tsx` — Alphonso on wrong answers (TDD)

**Files:**
- Modify: `src/components/AnswerFeedback.tsx`
- Modify: `src/components/AnswerFeedback.test.tsx`

**Interfaces:**
- Consumes: `MascotBanner` (Task 6) — but see Step 4: a full banner doesn't fit this component's existing shape, so this task builds a smaller, purpose-specific mascot treatment inline, following the same visual language (portrait + message) rather than reusing the gradient-card component verbatim. Documented as a deliberate deviation, not an oversight.

- [ ] **Step 1: Write the failing tests**

Add to the existing `AnswerFeedback.test.tsx` (keep all 4 existing tests — this only adds new ones):

```typescript
  it("shows Alphonso when the answer is incorrect", () => {
    render(<AnswerFeedback correct={false} headline="Not quite" explanation="e" />);
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });

  it("does not show Alphonso when the answer is correct", () => {
    render(<AnswerFeedback correct headline="Nice!" explanation="e" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run, confirm RED**

```bash
bun run test src/components/AnswerFeedback.test.tsx
```

Expected: the two new tests FAIL (no image rendered at all today); the 4 pre-existing tests still PASS (confirms this task hasn't broken anything yet, before any implementation change).

- [ ] **Step 3: Implement — add Alphonso's portrait to the incorrect-answer branch only**

Current incorrect-answer branch (non-Studio-Ink, lines 36-38 in the file as it exists before this task):

```tsx
      className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
        correct ? "border-moss/40 bg-moss/10 text-ink" : "border-rose-300 bg-rose-50 text-ink"
      }`}
    >
      <p className="font-semibold">{headline}</p>
      <p className="mt-0.5 text-ink-soft">{explanation}</p>
    </div>
```

Replace the whole non-Studio-Ink return with (note the `flex gap-3` wrapper only changes layout when `!correct`, achieved by conditionally rendering the image, not by branching the whole JSX tree):

```tsx
  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        correct ? "border-moss/40 bg-moss/10 text-ink" : "border-rose-300 bg-rose-50 text-ink"
      }`}
    >
      {!correct && (
        <img
          src="/mascots/alphonso.png"
          alt="Alphonso"
          className="size-10 shrink-0 rounded-lg object-cover"
        />
      )}
      <div>
        <p className="font-semibold">{headline}</p>
        <p className="mt-0.5 text-ink-soft">{explanation}</p>
      </div>
    </div>
  );
```

(Do the same `flex gap-3` + conditional `<img>` wrap for the Studio Ink branch too — Studio Ink is one of the four themes this component renders for, and the spec's "mascot-forward, not gated to Canopy" rule applies to it exactly as much as the default branch. Studio Ink's current markup: `<div role="status" aria-live="polite" className="mt-5 border-l-[3px] py-2 pl-4 text-sm ${...}"><p className="font-semibold text-ink">{headline}</p>...` — wrap the two `<p>`s in a `<div>` and add the same conditional `<img>` before it, keeping the `border-l-[3px]` treatment on the outer element.)

**This deliberately does not reuse `MascotBanner`** — that component is a moss-gradient hero card sized for a standalone celebration moment; `AnswerFeedback` is an inline, compact, two-color-state (moss/rose) status strip that already has its own established visual language across both players and the placement test's shared usage. Reusing `MascotBanner` verbatim here would mean either losing the correct/incorrect color distinction or building a second variant of it — a small inline portrait matching this component's own existing card shape is the more honest fit. Both draw from the same asset (`/mascots/alphonso.png`) and both are visually "Alphonso speaking," so the mascot-forward intent is preserved even though the markup isn't shared.

- [ ] **Step 4: Run, confirm GREEN, all 6 tests**

```bash
bun run test src/components/AnswerFeedback.test.tsx
```

Expected: all 6 tests pass (4 original + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/AnswerFeedback.tsx src/components/AnswerFeedback.test.tsx
git commit -m "feat: AnswerFeedback shows Alphonso on wrong answers (both players)"
```

---

## Task 8: `lesson.$id.tsx` FinishScreen + `review.tsx` Empty — celebration banners (TDD)

**Files:**
- Modify: `src/routes/_authenticated/lesson.$id.tsx`
- Modify: `src/routes/_authenticated/review.tsx`
- Create/modify: `src/routes/_authenticated/lesson.$id.test.tsx` (check if one exists first — the earlier `git diff --stat` against the Phase 2 branch showed one being *added* there; if it doesn't exist on this branch yet, create it minimally for this task's assertion, don't attempt a full route test harness beyond what's needed)
- Create/modify: `src/routes/_authenticated/review.test.tsx` (same check)

**Interfaces:**
- Consumes: `MascotBanner` (Task 6).

- [ ] **Step 1: Check for existing route test files and their harness pattern**

```bash
ls src/routes/_authenticated/lesson.\$id.test.tsx src/routes/_authenticated/review.test.tsx 2>&1
```

If either exists on `main` already (not just on the Phase 2 branch), read it fully before writing Step 2 — match its existing render/mock harness rather than inventing a new one. If neither exists, these two files render through `createFileRoute`, which needs a router context to test directly; for this task, test the extracted pieces (`FinishScreen` in `lesson.$id.tsx`, `Empty` in `review.tsx`) directly as component tests instead of trying to render the whole routed page — both are already separate, plain-props functions in their files (confirmed by reading both files in full), so this needs no new export machinery, just importing them.

- [ ] **Step 2: Export `FinishScreen` and `Empty` if they aren't already**

Both are currently unexported local functions (`function FinishScreen(...)`, `function Empty(...)`). Add `export` to both signatures — this is the only change needed to make them independently testable; nothing about their behavior changes, and their sole existing call site in each file continues to work identically (a named function declaration's call sites don't care whether it's exported).

- [ ] **Step 3: Write the failing tests**

For `lesson.$id.tsx` (new or existing test file):

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinishScreen } from "./lesson.$id";

describe("FinishScreen", () => {
  it("shows Alphonso celebrating", () => {
    render(
      <FinishScreen
        xp={10}
        unlocked={[]}
        heartsBonus={null}
        lessonTitle="Test lesson"
        correct={5}
        total={5}
        missedQs={[]}
        lessonId="l1"
        course="en"
      />,
    );
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });
});
```

For `review.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Empty } from "./review";

describe("Empty", () => {
  it("shows Alphonso when the review queue is complete", () => {
    render(<Empty title="Review complete" body="5 correct" />);
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });

  it("does not show Alphonso for the routine nothing-due-today state", () => {
    render(<Empty title="Nothing due today" body="Come back tomorrow." />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run, confirm RED**

```bash
bun run test src/routes/_authenticated/lesson.\$id.test.tsx src/routes/_authenticated/review.test.tsx
```

Expected: FAIL — `FinishScreen`/`Empty` aren't exported yet (or the file doesn't exist), and no mascot renders yet regardless.

- [ ] **Step 5: Implement — `lesson.$id.tsx`'s `FinishScreen`**

Current header (lines 670-691, the motion checkmark circle + two `<p>`s):

```tsx
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="mb-6 grid size-24 place-items-center rounded-full bg-moss text-surface hard-shadow"
      >
        <svg viewBox="0 0 24 24" className="size-12" fill="none" aria-hidden="true">
          <path
            d="m6 12 4 4 8-9"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ember">
        Lesson complete
      </p>
      <h2 className="mt-1 font-display text-[24px] font-semibold text-ink">{lessonTitle}</h2>
```

Replace the checkmark circle with the mascot banner, keep the "Lesson complete" eyebrow + title exactly as-is (matches this plan's own Task 4 pattern in the iOS port: restore/keep a real headline, don't let the mascot moment replace it):

```tsx
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
        className="mb-6 w-full"
      >
        <MascotBanner mascot="alphonso" message="Nice work — lesson complete!" />
      </motion.div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ember">
        Lesson complete
      </p>
      <h2 className="mt-1 font-display text-[24px] font-semibold text-ink">{lessonTitle}</h2>
```

Add the import near the top of the file (alongside the other component imports):

```typescript
import { MascotBanner } from "../../components/MascotBanner";
```

- [ ] **Step 6: Implement — `review.tsx`'s `Empty`**

Current signature and header (lines 344-361):

```tsx
function Empty({ title, body, bonus }: { title: string; body: string; bonus?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col items-center justify-center px-8 text-center"
    >
      <div className="mb-5 grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true">
          <path
            d="m6 12 4 4 8-9"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
```

Replace with (mascot only for the "Review complete" title — this is the Review Focus item this task must satisfy, not a blanket change to every `Empty` caller):

```tsx
export function Empty({ title, body, bonus }: { title: string; body: string; bonus?: string }) {
  const isComplete = title === "Review complete";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col items-center justify-center px-8 text-center"
    >
      {isComplete ? (
        <div className="mb-5 w-full">
          <MascotBanner mascot="alphonso" message="Review complete!" />
        </div>
      ) : (
        <div className="mb-5 grid size-16 place-items-center rounded-full bg-moss text-surface hard-shadow">
          <svg viewBox="0 0 24 24" className="size-8" fill="none" aria-hidden="true">
            <path
              d="m6 12 4 4 8-9"
              stroke="white"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
```

(The three call sites of `<Empty .../>` in this file — "Nothing due today", "Review complete", and the loading state, which uses a different, non-`Empty` branch entirely — are unchanged; `isComplete` is derived from the `title` prop each already passes, matching exactly by string. Add the `MascotBanner` import alongside this file's other component imports.)

- [ ] **Step 7: Run, confirm GREEN**

```bash
bun run test src/routes/_authenticated/lesson.\$id.test.tsx src/routes/_authenticated/review.test.tsx
```

Expected: all new tests pass.

- [ ] **Step 8: Run the full suite**

```bash
bun run test 2>&1 | tail -20
```

Expected: everything green, including `AnswerOption.test.tsx`/`AnswerFeedback.test.tsx` (unaffected by this task) and anything else these two files' existing behavior touches.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Alphonso celebration banner on lesson finish and review complete"
```

---

## Task 9: Verify `isStudioInk`'s default branch is genuinely correct for Canopy, and log the pre-existing bug

**Files:** none modified in this repo — this task is a documented verification pass (matching the iOS plan's own "Task 10: verify" pattern), plus one entry added to `docs/BACKLOG.md` (gitignored, edit the main checkout's copy directly, not this worktree's — it doesn't exist here, same as the iOS work found).

- [ ] **Step 1: Confirm by reading, not assuming, that Canopy needs no new branch in either player file's `isStudioInk` conditionals**

Every `isStudioInk ? A : B` in `lesson.$id.tsx`/`review.tsx`/`AnswerOption.tsx`/`AnswerFeedback.tsx`/`OverviewScreen`/`VocabScreen` puts a *light, card-based* theme (Meadow/Manuscript today) in the `B` (non-Studio-Ink) branch. Canopy's `colorScheme` is light (`oklch(0.975 ...)` surface, matching Meadow/Manuscript's own lightness range) — it takes the `B` branch automatically via `theme !== "studio-ink"`, with no code change required. State this explicitly as verified, not inferred.

- [ ] **Step 2: Log the pre-existing `bg-moss text-surface` / Studio Ink contrast gap**

Add to the main checkout's `docs/BACKLOG.md` (find the file at the repo root outside this worktree — it's gitignored, present only in the original checkout):

```markdown
## 0.8 Pre-existing Studio Ink contrast bug — found during Canopy web port, not fixed

Found 2026-09-24 while porting Canopy to web (docs/superpowers/specs/
2026-09-24-canopy-web-port-design.md): `lesson.$id.tsx`'s FinishScreen
and `review.tsx`'s Empty("Review complete") both hardcode
`bg-moss text-surface` for their checkmark-circle icon (not
`text-primary-foreground`, which is the token that's actually
theme-safe). For Studio Ink, `--color-surface` is dark -- this renders
dark text on Studio Ink's own medium-blue moss, the same class of
failure the iOS Canopy port had to fix for its `onPrimary` token,
except this one predates Canopy entirely and affects only Studio Ink,
today, on main. Not fixed as part of the Canopy port (out of scope --
the port's own rule is not to touch the three existing themes' own
rendering). Real fix: swap both `text-surface` occurrences to
`text-primary-foreground`, matching every other moss-filled circle
already using it correctly elsewhere in these two files.
```

- [ ] **Step 3: Commit the BACKLOG.md change**

This file lives outside the worktree (in the main checkout, per this repo's established `docs/v5-kickoffs/`-style local-doc pattern — gitignored, not tracked by this branch's own git history). No commit needed in this worktree for Step 2; note it in the final summary to the account owner instead.

---

## After this plan

Run the full suite (`bun run test`), `bunx tsc --noEmit`, and `bun run lint` before opening a PR. Per the account owner's sequencing note, merge this before English Phase 2's listening-question branch rebases onto it — don't let this sit once the tasks above are done.
