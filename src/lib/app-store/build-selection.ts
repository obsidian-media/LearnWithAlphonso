export type AscBuild = {
  id: string;
  attributes: { version: string; processingState: string; expired: boolean };
};

function numeric(b: AscBuild): number {
  if (!/^\d+$/.test(b.attributes.version))
    throw new Error(`non-numeric build version "${b.attributes.version}"`);
  return Number(b.attributes.version);
}

/** Builds to expire: every non-expired build numbered at or below maxVersion, newest first. */
export function buildsToExpire(builds: AscBuild[], maxVersion: number): AscBuild[] {
  return builds
    .filter((b) => !b.attributes.expired)
    .filter((b) => numeric(b) <= maxVersion)
    .sort((a, z) => numeric(z) - numeric(a));
}

/**
 * Old builds are expired only once a newer build is VALID in TestFlight, so testers are never
 * left without an installable build. Returns that newer build, or throws.
 */
export function requireNewerValidBuild(builds: AscBuild[], maxVersion: number): AscBuild {
  const newer = builds.find(
    (b) =>
      /^\d+$/.test(b.attributes.version) &&
      Number(b.attributes.version) > maxVersion &&
      b.attributes.processingState === "VALID" &&
      !b.attributes.expired,
  );
  if (!newer)
    throw new Error(`No valid build newer than ${maxVersion}; refusing to expire anything.`);
  return newer;
}

/** The exact build to attach to the version. Never "the latest". */
export function findBuild(builds: AscBuild[], version: number): AscBuild {
  const hit = builds.find(
    (b) => /^\d+$/.test(b.attributes.version) && Number(b.attributes.version) === version,
  );
  if (!hit) throw new Error(`build ${version} not found`);
  if (hit.attributes.processingState !== "VALID")
    throw new Error(`build ${version} is ${hit.attributes.processingState}`);
  if (hit.attributes.expired) throw new Error(`build ${version} is expired`);
  return hit;
}

/**
 * Version states in which the version page, or the store, still depends on its attached build. A build
 * attached to a version in any of these must never be expired.
 */
export const BUILD_PROTECTING_VERSION_STATES = [
  "PREPARE_FOR_SUBMISSION",
  "WAITING_FOR_REVIEW",
  "IN_REVIEW",
  "PENDING_DEVELOPER_RELEASE",
  "PENDING_APPLE_RELEASE",
  "PROCESSING_FOR_DISTRIBUTION",
  "REJECTED",
  "METADATA_REJECTED",
  "DEVELOPER_REJECTED",
  "READY_FOR_SALE",
] as const;

export type VersionBuild = { versionString?: string; state?: string; buildId: string | null };

/** One problem per expiry target that an editable, in-review or live version has attached. */
export function attachedBuildProblems(targets: AscBuild[], versions: VersionBuild[]): string[] {
  const problems: string[] = [];
  for (const target of targets) {
    for (const v of versions) {
      if (v.buildId !== target.id) continue;
      if (!(BUILD_PROTECTING_VERSION_STATES as readonly string[]).includes(v.state ?? "")) continue;
      problems.push(
        `build ${target.attributes.version} is attached to version ${v.versionString ?? "?"} (${v.state}); refusing to expire it`,
      );
    }
  }
  return problems;
}

/** The build attached to the version being submitted: exactly the expected one, else above the old range. */
export function attachedBuildNumberProblem(
  attached: string,
  expected: string,
  floor = 49,
): string | null {
  if (!attached) return "no build is attached";
  if (!/^\d+$/.test(attached)) return `attached build "${attached}" is not a plain number`;
  if (expected)
    return attached === expected ? null : `attached build is ${attached}, expected ${expected}`;
  return Number(attached) > floor
    ? null
    : `attached build ${attached} is not greater than ${floor}`;
}
