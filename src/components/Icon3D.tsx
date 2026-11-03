import { icon3dSlug } from "../lib/icon3d";

/**
 * A glossy 3D icon for an emoji (Microsoft Fluent Emoji 3D). It is decorative:
 * the text next to it carries the meaning. An emoji the set doesn't cover falls
 * back to the plain emoji, so nothing is ever blank.
 */
export function Icon3D({
  emoji,
  size,
  className,
}: {
  emoji: string;
  size: number;
  className?: string;
}) {
  const slug = icon3dSlug(emoji);
  if (!slug) {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ fontSize: size * 0.85, lineHeight: 1 }}
      >
        {emoji}
      </span>
    );
  }
  return (
    <img
      src={`/icons3d/${slug}.png`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
