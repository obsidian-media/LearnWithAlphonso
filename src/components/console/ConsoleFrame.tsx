import { useEffect, useRef, useState, type ReactNode } from "react";
import type { NavCounts } from "../../lib/staff-home.functions";
import { NAV_ITEMS } from "../../lib/staff-nav";
import { ConsoleShell, type ShellMe } from "./ConsoleShell";

export type ConsoleIdentity = { me: ShellMe; counts: NavCounts | null };

/**
 * The frame around every admin page. WHO is signed in is resolved on the CLIENT: the person's Supabase session lives in
 * the browser, so a server render (and a loader that ran there) has no bearer token and could never tell. The first
 * paint is therefore a skeleton rail (no flash of a page with no menu); once the session is read, `loadIdentity`
 * (adminWhoAmI + the rail's counts) fills the real rail. A signed-out visitor, or anyone who is not staff, gets the
 * bare page (the pages gate themselves). It reads again when the route changes while no one is known (sign-in, then
 * Home) and when the auth session changes. The sign-in page never asks and never shows the skeleton.
 */
export function ConsoleFrame({
  pathname,
  loadIdentity,
  subscribeAuth,
  onSignOut,
  children,
}: {
  pathname: string;
  loadIdentity: () => Promise<ConsoleIdentity>;
  /** Calls back on a sign-in or sign-out; returns the unsubscribe. */
  subscribeAuth: (onChange: (event: "in" | "out") => void) => () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<
    { status: "loading" } | { status: "none" } | ({ status: "ready" } & ConsoleIdentity)
  >({ status: "loading" });
  const asking = useRef(false);
  const onSignin = pathname === "/signin" || pathname.startsWith("/signin/");

  async function resolve() {
    if (asking.current) return;
    asking.current = true;
    try {
      const identity = await loadIdentity();
      setState({ status: "ready", ...identity });
    } catch {
      setState({ status: "none" });
    } finally {
      asking.current = false;
    }
  }

  useEffect(() => {
    if (onSignin) {
      if (state.status === "loading") setState({ status: "none" });
      return;
    }
    if (state.status !== "ready") void resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-ask when the page changes while no one is known
  }, [pathname]);

  useEffect(
    () =>
      subscribeAuth((event) => {
        if (event === "out") setState({ status: "none" });
        else void resolve();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
    [],
  );

  if (state.status === "ready") {
    return (
      <ConsoleShell
        me={state.me}
        counts={state.counts}
        current={currentKey(pathname)}
        onSignOut={onSignOut}
      >
        {children}
      </ConsoleShell>
    );
  }
  if (state.status === "loading" && !onSignin) {
    return (
      <div className="min-h-dvh md:flex md:items-start">
        <aside
          data-rail-skeleton=""
          aria-hidden="true"
          className="sticky top-0 hidden h-dvh w-60 flex-none border-r border-ds-line bg-ds-card md:block"
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Which rail item a path belongs to ("home" for /). */
export function currentKey(pathname: string): string | undefined {
  if (pathname === "/") return "home";
  return NAV_ITEMS.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))?.key;
}
