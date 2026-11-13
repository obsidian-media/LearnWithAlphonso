import { DELETE_WEB_SUBSCRIPTION_NOTE } from "@/lib/account-deletion-copy";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type Ref } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useProgress } from "../../lib/progress";
import { useTheme } from "../../lib/theme";
import { getMyProfile, updateProfile } from "../../lib/leaderboard.functions";
import {
  SOCIAL_COPY,
  socialFailureMessage,
  socialReasonMessage,
} from "../../lib/social-reason-copy";
import { AiFeaturesSetting } from "../../components/AiFeaturesSetting";
import { AvatarSetting } from "../../components/AvatarSetting";
import { SoundEffectsSetting } from "../../components/SoundEffectsSetting";
import { VoicesSetting } from "../../components/VoicesSetting";
import { ExplainSetting } from "../../components/ExplainSetting";
import { ProfileAboutYou, ProfileAvatarEditor } from "../../components/firstrun/ProfileAboutYou";
import { exportMyData, deleteMyAccount } from "../../lib/account.functions";
import { getProfileOverview } from "../../lib/profile.functions";
import { fetchProgress } from "../../lib/sync.functions";
import type { ProfileTab } from "../../lib/profile-tabs";
import { useProStatus } from "../../lib/use-pro-status";
import { COURSES, type Course } from "../../data/courses";
import type { ProfileOverview } from "../../lib/profile-overview";
import { supabase } from "@/integrations/supabase/client";
import {
  Achievements,
  BigNumbers,
  CompactProfileHeader,
  CourseSwitcher,
  FriendsWeek,
  HeatMap,
  HectorNoticed,
  LeagueCard,
  LevelCard,
  ProfileHero,
  ProfileSkeleton,
  ProfileTabBar,
  ProgressFold,
  SkillsChart,
  progressFoldSummaries,
  Records,
  ShareWeek,
  ThisWeek,
  WeakSpots,
} from "../../components/profile/ProfileSections";

/** The name went through confirm_display_name first; only a later write failed. */
const DETAILS_SAVE_FAILED = "Your name was saved, but something else wasn't. Try again.";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Profile — Alphonso" },
      { name: "description", content: "Your streak, XP, achievements, and account settings." },
      { property: "og:title", content: "Profile — Alphonso" },
      {
        property: "og:description",
        content: "Track your English learning progress and achievements.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProgressTab({ o }: { o: ProfileOverview }) {
  const sum = progressFoldSummaries(o);
  const course = COURSES.find((c) => c.id === o.course)!;
  return (
    <>
      <SkillsChart o={o} />
      <ProgressFold headingId="heat-heading" title="Activity heat map" summary={sum.heat}>
        <HeatMap o={o} />
      </ProgressFold>
      <ProgressFold headingId="records-heading" title="Personal records" summary={sum.records}>
        <Records o={o} />
      </ProgressFold>
      <ProgressFold
        headingId="level-heading"
        title={`Your ${course.label} level`}
        summary={sum.level}
      >
        <LevelCard o={o} />
      </ProgressFold>
      <ProgressFold headingId="weak-heading" title="Weak spots" summary={sum.weak}>
        <WeakSpots o={o} />
      </ProgressFold>
      <ProgressFold headingId="ach-heading" title="Achievements" summary={sum.achievements}>
        <Achievements o={o} />
      </ProgressFold>
    </>
  );
}

/** Profile's data in one request, cached per course for a minute so coming back to the tab does not refetch it. */
function profileOverviewQuery(course: Course) {
  return {
    queryKey: ["profile-overview", course],
    queryFn: () => getProfileOverview({ data: { course } }),
    staleTime: 60_000,
  } as const;
}

