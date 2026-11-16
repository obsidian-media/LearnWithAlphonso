import { useState } from "react";
import { buildFolderTree, type FolderNode, type PodcastFolder } from "../../lib/podcast-tree";
import { ConfirmDialog } from "./ConfirmDialog";
import { DangerButton } from "./console-ui";

/**
 * The folder tree with its parent pickers and Delete. Delete asks first (it used to act on one tap): the folder is
 * only deleted from the confirm box, and Cancel leaves everything as it was. The server still refuses a folder that
 * has episodes.
 */
export function FolderList({
  folders,
  onMove,
  onDelete,
}: {
  folders: PodcastFolder[];
  onMove: (id: string, parentId: string | null) => void;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState<PodcastFolder | null>(null);
  return (
    <>
      <ul className="mt-4 overflow-hidden rounded-2xl border border-ds-line bg-ds-card">
        {buildFolderTree(folders).map((node) => (
          <FolderRow
            key={node.id}
            node={node}
            depth={0}
            folders={folders}
            onDelete={(id) => setDeleting(folders.find((f) => f.id === id) ?? null)}
            onMove={onMove}
          />
        ))}
      </ul>
      {deleting ? (
        <ConfirmDialog
          title={`Delete the folder \u201c${deleting.title}\u201d?`}
          body="A folder that still has episodes cannot be deleted. This cannot be undone."
          confirmLabel="Delete folder"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            onDelete(id);
          }}
        />
      ) : null}
    </>
  );
}

export function FolderRow({
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
      <li className="grid gap-1.5 border-t border-ds-line px-4 py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
        <span style={{ paddingLeft: depth * 16 }} className="min-w-0 font-bold text-ds-ink">
          <a href={`/folder/${node.id}`} className="text-ds-choice underline">
            {node.title}
          </a>{" "}
          <code className="text-xs font-medium text-ds-ink-soft">/{node.slug}</code>
        </span>
        {/* The parent picker. Until it existed, adminMoveFolder was
            gated, counted and tested but unreachable -- so the cycle
            guard behind it protected nothing a person could actually
            do. The picker deliberately offers EVERY folder, including
            the illegal ones: the server owns that rule and now names
            the loop it found, and a picker that pre-filtered would be
            a second copy of the rule that could disagree with it. */}
        <div
          style={{ paddingLeft: depth * 16 }}
          className="flex items-center gap-2 text-sm text-ds-ink-soft sm:pl-0"
        >
          <span>in</span>
          <select
            aria-label={`Parent of ${node.title}`}
            value={node.parentId ?? ""}
            onChange={(e) => onMove(node.id, e.target.value || null)}
            className="min-h-9 min-w-0 flex-1 rounded-xl border border-ds-line bg-ds-card px-2 py-1 font-bold text-ds-ink sm:min-w-[150px] sm:flex-none"
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
          <DangerButton onClick={() => onDelete(node.id)}>Delete</DangerButton>
        </div>
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
