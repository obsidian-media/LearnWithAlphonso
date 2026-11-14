import type { ReactNode } from "react";
import { MobileFrame } from "@/components/AppShell";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import type { Scene } from "@/lib/scenes";

/** A screen on a painted scene: the app shell, the scene behind it and the column the content sits in. */
export function DsScreen({ scene, children }: { scene: Scene; children: ReactNode }) {
  return (
    <MobileFrame>
      <SceneBackdrop scene={scene} />
      <div className="relative z-10 grid content-start gap-3.5 px-4 pb-24 pt-2">{children}</div>
    </MobileFrame>
  );
}
