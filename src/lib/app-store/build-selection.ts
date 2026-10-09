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
