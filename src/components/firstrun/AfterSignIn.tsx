import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth-headers";
import { canSpeak, speak } from "../../lib/speech";
import { expressionSrc } from "../../lib/lesson-stage";
import { updateProfile } from "../../lib/leaderboard.functions";
import { saveLearnerProfile } from "../../lib/learner-profile.functions";
import { greetingFor, listInWords, roomForAnswers, roomSrc } from "../../lib/first-run";
import type { HeardFrom, Interest, ProfileCourse } from "../../lib/learner-profile";
import { parseAvatarSeed } from "../../lib/profile-avatars";
import { AvatarPicker } from "./AvatarPicker";
import {
  ChoiceTile,
  FirstRunBubble,
  FirstRunFooter,
  FirstRunHud,
  FirstRunRoom,
  FirstRunScreen,
} from "./FirstRunParts";
import { FirstRunIcon, type FirstRunIconName } from "./FirstRunIcons";
import { INTEREST_CHOICES } from "./FirstRunFlow";

const HEARD_CHOICES: { id: HeardFrom; label: string; icon: FirstRunIconName }[] = [
  { id: "app_store", label: "App Store", icon: "store" },
  { id: "search", label: "Search", icon: "search" },
  { id: "youtube", label: "YouTube", icon: "film" },
  { id: "social", label: "Instagram or TikTok", icon: "share" },
  { id: "friend", label: "A friend", icon: "people" },
  { id: "podcast", label: "Podcast", icon: "pod" },
];

type Step = "avatar" | "heard" | "hector";
/** Where the learner goes when this part ends: their first lesson (or the placement test), or Hector. */
export type FinishTarget = "lesson" | "hector";

/**
 * After sign-in, never before: the profile picture, "how did you hear about me" (skippable), then Meet Hector with
 * a trial line read from the store's offer and a clear Not now.
 */
export function AfterSignIn({
  start = "avatar",
  name,
  course,
  interests,
  avatarSeed,
  onFinish,
}: {
  start?: Step;
  name: string;
  course: ProfileCourse;
  interests: Interest[];
  /** The account's current avatar seed. */
  avatarSeed: string;
  onFinish: (target: FinishTarget) => void;
}) {
  const [step, setStep] = useState<Step>(start);
  if (step === "avatar")
    return <AvatarStep name={name} seed={avatarSeed} onDone={() => setStep("heard")} />;
  if (step === "heard") return <HeardStep course={course} onDone={() => setStep("hector")} />;
  return <MeetHector name={name} course={course} interests={interests} onFinish={onFinish} />;
}

function AvatarStep({ name, seed, onDone }: { name: string; seed: string; onDone: () => void }) {
  // The learner's old colour seed stays theirs for initials.
  const initialsSeed = parseAvatarSeed(seed) ? "a" : seed || "a";
  const [value, setValue] = useState(seed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = name ? `Pick your picture, ${name}.` : "Pick your picture.";
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={roomSrc("room-light")}
        figure={expressionSrc("happy")}
        figureAlt="Alphonso, smiling"
        size="normal"
      />
      <FirstRunBubble
        title={title}
        sub="Your friends and leaderboards show it. Change it any time in Profile."
        onPlay={canSpeak() ? () => speak(title, "en-US") : undefined}
      />
      <div className="px-5 pt-5">
        <AvatarPicker value={value} name={name} initialsSeed={initialsSeed} onChange={setValue} />
      </div>
      {error && (
        <p role="alert" className="mx-5 mt-3 ds-type-footnote text-ds-wrong-ink">
          {error}
        </p>
      )}
      <FirstRunFooter
        label={busy ? "Saving…" : "Continue"}
        disabled={busy}
        onClick={async () => {
          if (value === seed) return onDone();
          setBusy(true);
          setError(null);
          try {
            const r = await updateProfile({ data: { avatar_seed: value } });
            if (r && "ok" in r && !r.ok) throw new Error();
            onDone();
          } catch {
            setError("Couldn't save your picture. Try again, or keep your initial for now.");
          } finally {
            setBusy(false);
          }
        }}
        secondary={{ label: "Keep my initial", onClick: onDone }}
      />
    </FirstRunScreen>
  );
}

