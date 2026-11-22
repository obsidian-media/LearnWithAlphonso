import { useState, type ReactNode } from "react";
import { LEVELS } from "../../../data/levels";
import { isValidSlug } from "../../../lib/podcast-tree";
import { FIELD_CLASS, FieldsDialog } from "./FieldsDialog";
import type { AdminFolder, NewEpisodeInput } from "./podcastApi";
import { slugFromTitle } from "./podcastFormat";

type Common = { busy: boolean; error: string | null; onCancel: () => void };

const AUDIO_ACCEPT = "audio/mpeg,audio/mp4";
const COURSES = { en: "English", fr: "French", es: "Spanish" } as const;

const Label = ({ text, children }: { text: string; children: ReactNode }) => (
  <label className="block text-sm">
    <span className="font-semibold text-ds-ink">{text}</span>
    <span className="mt-1 block">{children}</span>
  </label>
);

/** Parent choices, indented by depth, in tree order. `skip` leaves out a folder (and what is under it) for a move. */
export function FolderOptions({
  folders,
  skip,
}: {
  folders: readonly { folder: AdminFolder; depth: number }[];
  skip?: ReadonlySet<string>;
}) {
  return (
    <>
      {folders
        .filter(({ folder }) => !skip?.has(folder.id))
        .map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {" ".repeat(depth)}
            {folder.title}
          </option>
        ))}
    </>
  );
}

export function NewFolderDialog({
  folders,
  defaultParent,
  onSubmit,
  ...common
}: Common & {
  folders: readonly { folder: AdminFolder; depth: number }[];
  defaultParent: string | null;
  onSubmit: (
    input: { parentId: string | null; slug: string; title: string },
    reason: string,
  ) => void;
}) {
  const [parentId, setParentId] = useState(defaultParent ?? "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const shownSlug = slugTouched ? slug : slugFromTitle(title);
  return (
    <FieldsDialog
      title="New folder"
      description="Group episodes into a series."
      confirmLabel="Create folder"
      valid={title.trim().length > 0 && isValidSlug(shownSlug)}
      {...common}
      onSubmit={(reason) =>
        onSubmit({ parentId: parentId || null, slug: shownSlug, title: title.trim() }, reason)
      }
    >
      <Label text="Inside">
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">(top level)</option>
          <FolderOptions folders={folders} />
        </select>
      </Label>
      <Label text="Folder name">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={FIELD_CLASS}
        />
      </Label>
      <Label text="Slug (lowercase, hyphens; part of every audio path inside)">
        <input
          value={shownSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          maxLength={80}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </Label>
    </FieldsDialog>
  );
}

export function RenameFolderDialog({
  folder,
  onSubmit,
  ...common
}: Common & {
  folder: AdminFolder;
  onSubmit: (title: string, description: string | null, reason: string) => void;
}) {
  const [title, setTitle] = useState(folder.title);
  const [description, setDescription] = useState(folder.description ?? "");
  return (
    <FieldsDialog
      title="Rename folder"
      description="Name and description only. The slug stays, because it is part of every audio path inside."
      confirmLabel="Save"
      valid={title.trim().length > 0}
      {...common}
      onSubmit={(reason) => onSubmit(title.trim(), description.trim() || null, reason)}
    >
      <Label text="Folder name">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={FIELD_CLASS}
        />
      </Label>
      <Label text="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={2}
          className={FIELD_CLASS}
        />
      </Label>
    </FieldsDialog>
  );
}

export function MoveFolderDialog({
  folder,
  folders,
  blocked,
  onSubmit,
  ...common
}: Common & {
  folder: AdminFolder;
  folders: readonly { folder: AdminFolder; depth: number }[];
  /** The folder itself and everything under it: it cannot move into any of them. */
  blocked: ReadonlySet<string>;
  onSubmit: (parentId: string | null, reason: string) => void;
}) {
  const [parentId, setParentId] = useState(folder.parentId ?? "");
  return (
    <FieldsDialog
      title={`Move “${folder.title}”`}
      confirmLabel="Move"
      valid={(parentId || null) !== folder.parentId}
      {...common}
      onSubmit={(reason) => onSubmit(parentId || null, reason)}
    >
      <Label text="Move inside">
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">(top level)</option>
          <FolderOptions folders={folders} skip={blocked} />
        </select>
      </Label>
    </FieldsDialog>
  );
}

export function DeleteFolderDialog({
  folder,
  onSubmit,
  ...common
}: Common & { folder: AdminFolder; onSubmit: (reason: string) => void }) {
  const [typed, setTyped] = useState("");
  return (
    <FieldsDialog
      title={`Delete “${folder.title}”`}
      description="Deletes the folder. It must be empty: move or delete its subfolders and episodes first. This cannot be undone."
      confirmLabel="Delete folder"
      danger
      valid={typed === folder.title}
      {...common}
      onSubmit={onSubmit}
    >
      <Label text="Type the folder name to confirm">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </Label>
    </FieldsDialog>
  );
}

export function NewEpisodeDialog({
  folder,
  onSubmit,
  ...common
}: Common & {
  folder: AdminFolder;
  onSubmit: (input: NewEpisodeInput, file: File, reason: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [course, setCourse] = useState("");
  const [levelId, setLevelId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const shownSlug = slugTouched ? slug : slugFromTitle(title);
  return (
    <FieldsDialog
      title="New episode"
      description={`Adds an episode to “${folder.title}” from an audio file. It starts unpublished.`}
      confirmLabel="Create episode"
      valid={title.trim().length > 0 && isValidSlug(shownSlug) && file !== null}
      {...common}
      onSubmit={(reason) => {
        if (!file) return;
        onSubmit(
          {
            folderId: folder.id,
            slug: shownSlug,
            title: title.trim(),
            description: description.trim() || null,
            course: (course || null) as NewEpisodeInput["course"],
            levelId: levelId || null,
          },
          file,
          reason,
        );
      }}
    >
      <Label text="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={common.busy}
          className={FIELD_CLASS}
        />
      </Label>
      <Label text="Slug (lowercase, hyphens)">
        <input
          value={shownSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          maxLength={80}
          autoComplete="off"
          disabled={common.busy}
          className={FIELD_CLASS}
        />
      </Label>
      <Label text="Description (optional)">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={4000}
          rows={2}
          disabled={common.busy}
          className={FIELD_CLASS}
        />
      </Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label text="Language (optional)">
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value)}
            disabled={common.busy}
            className={FIELD_CLASS}
          >
            <option value="">Not set</option>
            {Object.entries(COURSES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </Label>
        <Label text="Level (optional)">
          <select
            value={levelId}
            onChange={(e) => setLevelId(e.target.value)}
            disabled={common.busy}
            className={FIELD_CLASS}
          >
            <option value="">Not set</option>
            {LEVELS.map((level) => (
              <option key={level.id} value={level.id}>
                {level.id} · {level.name}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <Label text="Audio file (MP3 or M4A)">
        <input
          type="file"
          accept={AUDIO_ACCEPT}
          disabled={common.busy}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="min-h-11 w-full text-sm text-ds-ink"
        />
      </Label>
    </FieldsDialog>
  );
}

export function ReplaceAudioDialog({
  episodeTitle,
  file,
  onSubmit,
  ...common
}: Common & { episodeTitle: string; file: File; onSubmit: (reason: string) => void }) {
  return (
    <FieldsDialog
      title="Replace audio"
      description={`Replaces the audio of “${episodeTitle}” with ${file.name}. The new file is checked first; if it is not real audio nothing changes.`}
      confirmLabel="Upload and replace"
      valid
      {...common}
      onSubmit={onSubmit}
    />
  );
}
