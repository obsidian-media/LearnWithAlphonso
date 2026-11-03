import { motion, useReducedMotion } from "framer-motion";
import { figureSrc, type Figure } from "@/lib/scenes";

/**
 * A full-body character standing in a scene: the cut-out on a soft ground shadow, breathing at rest
 * (`.mascot-breathe`, off under Reduce Motion) and, with `enter`, springing up into place.
 */
export function StandingFigure({
  figure,
  alt,
  height,
  enter = false,
  className = "",
}: {
  figure: Figure;
  alt: string;
  height: number;
  enter?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const spring = enter && !reduce;
  return (
    <motion.div
      data-figure={figure}
      className={`relative flex flex-col items-center ${className}`}
      style={{ height }}
      initial={spring ? { opacity: 0, y: 40, scale: 0.9 } : false}
      animate={spring ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={spring ? { type: "spring", stiffness: 220, damping: 18, delay: 0.1 } : undefined}
    >
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-1/2 h-[7%] w-[70%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-md"
      />
      <div className={`relative h-full ${reduce ? "" : "mascot-breathe"}`}>
        <img
          src={figureSrc(figure)}
          alt={alt}
          decoding="async"
          className="h-full w-auto max-w-none drop-shadow-[0_12px_14px_rgba(0,0,0,0.35)]"
        />
      </div>
    </motion.div>
  );
}