function ProfilePage() {
  const course = useProgress((s) => s.course);
  const setCourse = useProgress((s) => s.setCourse);
  const hydrate = useProgress((s) => s.hydrate);
  const [switching, setSwitching] = useState(false);
  const overview = useQuery(profileOverviewQuery(course));
  const pro = useProStatus();
  const settingsRef = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<ProfileTab>("overview");

  // The course is app-wide (Learn, Practice and Hector follow it): this is the same switch as Learn's.
  async function switchCourse(next: Course) {
    if (next === course) return;
    setSwitching(true);
    setCourse(next);
    try {
      hydrate(await fetchProgress({ data: { course: next } }));
    } finally {
      setSwitching(false);
    }
  }

  const o = overview.data;
  return (
    <MobileFrame>
      <div className="ds-light min-h-dvh bg-ds-surface pb-12 font-[family-name:var(--ds-font-body)] text-ds-brand">
        {o ? (
          <>
            {tab === "overview" ? (
              <ProfileHero
                o={o}
                onSettings={() => {
                  setTab("overview");
                  window.setTimeout(
                    () => settingsRef.current?.scrollIntoView({ behavior: "smooth" }),
                    0,
                  );
                }}
              />
            ) : (
              <div className="px-3.5 pt-4">
                <CompactProfileHeader o={o} />
              </div>
            )}
            <div className="grid gap-3 px-3.5" aria-busy={switching || overview.isFetching}>
              {tab === "overview" && (
                <CourseSwitcher o={o} busy={switching} onSwitch={(c) => void switchCourse(c)} />
              )}
              <ProfileTabBar tab={tab} onChange={setTab} />
              <div
                role="tabpanel"
                id="profile-tabpanel"
                aria-labelledby={`profile-tab-${tab}`}
                className="grid gap-3"
              >
                {tab === "overview" && (
                  <>
                    <BigNumbers o={o} />
                    <ThisWeek o={o} />
                    <HectorNoticed o={o} pro={pro.state === "pro"} />
                  </>
                )}
                {tab === "progress" && <ProgressTab o={o} />}
                {tab === "social" && (
                  <>
                    <LeagueCard o={o} />
                    <FriendsWeek o={o} />
                    <ShareWeek o={o} />
                  </>
                )}
              </div>
            </div>
          </>
        ) : overview.isError ? (
          <div role="alert" className="grid gap-3 px-4 py-16 text-center">
            <p className="ds-type-headline text-ds-ink">Your profile didn't load.</p>
            <button
              type="button"
              onClick={() => void overview.refetch()}
              className="mx-auto min-h-11 rounded-[var(--ds-radius-control)] bg-ds-action px-5 ds-type-footnote font-extrabold text-ds-on-action"
            >
              Try again
            </button>
          </div>
        ) : (
          <ProfileSkeleton />
        )}
        {(tab === "overview" || !o) && <Settings headingRef={settingsRef} />}
      </div>
    </MobileFrame>
  );
}

const PANEL = "mt-3 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card p-4";
const H2 = "mt-8 ds-type-title text-ds-ink";

