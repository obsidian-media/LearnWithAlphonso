/**
 * App Store Connect version states in which the version page is editable and can be
 * (re)submitted. A version the developer removed from review sits in DEVELOPER_REJECTED:
 * editable, but invisible to a PREPARE_FOR_SUBMISSION-only filter, which is what every
 * save-only script used to apply.
 */
export const EDITABLE_VERSION_STATES = [
  "PREPARE_FOR_SUBMISSION",
  "DEVELOPER_REJECTED",
  "REJECTED",
  "METADATA_REJECTED",
] as const;

export type AscVersionLike = {
  id: string;
  attributes?: { versionString?: string; appVersionState?: string };
};

export function editableVersionQuery(): string {
  return `filter[appVersionState]=${EDITABLE_VERSION_STATES.join(",")}`;
}

export function pickEditableVersion<T extends AscVersionLike>(
  versions: T[],
  versionString = "1.0",
): T {
  const editable = versions.filter(
    (v) =>
      v.attributes?.versionString === versionString &&
      (EDITABLE_VERSION_STATES as readonly string[]).includes(v.attributes?.appVersionState ?? ""),
  );
  if (editable.length === 0) {
    const seen = versions
      .map((v) => `${v.attributes?.versionString}:${v.attributes?.appVersionState}`)
      .join(", ");
    throw new Error(`No editable ${versionString} version (seen: ${seen || "none"}).`);
  }
  if (editable.length > 1)
    throw new Error(`More than one editable ${versionString} version; refusing to guess.`);
  return editable[0];
}

export type AscAppInfoLike = {
  id: string;
  attributes?: { state?: string; appStoreState?: string };
};

/**
 * The appInfo whose localizations (name, subtitle) can still be edited. A never-released app has
 * one; after a release there are two and only the draft one is editable. Apple reports the state
 * under `state` or `appStoreState` depending on the API version, so either is read.
 */
export function pickEditableAppInfo<T extends AscAppInfoLike>(infos: T[]): T {
  const editable = infos.filter((i) =>
    (EDITABLE_VERSION_STATES as readonly string[]).includes(
      i.attributes?.state ?? i.attributes?.appStoreState ?? "",
    ),
  );
  if (editable.length === 0) {
    const seen = infos.map((i) => i.attributes?.state ?? i.attributes?.appStoreState).join(", ");
    throw new Error(`No editable appInfo (seen: ${seen || "none"}).`);
  }
  if (editable.length > 1) throw new Error("More than one editable appInfo; refusing to guess.");
  return editable[0];
}
