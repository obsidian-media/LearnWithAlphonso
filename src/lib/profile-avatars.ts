/**
 * The 16 preset profile pictures (BACKLOG 0.0-bi): animal friends of Alphonso, painted in the kit style. Presets
 * only, no uploads, so there is nothing to moderate. The choice is stored in profiles.avatar_seed as
 * "animal:<id>", the column friends, leaderboards and study buddies already read. Any other seed (the old random
 * colour seeds) shows initials, which stay the fallback.
 */
export const PROFILE_AVATARS = [
  { id: "llama-rose", label: "Rose llama" },
  { id: "llama-cocoa", label: "Cocoa llama" },
  { id: "alpaca", label: "Alpaca" },
  { id: "fox", label: "Fox" },
  { id: "owl", label: "Owl" },
  { id: "cat", label: "Cat" },
  { id: "panda", label: "Panda" },
  { id: "bear", label: "Bear" },
  { id: "rabbit", label: "Rabbit" },
  { id: "penguin", label: "Penguin" },
  { id: "parrot", label: "Parrot" },
  { id: "koala", label: "Koala" },
  { id: "lion", label: "Lion" },
  { id: "hedgehog", label: "Hedgehog" },
  { id: "corgi", label: "Corgi" },
  { id: "deer", label: "Deer" },
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATARS)[number]["id"];

const PREFIX = "animal:";
const IDS = new Set<string>(PROFILE_AVATARS.map((a) => a.id));

export function avatarSrc(id: ProfileAvatarId): string {
  return `/avatars/animals/${id}.webp`;
}

export function avatarLabel(id: ProfileAvatarId): string {
  return PROFILE_AVATARS.find((a) => a.id === id)?.label ?? id;
}

export function avatarSeedFor(id: ProfileAvatarId): string {
  return `${PREFIX}${id}`;
}

export function parseAvatarSeed(seed: string | null | undefined): ProfileAvatarId | null {
  if (!seed || !seed.startsWith(PREFIX)) return null;
  const id = seed.slice(PREFIX.length);
  return IDS.has(id) ? (id as ProfileAvatarId) : null;
}

/** What the server accepts for avatar_seed: an animal from the list, or a plain colour seed (letters and digits). */
export function isAllowedAvatarSeed(seed: string): boolean {
  if (seed.startsWith(PREFIX)) return parseAvatarSeed(seed) !== null;
  return /^[A-Za-z0-9]{1,32}$/.test(seed);
}

export function initialsFor(name: string | null | undefined): string {
  const first = (name ?? "").trim().slice(0, 1).toUpperCase();
  return first || "?";
}
