## Product

A mobile-first English learning app for mixed levels (A1–B1). All progress (XP, streak, hearts, completed lessons) is stored locally in the browser — no accounts, no backend.

## Design direction

Base direction: "Grown-up gamified organic" — but pushed to feel bespoke, not templated. Concrete polish moves:

- **Typography**: Fraunces (display, optical size variable) for headings + Geist Sans for UI. Uncommon pairing; adult and editorial rather than kid-app.
- **Palette (custom, not stock green)**: warm off-white surface `#f6f2ec`, deep forest ink `#0f2a20`, moss primary `#2d5a45`, ember accent `#c4501e`, muted parchment cards `#eee7db`. All defined as OKLCH tokens in `src/styles.css`.
- **Craft details**: subtle grain texture on the background via SVG noise `@utility`, hairline 1px borders (`oklch/8%`), tactile "hard shadow" buttons (offset shadow that compresses on `active:`), tabular numerals for XP/streak counters, streak flame + heart drawn as inline SVG (not emoji), curved SVG connector line between lesson nodes instead of a straight bar, alternating left/right node offsets.
- **Motion**: Framer Motion — staggered fade/slide on path nodes, spring pop on correct answer, shake on wrong, progress bar tween.

## Screens & routes

TanStack Start file routes, all under a shared mobile shell (max-width 430px, sticky top stats bar, sticky bottom tab bar):

```
src/routes/
  __root.tsx              # head metadata, providers
  index.tsx               # /  — Learn (unit header + lesson path)
  lesson.$id.tsx          # /lesson/:id — quiz flow
  league.tsx              # /league — leaderboard (seeded fake users + "you")
  profile.tsx             # /profile — stats, streak calendar, reset progress
```

### 1. Learn (`/`)
- Top bar: streak (flame + count), XP (bolt + count), hearts (heart + count).
- Unit header: eyebrow "Unit 2", display title, one-line description.
- Vertical lesson path: 6 nodes with curved SVG connectors, alternating offsets. States: completed (filled moss + check), active (pulsing ring + "Start" tag), locked (parchment + lock icon). Milestone card every 5 lessons.
- Bottom tab bar: Learn / League / Profile.

### 2. Lesson (`/lesson/:id`)
- Top: progress bar + "4 / 10" + close (X) that returns to `/`.
- Question types v1: multiple choice (4 options) and fill-in-blank (word bank of tappable chips).
- Bottom sticky "Check" button; on submit shows a slide-up result sheet (green correct / red wrong with correct answer + explanation) then "Continue".
- Wrong answer decrements hearts; hearts at 0 → "Out of hearts" screen with 30-min timer (kept simple — just displays timer, no gating enforcement).
- On finish: summary screen with XP earned, accuracy, streak-continued animation → back to `/`.

### 3. League (`/league`)
- Weekly leaderboard: 15 seeded fake users + "You" row highlighted in place based on current XP. Rank medal for top 3.

### 4. Profile (`/profile`)
- Avatar block, level, total XP, longest streak, lessons completed.
- 7-day streak strip (dots filled per day).
- "Reset progress" destructive button with confirm.

## Content (seed data)

Hand-written `src/data/curriculum.ts` — 3 units × 4 lessons × 8 questions covering Present Simple, Daily Routine, and Polite Requests. Mix of multiple choice and fill-in-blank. This gives a real, playable app on first load without needing an AI/backend.

## State (local only)

`src/lib/progress.ts` — a tiny Zustand store persisted to `localStorage` via `persist` middleware. Reads happen in `useEffect` / after mount to avoid SSR hydration mismatch (per execution-model rules). Shape:

```ts
{
  xp: number
  streak: number
  lastActiveDate: string     // YYYY-MM-DD, drives streak logic
  hearts: number
  heartsRefillAt: number | null
  completedLessons: string[]
  answersByLesson: Record<string, { correct: number; total: number }>
}
```

Streak logic: on lesson complete, if `lastActiveDate` was yesterday → streak+1; if today → unchanged; else → reset to 1.

## Technical notes

- **Stack**: TanStack Start + React 19 + Tailwind v4 (tokens in `src/styles.css` under `@theme`, fonts loaded via `<link>` in `__root.tsx` head).
- **No Lovable Cloud**: user chose local-only, so no Supabase.
- **Dependencies to add**: `framer-motion`, `zustand`. Everything else is already in the template.
- **SEO/head**: real title "Lingua — Learn English, one lesson at a time" and matching description/og in `__root.tsx`; leaf routes get their own titles.
- **Icons**: `lucide-react` (already available) for nav icons, drawn at hairline weight; custom inline SVG for flame/heart in the stats bar so they feel bespoke.
- **Accessibility**: real buttons with `aria-label`, focus rings via `--color-ring`, min 44px tap targets, `prefers-reduced-motion` disables spring animations.

## Build order

1. Add deps, set up design tokens + fonts + root head.
2. Build mobile shell (top stats bar, bottom tab bar) as a layout component reused by each route.
3. Seed `curriculum.ts` and `progress.ts` store.
4. Learn path screen with SVG connectors and node states.
5. Lesson quiz flow (multiple choice + fill-blank + result sheet + summary).
6. League + Profile screens.
7. Motion polish + grain texture + micro-interactions.
