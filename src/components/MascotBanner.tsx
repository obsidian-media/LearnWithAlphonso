import type { MascotMoment } from "../lib/mascot-poses";
import { MascotImage } from "./MascotImage";

/** The pose a banner named only by its mascot shows. */
const MASCOT_MOMENT = {
  alphonso: "learnGreeting",
  hector: "hectorIdle",
} as const satisfies Record<string, MascotMoment>;

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
export function MascotBanner(
  props: { message: string } & (
    | { mascot: "alphonso" | "hector"; moment?: undefined }
    | { moment: MascotMoment; mascot?: undefined }
  ),
) {
  const { message } = props;
  // A moment picks the pose (falling back to the base image until the pose is bundled).
  const moment = props.moment ?? MASCOT_MOMENT[props.mascot!];
  const mascot = moment.startsWith("hector") || moment === "paywall" ? "hector" : "alphonso";
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-ds-brand to-ds-action-edge p-4">
      <MascotImage
        moment={moment}
        size={52}
        tone="sun"
        radius={12}
        alt={MASCOT_NAME[mascot]}
        className="border-2 border-white/60"
      />
      <p className="text-sm font-bold text-primary-foreground">{message}</p>
    </div>
  );
}
