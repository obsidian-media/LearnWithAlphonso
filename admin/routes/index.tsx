import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl font-semibold">Alphonso Admin</h1>
      <p className="mt-2 text-ink-soft">Podcast library management.</p>
    </main>
  );
}