/** Everything Profile did before round 6: picture and name, About you, theme, AI, voices, your data, sign out. */
function Settings({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarSeed, setAvatarSeed] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? "");
      setAvatarSeed(profile.avatar_seed ?? "");
    }
  }, [profile]);

  async function save() {
    setSaving(true);
    setNameError(null);
    try {
      const result = await updateProfile({
        data: { display_name: name || undefined },
      });
      if (!result.ok) {
        setNameError(
          result.part === "details"
            ? DETAILS_SAVE_FAILED
            : result.error === "server-error"
              ? SOCIAL_COPY.nameSaveFailed
              : socialReasonMessage(result.error),
        );
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      await qc.invalidateQueries({ queryKey: ["profile-overview"] });
    } catch (e) {
      setNameError(socialFailureMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <section aria-labelledby="settings-heading" className="mt-10 px-5">
      <h2
        id="settings-heading"
        ref={headingRef}
        className="scroll-mt-4 ds-type-display text-ds-ink"
      >
        Settings
      </h2>

      <div className={`${PANEL} flex items-center gap-4`}>
        <ProfileAvatarEditor
          seed={avatarSeed}
          name={name}
          onSaved={(seed) => {
            setAvatarSeed(seed);
            void qc.invalidateQueries({ queryKey: ["me"] });
            void qc.invalidateQueries({ queryKey: ["profile-overview"] });
          }}
        />
        <p className="ds-type-footnote text-ds-ink-soft">
          Your picture shows on Profile, friends and leaderboards.
        </p>
      </div>

      <ProfileAboutYou leaderboardCountry={profile?.country ?? null} />

      <h2 className={H2}>Theme</h2>
      <div className={PANEL}>
        <SegmentedControl
          ariaLabel="Choose a theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "meadow", label: "Meadow" },
            { value: "studio-ink", label: "Studio Ink" },
            { value: "manuscript", label: "Manuscript" },
            { value: "canopy", label: "Canopy" },
          ]}
        />
      </div>

      <AiFeaturesSetting />

      <AvatarSetting />

      <SoundEffectsSetting />

      <VoicesSetting />

      <ExplainSetting />

      <h2 className={H2}>Account</h2>
      <div className={`${PANEL} space-y-2`}>
        <label htmlFor="profile-display-name" className="block ds-type-overline text-ds-ink-soft">
          Display name
        </label>
        <input
          id="profile-display-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          maxLength={40}
          className="min-h-11 w-full rounded-[var(--ds-radius-key)] border-2 border-ds-line bg-ds-surface px-3 ds-type-body text-ds-ink outline-none focus:border-ds-choice"
        />
        {nameError && (
          <p role="alert" className="mt-2 ds-type-footnote text-ds-wrong-ink">
            {nameError}
          </p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="mt-2 min-h-11 w-full rounded-full bg-ds-brand px-4 ds-type-footnote font-bold text-ds-card disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <Link
        to="/profile/friends"
        className={`${PANEL} flex min-h-11 items-center justify-between ds-type-footnote font-bold text-ds-brand`}
      >
        Friends and invites
        <span aria-hidden="true">→</span>
      </Link>

      <YourData onSignedOut={() => navigate({ to: "/auth", replace: true })} />

      <button
        onClick={signOut}
        className="mt-4 min-h-11 w-full rounded-full border-2 border-ds-line bg-ds-card px-4 ds-type-footnote text-ds-ink-soft hover:text-ds-ink"
      >
        Sign out
      </button>

      {/* A visible way to report a problem or send feedback (the page has the address and the answers people
        arrive with). */}
      <Link
        to="/support"
        className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border-2 border-ds-line bg-ds-card px-4 ds-type-footnote text-ds-ink-soft hover:text-ds-ink"
      >
        Help and feedback
      </Link>

      <div className="mt-6 flex items-center justify-center gap-4 ds-type-caption text-ds-ink-soft">
        <Link to="/privacy" className="hover:text-ds-ink">
          Privacy
        </Link>
        <span aria-hidden>·</span>
        <Link to="/terms" className="hover:text-ds-ink">
          Terms
        </Link>
        <span aria-hidden>·</span>
        <Link to="/cookies" className="hover:text-ds-ink">
          Cookies
        </Link>
      </div>
    </section>
  );
}

function YourData({ onSignedOut }: { onSignedOut: () => void }) {
  const [busy, setBusy] = useState<null | "export" | "delete">(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy("export");
    setError(null);
    try {
      const payload = await exportMyData();
      const pretty = {
        exported_at: payload.exported_at,
        user_id: payload.user_id,
        ...JSON.parse(payload.tables),
      };
      const blob = new Blob([JSON.stringify(pretty, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "alphonso-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await deleteMyAccount({ data: { confirm: "DELETE" } });
      await supabase.auth.signOut();
      onSignedOut();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed");
      setBusy(null);
    }
  }

  return (
    <>
      <h2 className={H2}>Your data</h2>
      <div className={`${PANEL} space-y-3`}>
        <p className="ds-type-footnote text-ds-ink-soft">
          Download everything we hold about you, or permanently erase your account.
        </p>
        <button
          onClick={download}
          disabled={busy !== null}
          className="min-h-11 w-full rounded-full border-2 border-ds-line bg-ds-surface px-4 ds-type-footnote font-bold text-ds-ink disabled:opacity-50"
        >
          {busy === "export" ? "Preparing…" : "Download my data"}
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
            className="min-h-11 w-full rounded-full border-2 border-ds-wrong-tint bg-ds-wrong-tint px-4 ds-type-footnote font-bold text-ds-wrong-ink disabled:opacity-50"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-2 rounded-[var(--ds-radius-key)] border-2 border-ds-wrong-tint bg-ds-wrong-tint p-3">
            <p className="ds-type-footnote text-ds-wrong-ink">
              This permanently deletes your account, progress, streaks, achievements and review
              history. It cannot be undone. Type DELETE to confirm.
            </p>
            <p className="ds-type-footnote text-ds-wrong-ink">{DELETE_WEB_SUBSCRIPTION_NOTE}</p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
              className="min-h-11 w-full rounded-[var(--ds-radius-key)] border-2 border-ds-line bg-ds-card px-3 ds-type-body outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
                className="min-h-11 flex-1 rounded-full border-2 border-ds-line bg-ds-card px-3 ds-type-footnote text-ds-ink-soft"
              >
                Cancel
              </button>
              <button
                onClick={remove}
                disabled={confirmText !== "DELETE" || busy !== null}
                className="min-h-11 flex-1 rounded-full bg-ds-wrong px-3 ds-type-footnote font-bold text-ds-on-wrong disabled:opacity-50"
              >
                {busy === "delete" ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
