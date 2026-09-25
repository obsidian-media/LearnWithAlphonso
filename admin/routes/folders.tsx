import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  adminListFolders,
  adminCreateFolder,
  adminDeleteFolder,
  adminMoveFolder,
} from "@/lib/admin.functions";
import { buildFolderTree, type FolderNode, type PodcastFolder } from "@/lib/podcast-tree";

export const Route = createFileRoute("/folders")({
  loader: async () => {
    try {
      return { folders: await adminListFolders() };
    } catch {
      throw redirect({ to: "/signin" });
    }
  },
  component: Folders,
});

function Folders() {
  const { folders } = Route.useLoaderData();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="font-display text-2xl font-semibold">Folders</h1>
      {error ? <p className="mt-3 text-sm text-ember">{error}</p> : null}
      <ul className="mt-6 space-y-1">
        {buildFolderTree(folders).map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            folders={folders}
            onDelete={remove}
            onMove={move}
          />
        ))}
      </ul>
      <NewFolderForm folders={folders} onDone={() => router.invalidate()} />
    </main>
  );
}

function FolderRow({
  node,
  depth,
  folders,
  onDelete,
  onMove,
}: {
  node: FolderNode;
  depth: number;
  folders: PodcastFolder[];
  onDelete: (id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
}) {
  return (
    <>
      <li className="flex items-center justify-between gap-3" style={{ paddingLeft: depth * 16 }}>
        <span>
          <Link to="/folder/$id" params={{ id: node.id }} className="text-moss underline">
            {node.title}
          </Link>{" "}
          <code className="text-ink-soft">/{node.slug}</code>
        </span>
        <span className="flex items-center gap-3">
          {/* The parent picker. Until it existed, adminMoveFolder was
              gated, counted and tested but unreachable -- so the cycle
              guard behind it protected nothing a person could actually
              do. The picker deliberately offers EVERY folder, including
              the illegal ones: the server owns that rule and now names
              the loop it found, and a picker that pre-filtered would be
              a second copy of the rule that could disagree with it. */}
          <label className="text-sm text-ink-soft">
            in{" "}
            <select
              value={node.parentId ?? ""}
              onChange={(e) => onMove(node.id, e.target.value || null)}
              className="rounded border border-hairline px-2 py-1"
            >
              <option value="">(root)</option>
              {folders
                .filter((f) => f.id !== node.id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
            </select>
          </label>
          <button onClick={() => onDelete(node.id)} className="text-sm text-ember">
            Delete
          </button>
        </span>
      </li>
      {node.children.map((child) => (
        <FolderRow
          key={child.id}
          node={child}
          depth={depth + 1}
          folders={folders}
          onDelete={onDelete}
          onMove={onMove}
        />
      ))}
    </>
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
    <form onSubmit={submit} className="mt-8 space-y-3 border-t border-hairline pt-6">
      <h2 className="font-semibold">New folder</h2>
      <select
        value={parentId}
        onChange={(e) => setParentId(e.target.value)}
        className="w-full rounded border border-hairline px-3 py-2"
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
        className="w-full rounded border border-hairline px-3 py-2"
      />
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        placeholder="slug-in-kebab-case"
        required
        className="w-full rounded border border-hairline px-3 py-2"
      />
      <button type="submit" className="rounded bg-moss px-3 py-2 text-surface">
        Create
      </button>
      {error ? <p className="text-sm text-ember">{error}</p> : null}
    </form>
  );
}
