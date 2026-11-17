import type { ReactNode } from "react";
import { dsButtonClass } from "@/components/ds/buttons";

/**
 * The page behind "not found" and "this page didn't load": the app's surface and tokens, Alphonso, one plain line,
 * and the way back. Plain anchors, not router links, because the error page renders when the router itself may be
 * in a bad state, and a full load of "/" is the reliable way out.
 */
export function StatusPage({
  kind,
  image,
  title,
  body,
  code,
  children,
}: {
  kind: "not-found" | "error";
  image: string;
  title: string;
  body: string;
  /** A short code shown above the title ("404"). */
  code?: string;
  children?: ReactNode;
}) {
  return (
    <main
      id="main-content"
      data-status-page={kind}
      className="grain flex min-h-dvh items-center justify-center bg-ds-surface px-6 py-10 text-ds-ink"
    >
      <div className="grid w-full max-w-[430px] justify-items-center gap-3 text-center">
        <img
          src={image}
          alt=""
          height={220}
          className="h-[220px] w-auto"
          draggable={false}
          data-status-art=""
        />
        {code ? <div className="ds-type-overline text-ds-action-text">{code}</div> : null}
        <h1 className="m-0 font-display ds-type-display text-ds-ink">{title}</h1>
        <p className="m-0 ds-type-footnote font-medium text-ds-ink-soft">{body}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {children}
          <a href="/" className={dsButtonClass(children ? "secondary" : "primary")}>
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
