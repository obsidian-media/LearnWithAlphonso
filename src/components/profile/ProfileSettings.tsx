import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type Ref } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DELETE_WEB_SUBSCRIPTION_NOTE } from "@/lib/account-deletion-copy";
import { supabase } from "@/integrations/supabase/client";
import { DsButton, DsCard, DsField, DsLinkButton, DsRow, Icon, Overline } from "../ds/Blocks";
import { SegmentedControl } from "../SegmentedControl";
import { AiFeaturesSetting } from "../AiFeaturesSetting";
import { HelpEntry } from "../help/HelpEntry";
import { AnalyticsSetting } from "../AnalyticsSetting";
import { AvatarSetting } from "../AvatarSetting";
import { SoundEffectsSetting } from "../SoundEffectsSetting";
import { VoicesSetting } from "../VoicesSetting";
import { ExplainSetting } from "../ExplainSetting";
import { ProfileAboutYou, ProfileAvatarEditor } from "../firstrun/ProfileAboutYou";
import { exportMyData, deleteMyAccount } from "../../lib/account.functions";
import { getMyProfile, updateProfile } from "../../lib/leaderboard.functions";
import {
  SOCIAL_COPY,
  socialFailureMessage,
  socialReasonMessage,
} from "../../lib/social-reason-copy";
import { useTheme } from "../../lib/theme";

/** The name went through confirm_display_name first; only a later write failed. */
const DETAILS_SAVE_FAILED = "Your name was saved, but something else wasn't. Try again.";

/** Everything Profile did before round 6: picture and name, About you, theme, AI, voices, your data, sign out. */
export function ProfileSettings({ headingRef }: { headingRef: Ref<HTMLHeadingElement> }) {
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
    <section aria-labelledby="settings-heading" className="mt-10 grid gap-3.5 px-4">
      <h2
        id="settings-heading"
        ref={headingRef}
        className="scroll-mt-4 ds-type-display text-ds-ink"
      >
        Settings
      </h2>

      <Overline>Profile</Overline>
      <DsCard>
        <div className="flex items-center gap-4">
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
      </DsCard>

      <ProfileAboutYou leaderboardCountry={profile?.country ?? null} />

      <Overline>Theme</Overline>
      <DsCard>
        <SegmentedControl
          ariaLabel="Choose a theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: "royal", label: "Royal" },
            { value: "meadow", label: "Meadow" },
          ]}
        />
      </DsCard>

      <Overline>Practice</Overline>
      <AvatarSetting />
      <SoundEffectsSetting />
      <VoicesSetting />
      <ExplainSetting />

      <Overline>Privacy and AI</Overline>
      <AiFeaturesSetting />
      <HelpEntry />
      <AnalyticsSetting />

      <Overline>Account</Overline>
      <DsCard>
        <label htmlFor="profile-display-name" className="ds-type-overline text-ds-xp-text">
          Display name
        </label>
        <DsField
          id="profile-display-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameError(null);
          }}
          maxLength={40}
        />
        {nameError && (
          <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
            {nameError}
          </p>
        )}
        <DsButton full onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </DsButton>
        <p className="ds-type-caption text-ds-ink-soft">
          Your name and picture are visible to other learners on leaderboards, friends, and duels.
        </p>
      </DsCard>

      <DsCard flush>
        <Link
          to="/profile/friends"
          className="flex min-h-12 items-center gap-2.5 ds-type-headline text-ds-ink"
        >
          <Icon name="handshake" />
          <span className="min-w-0 flex-1">Friends and invites</span>
          <span aria-hidden="true" className="text-ds-ink-soft">
            ›
          </span>
        </Link>
      </DsCard>

      <YourData onSignedOut={() => navigate({ to: "/auth", replace: true })} />

      <DsCard flush>
        <DsRow first className="min-h-12">
          <Link to="/privacy" className="ds-type-headline min-w-0 flex-1 text-ds-ink">
            Privacy
          </Link>
          <span aria-hidden="true" className="text-ds-ink-soft">
            ›
          </span>
        </DsRow>
        <DsRow className="min-h-12">
          <Link to="/terms" className="ds-type-headline min-w-0 flex-1 text-ds-ink">
            Terms
          </Link>
          <span aria-hidden="true" className="text-ds-ink-soft">
            ›
          </span>
        </DsRow>
        <DsRow className="min-h-12">
          <Link to="/cookies" className="ds-type-headline min-w-0 flex-1 text-ds-ink">
            Cookies
          </Link>
          <span aria-hidden="true" className="text-ds-ink-soft">
            ›
          </span>
        </DsRow>
      </DsCard>

      <div className="grid justify-items-center gap-2.5">
        <DsButton variant="danger" onClick={signOut}>
          Sign out
        </DsButton>
        {/* A visible way to report a problem or send feedback (the page has the address and the answers people
          arrive with). */}
        <DsLinkButton to="/support" variant="secondary" small>
          Help and feedback
        </DsLinkButton>
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
      <Overline>Your data</Overline>
      <DsCard>
        <p className="ds-type-footnote text-ds-ink-soft">
          Download everything we hold about you, or permanently erase your account.
        </p>
        <div className="flex gap-2.5">
          <DsButton
            small
            variant="secondary"
            className="flex-1"
            onClick={download}
            disabled={busy !== null}
          >
            {busy === "export" ? "Preparing…" : "Download my data"}
          </DsButton>
          {!confirming && (
            <DsButton
              small
              variant="danger"
              className="flex-1"
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
            >
              Delete my account
            </DsButton>
          )}
        </div>

        {confirming && (
          <div className="grid gap-2 rounded-[14px] border-2 border-ds-wrong bg-ds-wrong-tint p-3">
            <p className="ds-type-footnote text-ds-wrong-ink">
              This permanently deletes your account, progress, streaks, achievements and review
              history. It cannot be undone. Type DELETE to confirm.
            </p>
            <p className="ds-type-footnote text-ds-wrong-ink">{DELETE_WEB_SUBSCRIPTION_NOTE}</p>
            <DsField
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              aria-label="Type DELETE to confirm"
            />
            <div className="flex gap-2">
              <DsButton
                small
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                }}
              >
                Cancel
              </DsButton>
              <DsButton
                small
                variant="danger"
                className="flex-1"
                onClick={remove}
                disabled={confirmText !== "DELETE" || busy !== null}
              >
                {busy === "delete" ? "Deleting…" : "Delete forever"}
              </DsButton>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="ds-type-footnote text-ds-wrong-ink">
            {error}
          </p>
        )}
      </DsCard>
    </>
  );
}
