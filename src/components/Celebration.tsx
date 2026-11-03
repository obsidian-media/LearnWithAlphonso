import { useEffect, useState } from "react";

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
