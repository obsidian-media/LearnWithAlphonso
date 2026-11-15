import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  adminListFolders,
  adminCreateFolder,
  adminDeleteFolder,
  adminMoveFolder,
  adminWhoAmI,
} from "@/lib/admin.functions";
import type { PodcastFolder } from "@/lib/podcast-tree";
import { forbiddenOrSignIn } from "@/lib/staff-forbidden";
import { FolderList } from "@/components/staff/FolderList";
import { ConsoleCard } from "@/components/staff/ConsoleCard";
import { ForbiddenCard } from "@/components/staff/ForbiddenCard";
import { EmptyCard, ErrorLine, FIELD, SmallButton } from "@/components/staff/console-ui";

export const Route = createFileRoute("/folders")({
  loader: async () => {
    try {
      const me = await adminWhoAmI();
      if (!me.scopes.includes("podcasts.manage")) return { forbidden: true as const };
      return { forbidden: false as const, folders: await adminListFolders() };
    } catch (e) {
      // A signed-in person without the scope is told why; a signed-out person goes to sign in.
      return forbiddenOrSignIn(e, "podcasts.manage");
    }
  },
  component: Folders,
});

function Folders() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  if (data.forbidden) return <ForbiddenCard title="Folders" scope="podcasts.manage" />;
  const { folders } = data;

  async function move(id: string, parentId: string | null) {
    setError(null);
    try {
      await adminMoveFolder({ data: { id, parentId } });
      router.invalidate();
    } catch (e) {
      // The server names the loop it found, so this is shown verbatim
      // rather than replaced with "move failed".
      setError(e instanceof Error ? e.message : "Move failed.");
      router.invalidate();
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await adminDeleteFolder({ data: { id } });
      router.invalidate();
    } catch (e) {
      // The server's refusals are written to be read by a person --
      // "Delete this folder's episodes first." -- so they are shown
      // verbatim rather than replaced with a generic failure.
      setError(e instanceof Error ? e.message : "Delete failed.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="font-display text-2xl font-semibold text-ds-ink">Folders</h1>
      <p className="ds-type-footnote mt-1 text-ds-ink-soft">
        Podcast folders. Open one to manage its episodes.
      </p>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      {folders.length === 0 ? (
        <EmptyCard title="No folders yet." hint="Create the first one below." />
      ) : (
        <FolderList folders={folders} onMove={move} onDelete={remove} />
      )}
      <NewFolderForm folders={folders} onDone={() => router.invalidate()} />
    </main>
  );
}

function NewFolderForm({ folders, onDone }: { folders: PodcastFolder[]; onDone: () => void }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await adminCreateFolder({
        data: { parentId: parentId || null, slug, title, description: null, sortOrder: 0 },
      });
      setSlug("");
      setTitle("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    }
  }

  return (
    <ConsoleCard title="New folder" className="mt-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          aria-label="Parent folder"
          className={FIELD}
        >
          <option value="">(root)</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
          className={FIELD}
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug-in-kebab-case"
          required
          className={FIELD}
        />
        <div className="sm:col-span-3">
          <SmallButton type="submit" variant="primary" className="!min-h-10 !px-5">
            Create
          </SmallButton>
        </div>
        {error ? <ErrorLine>{error}</ErrorLine> : null}
      </form>
    </ConsoleCard>
  );
}
