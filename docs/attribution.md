# Sign-up attribution

Which link or community brought a new account. Added 2026-10-18 (migration `20261018110000_signup_attribution.sql`).

## What is stored

One row per account in `public.signup_attribution`: `utm_source`, `utm_medium`, `utm_campaign` (short plain tags only), `landed_at` (when the visitor first arrived) and `created_at`. Nothing else: no IP address, user agent, device id or referrer URL. The row is deleted with the account and is included in the data export.

## How it gets there

1. A visitor opens a link such as `https://learn.alphonsoecosystem.app/?utm_source=r_testflight&utm_medium=post&utm_campaign=beta1`.
2. `AttributionBridge` (mounted in `src/routes/__root.tsx`) reads the tags from the browser address on every page load, so it works even on routes whose `validateSearch` drops unknown params (`/auth`).
3. Consent decides where they wait (`src/lib/signup-attribution.ts`): cookie banner unanswered, in `sessionStorage` (gone when the tab closes); **Accept all**, in `localStorage`; **Essential only**, nothing is kept. First touch wins.
4. After sign-in (and only with Accept all) the tags are sent once to `record_signup_attribution()` through the `recordSignupAttribution` server function, then cleared from the browser. The database function ignores any account older than 7 days, drops values that are not short plain tags, and never overwrites.

Coverage is therefore "learners who accepted all cookies and signed up from a tagged link". Treat the numbers as a sample, not a census. A learner who opens the email confirmation link in a new browser tab may lose the tags if they had not yet chosen Accept all.

## Link convention

`?utm_source=<r_languagelearning|r_testflight|r_alphaandbetausers|site|video>&utm_medium=post&utm_campaign=beta1`

The marketing website's sign-up buttons use `utm_source=site&utm_medium=button&utm_campaign=beta1`. TestFlight links cannot carry tags; TestFlight shows installs per public-link group instead.

## Reading it

Run in the Supabase SQL editor (service role). Change `since` to the first day of the campaign. `(none)` means no tag was recorded: no tagged link, no Accept all, or an account from before this shipped.

```sql
-- 1. Sign-ups by source
with params as (select date '2026-10-19' as since)
select coalesce(a.utm_source, '(none)') as source,
       count(*) as signups
from auth.users u
left join public.signup_attribution a on a.user_id = u.id
cross join params p
where u.created_at::date >= p.since
group by 1
order by signups desc;
```

```sql
-- 2. First lesson, and return on day 1 and day 7, by source.
-- "Return" = any learning activity on exactly that day after sign-up (public.activity_days).
-- Each rate counts only learners old enough to have had that day, so a recent cohort is not
-- counted as a failure.
with params as (select date '2026-10-19' as since),
cohort as (
  select u.id, u.created_at::date as day0, coalesce(a.utm_source, '(none)') as source
  from auth.users u
  left join public.signup_attribution a on a.user_id = u.id
  cross join params p
  where u.created_at::date >= p.since
)
select c.source,
       count(*) as signups,
       count(*) filter (where exists (
         select 1 from public.lesson_completions l where l.user_id = c.id)) as finished_a_lesson,
       count(*) filter (where c.day0 <= current_date - 1) as old_enough_d1,
       count(*) filter (where c.day0 <= current_date - 1 and exists (
         select 1 from public.activity_days d where d.user_id = c.id and d.day = c.day0 + 1)) as returned_d1,
       count(*) filter (where c.day0 <= current_date - 7) as old_enough_d7,
       count(*) filter (where c.day0 <= current_date - 7 and exists (
         select 1 from public.activity_days d where d.user_id = c.id and d.day = c.day0 + 7)) as returned_d7
from cohort c
group by c.source
order by signups desc;
```

```sql
-- 3. Weekly return: share of learners with any activity in days 1 to 7 after sign-up
-- (the brief's 30%+ target). Only learners at least 7 days old.
with params as (select date '2026-10-19' as since)
select coalesce(a.utm_source, '(none)') as source,
       count(*) as signups_7d_old,
       count(*) filter (where exists (
         select 1 from public.activity_days d
         where d.user_id = u.id
           and d.day between u.created_at::date + 1 and u.created_at::date + 7)) as returned_within_week
from auth.users u
left join public.signup_attribution a on a.user_id = u.id
cross join params p
where u.created_at::date >= p.since
  and u.created_at::date <= current_date - 7
group by 1
order by signups_7d_old desc;
```

`src/lib/signup-attribution-queries.test.ts` runs these exact queries against seeded data.

## Not in scope

No third-party tracker, no per-visit event log, no cross-device or cross-site tracking. If you want click counts per link before sign-up, that needs a separate decision (and a privacy-policy change).
