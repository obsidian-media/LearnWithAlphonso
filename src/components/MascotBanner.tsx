const MASCOT_SRC = {
  alphonso: "/mascots/alphonso.png",
  hector: "/mascots/hector.png",
} as const;

const MASCOT_NAME = {
  alphonso: "Alphonso",
  hector: "Hector",
} as const;

/**
 * A mascot portrait + a short message on a moss->moss-deep gradient --
 * the web equivalent of iOS's AlphonsoMascotBanner (see
 * docs/superpowers/specs/2026-09-24-canopy-web-port-design.md). Not
 * Canopy-conditional -- every theme's own moss/moss-deep renders here,
 * same as every other moss-colored surface in this app.
 */
export function MascotBanner({
  mascot,
  message,
}: {
  mascot: "alphonso" | "hector";
  message: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-moss to-moss-deep p-4">
      <img
        src={MASCOT_SRC[mascot]}
        alt={MASCOT_NAME[mascot]}
        className="size-13 shrink-0 rounded-xl border-2 border-white/60 object-cover"
      />
      <p className="text-sm font-bold text-primary-foreground">{message}</p>
    </div>
  );
}
