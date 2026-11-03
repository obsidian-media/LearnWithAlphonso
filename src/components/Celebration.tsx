import { useEffect, useState } from "react";

const COLOURS = ["#f2b51c", "#e4573f", "#1f9d63", "#3b82f6", "#a855f7", "#ffffff"];
const PIECES = 34;

/**
 * A one-off confetti burst over the lesson-complete stage: CSS-animated pieces falling and spinning, laid out from
 * a fixed pattern (no randomness, so renders are stable). Decorative; callers leave it out under Reduce Motion.
 */
export function Confetti() {
  return (
    <div
      data-confetti
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {Array.from({ length: PIECES }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 9) * 0.09;
        const duration = 1.6 + ((i * 7) % 10) / 10;
        const size = 6 + (i % 4) * 2;
        return (
          <span
            key={i}
            className="confetti-piece absolute top-0 block rounded-[2px]"
            style={{
              left: `${left}%`,
              width: size,
              height: size * 0.45,
              background: COLOURS[i % COLOURS.length],
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
            }}
          />
        );
      })}
    </div>
  );
}

const STEPS = 24;
const STEP_MS = 32;

/**
 * Counts the number inside a chip value ("+100", "12", "92%") up from zero, keeping its prefix and suffix, over
 * about 0.8 s. With `animate` off it shows the final value straight away.
 */
export function CountUp({ value, animate }: { value: string; animate: boolean }) {
  const m = /^(\D*)(\d+)(\D*)$/.exec(value);
  const target = m ? Number(m[2]) : 0;
  const [shown, setShown] = useState(animate && m ? 0 : target);

  useEffect(() => {
    if (!animate || !m) return;
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      setShown(Math.round((target * step) / STEPS));
      if (step >= STEPS) clearInterval(id);
    }, STEP_MS);
    return () => clearInterval(id);
    // The value is fixed for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!m) return <>{value}</>;
  return (
    <>
      {m[1]}
      {shown}
      {m[3]}
    </>
  );
}
