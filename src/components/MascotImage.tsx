import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { mascotArt, type MascotMoment } from "../lib/mascot-poses";
import { TILE_TONE_CLASSES, type TileTone } from "../lib/tile-tones";

/**
 * A mascot pose on a coloured tile, with the app's small motion: it breathes slowly at rest, can spring in when the
 * screen opens (`enter`), and cross-fades when the moment's pose changes. Reduce Motion turns off the spring and the
 * breathing (here and in styles.css); a pose change is then a plain cut.
 */
export function MascotImage({
  moment,
  size,
  tone,
  alt,
  enter = false,
  radius = 28,
  className = "",
}: {
  moment: MascotMoment;
  size: number;
  tone: TileTone;
  /** "" for a decorative mascot next to text that already says it. */
  alt: string;
  enter?: boolean;
  radius?: number;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const art = mascotArt(moment);
  return (
    <motion.div
      data-mascot-tile=""
      className={`relative shrink-0 overflow-hidden ${TILE_TONE_CLASSES[tone]} ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
      initial={enter && !reduce ? { scale: 0.85, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 18 }}
    >
      <div className={reduce ? "size-full" : "mascot-breathe size-full"}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.img
            key={art.src}
            src={art.src}
            alt={alt}
            width={size}
            height={size}
            decoding="async"
            draggable={false}
            className="size-full object-contain object-bottom"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
