import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileFrame } from "../../components/AppShell";
import { AchievementBadge } from "../../components/AchievementBadge";
import { LeagueTierBadge } from "../../components/LeagueTierBadge";
import { ACHIEVEMENTS } from "../../data/achievements";
import { useProgress } from "../../lib/progress";
import { getMyProfile, updateProfile } from "../../lib/leaderboard.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({
    meta: [
      { title: "Profile — Lingua" },
      { name: "description", content: "Your streak, XP, achievements, and account settings." },
      { property: "og:title", content: "Profile — Lingua" },
      { property: "og:description", content: "Track your English learning progress and achievements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const p = useProgress();
  const { data: profile } = useQuery({ queryKey: ["me"], queryFn: () => getMyProfile() });
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? "");
      setCountry(profile.country ?? "");
    }
  }, [profile]);

  async function save() {
    setSaving(true);
    await updateProfile({
      data: {
        display_name: name || undefined,
        country: country ? country.toUpperCase().slice(0, 2) : null,
      },
    });
    await qc.invalidateQueries({ queryKey: ["me"] });
    setSaving(false);
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const unlockedSet = new Set(p.unlockedAchievements);
  const seed = profile?.avatar_seed ?? "a";

  return (
    <MobileFrame>
      <div className="px-6 pb-12 pt-6">
        <div className="flex items-center gap-4">
          <span
            className="grid size-16 place-items-center rounded-full text-xl font-semibold text-surface"
            style={{
              backgroundColor: `hsl(${(seed.charCodeAt(0) * 37) % 360} 40% 45%)`,
            }}
          >
            {(name || "?").slice(0, 1).toUpperCase()}
          </span>
          <div className="flex-1">
            <h1 className="font-display text-[22px] font-semibold text-ink">
              {name || "Learner"}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <LeagueTierBadge tier={p.leagueTier} size="sm" />
              <span className="text-[11px] text-ink-soft">
                {p.longestStreak}-day best streak
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <Stat label="XP" value={p.xp} />
          <Stat label="Streak" value={p.streak} />
          <Stat label="Freezes" value={p.streakFreezes} />
        </div>

        <ActivityHeatmap dates={p.activityDates} />

        <h2 className="mt-8 font-display text-[18px] font-semibold text-ink">Achievements</h2>
        <p className="text-xs text-ink-soft">
          {unlockedSet.size} of {ACHIEVEMENTS.length} unlocked
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((a) => (
            <AchievementBadge key={a.id} achievement={a} unlocked={unlockedSet.has(a.id)} />
          ))}
        </div>

        <h2 className="mt-8 font-display text-[18px] font-semibold text-ink">Account</h2>
        <div className="mt-3 space-y-2 rounded-2xl border border-hairline bg-surface p-4">
          <label className="block text-[11px] uppercase tracking-wider text-ink-soft">
            Display name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="w-full rounded-xl border border-hairline bg-parchment px-3 py-2 text-sm outline-none focus:border-moss"
          />
          <label className="mt-2 block text-[11px] uppercase tracking-wider text-ink-soft">
            Country (ISO code, e.g. US, GB)
          </label>
          <input
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
            className="w-full rounded-xl border border-hairline bg-parchment px-3 py-2 text-sm uppercase outline-none focus:border-moss"
          />
          <button
            onClick={save}
            disabled={saving}
            className="mt-2 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        <YourData onSignedOut={() => navigate({ to: "/auth", replace: true })} />

        <button
          onClick={signOut}
          className="mt-4 w-full rounded-full border border-hairline bg-surface px-4 py-2.5 text-sm font-medium text-ink-soft hover:text-ink"
        >
          Sign out
        </button>

        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-ink-soft/70">
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-ink">Terms</Link>
        </div>
      </div>
    </MobileFrame>
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
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lingua-my-data.json";
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
      <h2 className="mt-8 font-display text-[18px] font-semibold text-ink">Your data</h2>
      <div className="mt-3 space-y-3 rounded-2xl border border-hairline bg-surface p-4">
        <p className="text-xs leading-relaxed text-ink-soft">
          Download everything we hold about you, or permanently erase your account.
        </p>
        <button
          onClick={download}
          disabled={busy !== null}
          className="w-full rounded-full border border-hairline bg-parchment px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-50"
        >
          {busy === "export" ? "Preparing…" : "Download my data"}
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy !== null}
            className="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 disabled:opacity-50"
          >
            Delete my account
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3">
            <p className="text-xs leading-relaxed text-rose-800">
              This permanently deletes your account, progress, streaks, achievements and review
              history. It cannot be undone. Type DELETE to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              className="w-full rounded-lg border border-rose-200 bg-surface px-3 py-2 text-sm outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
                className="flex-1 rounded-full border border-hairline bg-surface px-3 py-2 text-sm text-ink-soft"
              >
                Cancel
              </button>
              <button
                onClick={remove}
                disabled={confirmText !== "DELETE" || busy !== null}
                className="flex-1 rounded-full bg-rose-600 px-3 py-2 text-sm font-semibold text-surface disabled:opacity-50"
              >
                {busy === "delete" ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
    </>
  );
}


function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface px-3 py-3 text-center">
      <p className="tnum font-display text-[20px] font-semibold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-ink-soft">{label}</p>
    </div>
  );
}

function ActivityHeatmap({ dates }: { dates: string[] }) {
  const set = new Set(dates);
  const cells: { date: string; active: boolean }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    cells.push({ date: iso, active: set.has(iso) });
  }
  return (
    <div className="mt-5 rounded-2xl border border-hairline bg-parchment p-4">
      <p className="mb-2 text-[10px] uppercase tracking-wider text-ink-soft">Last 30 days</p>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(15, 1fr)" }}
      >
        {cells.map((c) => (
          <span
            key={c.date}
            title={c.date}
            className={`aspect-square rounded ${c.active ? "bg-moss" : "bg-surface ring-1 ring-hairline"}`}
          />
        ))}
      </div>
    </div>
  );
}