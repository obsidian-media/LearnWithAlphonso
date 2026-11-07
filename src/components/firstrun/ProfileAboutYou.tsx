import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProfileAvatar } from "../ds/ProfileAvatar";
import { Modal } from "../Modal";
import { edgeButtonClass } from "../lesson/LessonParts";
import { AvatarPicker } from "./AvatarPicker";
import { SwitchRow } from "./FirstRunParts";
import { countryName } from "./FirstRunFlow";
import { updateProfile } from "../../lib/leaderboard.functions";
import { saveLearnerProfile } from "../../lib/learner-profile.functions";
import {
  LEARNER_PROFILE_KEY,
  parseLearnerProfile,
  type LearnerProfile,
} from "../../lib/learner-profile";
import { parseAvatarSeed } from "../../lib/profile-avatars";

/** The profile hero's picture with its "Change picture" button and the picker dialog. */
export function ProfileAvatarEditor({
  seed,
  name,
  onSaved,
}: {
  seed: string;
  name: string;
  onSaved: (seed: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <ProfileAvatar seed={seed} name={name} className="size-16" textClass="ds-type-title" />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-6 ds-type-caption text-ds-choice underline underline-offset-4"
      >
        Change picture
      </button>
      {open && (
        <AvatarDialog
          seed={seed}
          name={name}
          onClose={() => setOpen(false)}
          onSaved={(s) => {
            setOpen(false);
            onSaved(s);
          }}
        />
      )}
    </div>
  );
}

function AvatarDialog({
  seed,
  name,
  onClose,
  onSaved,
}: {
  seed: string;
  name: string;
  onClose: () => void;
  onSaved: (seed: string) => void;
}) {
  const titleId = useId();
  const initialsSeed = parseAvatarSeed(seed) ? "a" : seed || "a";
  const [value, setValue] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      labelledBy={titleId}
      onEscape={onClose}
      className="ds-light relative grid max-h-[90dvh] w-full max-w-[430px] gap-4 overflow-y-auto rounded-t-[var(--ds-radius-sheet)] bg-ds-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 font-[family-name:var(--ds-font-body)] text-ds-ink shadow-[var(--ds-shadow-sheet)] sm:rounded-[var(--ds-radius-sheet)]"
    >
      <h2 id={titleId} className="ds-type-title text-ds-brand">
        Your profile picture
      </h2>
      <p className="-mt-2 ds-type-footnote text-ds-ink-soft">
        Friends and leaderboards show it. Pick one of Alphonso's friends, or keep your initial.
      </p>
      <AvatarPicker value={value} name={name} initialsSeed={initialsSeed} onChange={setValue} />
      {error && (
        <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
          {error}
        </p>
      )}
      <div className="grid gap-1">
        <button
          type="button"
          disabled={busy}
          className={edgeButtonClass("primary")}
          onClick={async () => {
            if (value === seed) return onClose();
            setBusy(true);
            setError(null);
            try {
              const r = await updateProfile({ data: { avatar_seed: value } });
              if (r && "ok" in r && !r.ok) throw new Error();
              onSaved(value);
            } catch {
              setError("Couldn't save your picture. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save picture"}
        </button>
        <button type="button" onClick={onClose} className={edgeButtonClass("tertiary")}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

/**
 * Profile's "About you": the leaderboard flag (the learner's choice, off by default), the daily time, and a link
 * to change the first-run answers. `leaderboardCountry` is what profiles.country holds today.
 */
export function ProfileAboutYou({ leaderboardCountry }: { leaderboardCountry: string | null }) {
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void supabase.auth
      .getUser()
      .then(({ data }) => {
        if (live) setProfile(parseLearnerProfile(data.user?.user_metadata?.[LEARNER_PROFILE_KEY]));
      })
      .catch(() => live && setProfile(parseLearnerProfile(null)));
    return () => {
      live = false;
    };
  }, []);

  const country = profile?.country ?? leaderboardCountry ?? undefined;
  // A country already on the leaderboard was set by the learner before the switch existed: that is "on".
  const on = profile ? profile.showFlag || Boolean(leaderboardCountry && !profile.country) : false;

  async function toggle(next: boolean) {
    if (!country) return;
    setBusy(true);
    setError(null);
    try {
      setProfile(
        await saveLearnerProfile({
          data: { patch: { showFlag: next, country: country as LearnerProfile["country"] } },
        }),
      );
    } catch {
      setError("Couldn't change your flag setting. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="about-you-heading"
      className="ds-light font-[family-name:var(--ds-font-body)]"
    >
      <h2 id="about-you-heading" className="mt-8 ds-type-title text-ds-ink">
        About you
      </h2>
      <div className="mt-3 grid gap-2.5">
        <div className={busy || !profile || !country ? "opacity-60" : undefined}>
          <SwitchRow
            label="Show my flag on leaderboards"
            sub={
              country
                ? `${countryName(country)}. Off unless you turn it on; it also puts you on your country's board.`
                : "Add your country in Edit your answers first."
            }
            checked={on}
            onChange={(v) => void toggle(v)}
          />
        </div>
        {profile?.dailyMinutes && (
          <p className="ds-type-footnote text-ds-ink-soft">
            Daily goal: {profile.dailyMinutes} minutes a day.
          </p>
        )}
        {error && (
          <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
            {error}
          </p>
        )}
        <Link
          to="/complete-profile"
          search={{ edit: true }}
          className="flex min-h-11 items-center justify-between rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-4 ds-type-footnote font-bold text-ds-brand"
        >
          Edit your answers
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
