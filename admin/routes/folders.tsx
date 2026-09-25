import { createFileRoute, redirect, useRouter, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { adminListFolders, adminCreateFolder, adminDeleteFolder } from "@/lib/admin.functions";
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
          <FolderRow key={node.id} node={node} depth={0} onDelete={remove} />
        ))}
      </ul>
      <NewFolderForm folders={folders} onDone={() => router.invalidate()} />
    </main>
  );
}

function FolderRow({
  node,
  depth,
  onDelete,
}: {
  node: FolderNode;
  depth: number;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <li className="flex items-center justify-between" style={{ paddingLeft: depth * 16 }}>
        <span>
          <Link to="/folder/$id" params={{ id: node.id }} className="text-moss underline">
            {node.title}
          </Link>{" "}
          <code className="text-ink-soft">/{node.slug}</code>
        </span>
        <button onClick={() => onDelete(node.id)} className="text-sm text-ember">
          Delete
        </button>
      </li>
      {node.children.map((child) => (
        <FolderRow key={child.id} node={child} depth={depth + 1} onDelete={onDelete} />
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
