import { DsIcon } from "../ds/DsIcon";
import { ProfileAvatar } from "../ds/ProfileAvatar";
import {
  PROFILE_AVATARS,
  avatarSeedFor,
  avatarSrc,
  parseAvatarSeed,
} from "../../lib/profile-avatars";

/**
 * The 16 animal friends of Alphonso, four by four, and the learner's initial as the last choice. Presets only: there
 * is no upload. `value` is an avatar seed ("animal:fox", or any other seed for initials).
 */
export function AvatarPicker({
  value,
  name,
  onChange,
  initialsSeed,
}: {
  value: string | null | undefined;
  name: string;
  onChange: (seed: string) => void;
  /** The seed to use for "My initial" (the learner's old colour seed, kept so their colour does not change). */
  initialsSeed: string;
}) {
  const chosen = parseAvatarSeed(value);
  return (
    <div role="group" aria-label="Profile pictures" className="grid grid-cols-4 gap-2.5">
      {PROFILE_AVATARS.map((a) => {
        const on = chosen === a.id;
        return (
          <button
            key={a.id}
            type="button"
            aria-pressed={on}
            aria-label={a.label}
            onClick={() => onChange(avatarSeedFor(a.id))}
            className={`relative aspect-square rounded-full p-0.5 transition-[box-shadow,transform] duration-[var(--ds-duration-select)] ease-[var(--ds-ease-out)] active:scale-95 motion-reduce:transition-none ${
              on
                ? "shadow-[0_0_0_3px_var(--c-card),0_0_0_6px_var(--c-brand)]"
                : "shadow-[0_0_0_2px_var(--c-line)]"
            }`}
          >
            <img
              src={avatarSrc(a.id)}
              alt=""
              width={96}
              height={96}
              loading="lazy"
              decoding="async"
              className="size-full rounded-full bg-ds-sunk object-cover"
            />
            {on && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 grid size-6 place-items-center rounded-full bg-ds-brand text-ds-card shadow-[0_0_0_2px_var(--c-card)]"
              >
                <DsIcon name="check" className="size-3.5 [stroke-width:3.5]" />
              </span>
            )}
          </button>
        );
      })}
      <button
        type="button"
        aria-pressed={chosen === null}
        aria-label={`My initial, ${(name || "?").slice(0, 1).toUpperCase()}`}
        onClick={() => onChange(initialsSeed)}
        className={`relative aspect-square rounded-full p-0.5 ${
          chosen === null
            ? "shadow-[0_0_0_3px_var(--c-card),0_0_0_6px_var(--c-brand)]"
            : "shadow-[0_0_0_2px_var(--c-line)]"
        }`}
      >
        <ProfileAvatar
          seed={initialsSeed}
          name={name}
          className="size-full"
          textClass="ds-type-title"
        />
      </button>
    </div>
  );
}