function HeardStep({ course, onDone }: { course: ProfileCourse; onDone: () => void }) {
  const [picked, setPicked] = useState<HeardFrom | null>(null);
  const [busy, setBusy] = useState(false);
  const title = "One last thing: how did you hear about me?";
  return (
    <FirstRunScreen>
      <FirstRunRoom
        room={roomSrc(roomForAnswers({ course }))}
        figure={expressionSrc("neutral")}
        figureAlt="Alphonso, listening"
        top={<FirstRunHud step={0} total={0} onSkip={onDone} showCounter={false} />}
      />
      <FirstRunBubble title={title} onPlay={canSpeak() ? () => speak(title, "en-US") : undefined} />
      <div className="grid grid-cols-2 gap-2.5 px-4 pt-4">
        {HEARD_CHOICES.map((c) => (
          <ChoiceTile
            key={c.id}
            icon={c.icon}
            label={c.label}
            selected={picked === c.id}
            onClick={() => setPicked(c.id)}
          />
        ))}
      </div>
      <FirstRunFooter
        label="Continue"
        disabled={!picked || busy}
        onClick={async () => {
          if (!picked) return;
          setBusy(true);
          try {
            await saveLearnerProfile({ data: { patch: { heardFrom: picked } } });
          } catch {
            // Optional and only for us: never hold the learner up over it.
          }
          onDone();
        }}
      />
    </FirstRunScreen>
  );
}

type Offer =
  { kind: "loading" } | { kind: "none" } | { kind: "trial"; days: number } | { kind: "plain" };

/** The trial length from the website's store offer (/api/pro-offering, RevenueCat). Never typed in here. */
function useTrialOffer(): Offer {
  const [offer, setOffer] = useState<Offer>({ kind: "loading" });
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch("/api/pro-offering?source=hector_tab", {
          headers: await authHeaders(),
        });
        if (!res.ok) return live && setOffer({ kind: "none" });
        const body = (await res.json()) as { trialDays?: unknown };
        const days =
          typeof body.trialDays === "number" && body.trialDays >= 1 ? body.trialDays : null;
        if (live) setOffer(days ? { kind: "trial", days } : { kind: "plain" });
      } catch {
        if (live) setOffer({ kind: "none" });
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return offer;
}

function MeetHector({
  name,
  course,
  interests,
  onFinish,
}: {
  name: string;
  course: ProfileCourse;
  interests: Interest[];
  onFinish: (target: FinishTarget) => void;
}) {
  const offer = useTrialOffer();
  const greeting = greetingFor(course, name);
  const title = `${greeting} I'm Hector.`;
  const topics = interests
    .map((i) => INTEREST_CHOICES.find((c) => c.id === i)?.label.toLowerCase())
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  const benefits: { icon: FirstRunIconName; title: string; sub: string }[] = [
    {
      icon: "chat",
      title: "Real conversations",
      sub: topics.length
        ? `About ${listInWords([...topics, "your week"])}`
        : "About anything you like",
    },
    { icon: "brain", title: "He remembers you", sub: "Your level and your weak spots" },
    { icon: "heartc", title: "Kind corrections", sub: "One fix at a time, never a lecture" },
  ];
  return (
    <FirstRunScreen>
      <div className="relative">
        <FirstRunRoom
          room={roomSrc("hotel")}
          figure="/firstrun/hector-talk.webp"
          figureAlt="Hector, Alphonso's friend and tutor"
          size="hero"
          top={
            <span className="absolute left-1/2 top-5 z-[3] -translate-x-1/2 rounded-full bg-ds-action px-3 py-1 ds-type-overline text-ds-on-action">
              Meet your tutor
            </span>
          }
        />
      </div>
      <FirstRunBubble
        title={title}
        sub="When you want to really talk, call me. I remember what you find hard."
        onPlay={canSpeak() ? () => speak(title, "en-US") : undefined}
        playLabel="Hear Hector"
      />
      <ul className="grid gap-2.5 px-4 pt-4">
        {benefits.map((b) => (
          <li
            key={b.title}
            className="flex items-center gap-3 rounded-[var(--ds-radius-control)] border-2 border-ds-line bg-ds-card px-3.5 py-2.5"
          >
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-ds-xp-tint text-ds-xp-text"
            >
              <FirstRunIcon name={b.icon} className="size-[22px]" />
            </span>
            <span>
              <span className="block ds-type-headline text-ds-brand">{b.title}</span>
              <span className="block ds-type-caption font-semibold text-ds-ink-soft">{b.sub}</span>
            </span>
          </li>
        ))}
      </ul>
      <FirstRunFooter
        note={
          offer.kind === "trial" ? (
            <p data-trial-line="" className="pb-1 text-center ds-type-caption text-ds-ink-soft">
              {offer.days} {offer.days === 1 ? "day" : "days"} free, then your plan's price. Cancel
              any time.
            </p>
          ) : null
        }
        label={offer.kind === "trial" ? "Try a free call with Hector" : "See what Hector can do"}
        onClick={() => onFinish("hector")}
        secondary={{ label: "Not now", onClick: () => onFinish("lesson") }}
      />
    </FirstRunScreen>
  );
}
