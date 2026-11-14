import { ProfileSettings } from "../../components/profile/ProfileSettings";
import { PathProfileCard } from "../../components/path/PathProfileCard";
import { DELETE_WEB_SUBSCRIPTION_NOTE } from "@/lib/account-deletion-copy";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type Ref } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import {
  DsButton,
  DsCard,
  DsField,
  DsLinkButton,
  DsRow,
  Icon,
  Overline,
} from "../../components/ds/Blocks";
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
import { AnalyticsSetting } from "../../components/AnalyticsSetting";
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
      <PathProfileCard course={o.course} />
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
        {(tab === "overview" || !o) && <ProfileSettings headingRef={settingsRef} />}
      </div>
    </MobileFrame>
  );
}
