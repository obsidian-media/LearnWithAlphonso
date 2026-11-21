/** The neutral state of a console page whose identity is still being resolved in the browser. Never the sign-in UI. */
export function ConsolePending() {
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6" aria-busy="true">
      <p role="status" className="text-sm font-semibold text-ds-ink-soft">
        Loading…
      </p>
    </main>
  );
}
