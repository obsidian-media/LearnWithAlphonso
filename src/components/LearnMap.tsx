import { Icon3D } from "./Icon3D";
import type { UnitPathNode } from "@/lib/unit-path";

/** Where each node sits on the garden path, from the bottom up: [left %, bottom px]. */
const SPOTS: [number, number][] = [
  [26, 6],
  [46, 96],
  [24, 180],
  [44, 254],
  [26, 320],
];

/** Tall enough that the sheet below starts under Alphonso's feet in the clip on a phone. */
const MAP_MIN_HEIGHT = 500;

const NODE_CLASSES: Record<UnitPathNode["state"], string> = {
  done: "size-[72px] bg-[radial-gradient(circle_at_35%_30%,#8ff0bf,#1f9d63)] shadow-[0_7px_0_0_#0f6a40,0_14px_22px_rgba(0,0,0,0.3)]",
  next: "size-[92px] bg-[radial-gradient(circle_at_35%_30%,#ffb199,#e4573f)] shadow-[0_8px_0_0_#a8341f,0_0_0_10px_rgba(255,255,255,0.45),0_0_40px_10px_rgba(255,211,106,0.6)] map-node-bounce",
  locked:
    "size-[72px] bg-[radial-gradient(circle_at_35%_30%,#f4f1ea,#c7c2b6)] shadow-[0_6px_0_0_#9d978a,0_12px_20px_rgba(0,0,0,0.25)]",
};

const NODE_ICON: Record<UnitPathNode["state"], string> = {
  done: "📚",
  next: "🎯",
  locked: "🔒",
};

/**
 * The current unit as a map on the Learn scene: big 3D nodes climbing the garden path, the next lesson largest and
 * glowing. Alphonso himself waves in the scene's clip, to the right of the nodes, with his greeting in a
 * `SpeechBubble` pinned above him (SceneBackdrop `pin`); here the greeting is only words for screen readers. A
 * picture of the path: the Continue card above and the unit list below are the controls, so the nodes are not links.
 */
export function LearnMap({ nodes, greeting }: { nodes: UnitPathNode[]; greeting: string }) {
  const shown = nodes.slice(0, SPOTS.length);
  // A level with every lesson done has no nodes left to draw: Alphonso and the greeting still stand there.
  const height = shown.length > 0 ? SPOTS[shown.length - 1][1] + 120 : 0;
  return (
    <div data-learn-map className="relative" style={{ height: Math.max(height, MAP_MIN_HEIGHT) }}>
      <p className="sr-only">Alphonso: {greeting}</p>
      <div aria-hidden="true">
        {shown.map((n, i) => {
          const [left, bottom] = SPOTS[i];
          return (
            <div
              key={n.id}
              data-node={n.state}
              className={`absolute grid -translate-x-1/2 place-items-center rounded-full ${NODE_CLASSES[n.state]}`}
              style={{ left: `${left}%`, bottom }}
            >
              <Icon3D
                emoji={NODE_ICON[n.state]}
                size={n.state === "next" ? 52 : 40}
                className={n.state === "locked" ? "opacity-55 grayscale" : ""}
              />
            </div>
          );
        })}
      </div>
      {/* Where Alphonso stands in the clip: kept clear of nodes, and named for screen readers. */}
      <div
        role="img"
        aria-label="Alphonso, waving"
        className="absolute bottom-0 right-0 h-[260px] w-[42%]"
      />
    </div>
  );
}

/** Alphonso's speech bubble, drawn on the Learn clip above his head (its tail points down at him). */
export function SpeechBubble({ text }: { text: string }) {
  return (
    <p className="relative mb-3 w-[min(220px,52vw)] rounded-2xl bg-surface px-3.5 py-2.5 text-center font-display text-[15px] font-bold leading-snug text-ink shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
      {text}
      <span className="absolute -bottom-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-surface" />
    </p>
  );
}
