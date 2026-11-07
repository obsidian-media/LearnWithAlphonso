import { avatarLabel, avatarSrc, initialsFor, parseAvatarSeed } from "@/lib/profile-avatars";

/** Initials sit on one of these token colours, picked by the seed, so a list of learners is not one colour. */
const INITIAL_TONES = [
  "bg-ds-choice text-ds-card",
  "bg-ds-brand text-ds-card",
  "bg-ds-right text-ds-on-right",
  "bg-ds-heart text-ds-card",
  "bg-ds-action text-ds-on-action",
  "bg-ds-flame text-ds-card",
] as const;

function toneFor(seed: string | null | undefined): string {
  const code = (seed || "a").charCodeAt(0);
  return INITIAL_TONES[code % INITIAL_TONES.length];
}

/**
 * A learner's picture: one of the 16 preset animals when they chose one (profiles.avatar_seed "animal:<id>"),
 * otherwise their initial. Decorative by default: the learner's name is always written next to it.
 */
export function ProfileAvatar({
  seed,
  name,
  className = "size-9",
  textClass = "ds-type-footnote",
  label,
}: {
  seed: string | null | undefined;
  name: string | null | undefined;
  /** Size (and any ring); a square. */
  className?: string;
  /** The initial's type style. */
  textClass?: string;
  /** Give it an accessible name only where the picture stands alone. */
  label?: string;
}) {
  const animal = parseAvatarSeed(seed);
  if (animal) {
    return (
      <img
        src={avatarSrc(animal)}
        alt={label ?? ""}
        title={label ? undefined : avatarLabel(animal)}
        data-avatar={animal}
        width={64}
        height={64}
        loading="lazy"
        decoding="async"
        className={`shrink-0 rounded-full bg-ds-sunk object-cover ${className}`}
      />
    );
  }
  return (
    <span
      data-avatar="initials"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`grid shrink-0 place-items-center rounded-full font-extrabold ${toneFor(seed)} ${textClass} ${className}`}
    >
      {initialsFor(name)}
    </span>
  );
}
