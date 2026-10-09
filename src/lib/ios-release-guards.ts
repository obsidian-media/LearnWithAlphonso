import { yamlSetting, yamlTarget } from "./ios-project-yml";

/**
 * The release hygiene ios-release.yml enforces before uploading a build.
 * - The app and its embedded widget must carry identical CFBundleShortVersionString (MARKETING_VERSION) and
 *   CFBundleVersion (CURRENT_PROJECT_VERSION); App Store Connect rejects an extension whose version differs.
 * - The build number must be greater than every build App Store Connect already has for the app.
 */
export type TargetVersions = { marketing: string | null; build: string | null };

export function projectVersions(yml: string): { app: TargetVersions; widget: TargetVersions } {
  const of = (name: string): TargetVersions => {
    const block = yamlTarget(yml, name);
    return {
      marketing: yamlSetting(block, "MARKETING_VERSION"),
      build: yamlSetting(block, "CURRENT_PROJECT_VERSION"),
    };
  };
  return { app: of("LearnWithAlphonso"), widget: of("LearnWithAlphonsoWidget") };
}

export function versionMismatchProblems(yml: string): string[] {
  const { app, widget } = projectVersions(yml);
  const problems: string[] = [];
  if (!app.marketing || !app.build)
    problems.push("the app target is missing MARKETING_VERSION or CURRENT_PROJECT_VERSION");
  if (!widget.marketing || !widget.build)
    problems.push("the widget target is missing MARKETING_VERSION or CURRENT_PROJECT_VERSION");
  if (app.marketing !== widget.marketing)
    problems.push(
      `CFBundleShortVersionString differs: app ${app.marketing}, widget ${widget.marketing}`,
    );
  if (app.build !== widget.build)
    problems.push(`CFBundleVersion differs: app ${app.build}, widget ${widget.build}`);
  return problems;
}

const BUILD_NUMBER = /^\d+(\.\d+){0,2}$/;

/** Numeric, per dot component: "50" > "9", "49.1" > "49", "49" equals "49.0". */
export function compareBuildNumbers(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export function buildNumberProblem(local: string, uploaded: string[]): string | null {
  if (!BUILD_NUMBER.test(local))
    return `CURRENT_PROJECT_VERSION "${local}" is not a valid build number`;
  const known = uploaded.filter((v) => BUILD_NUMBER.test(v));
  if (known.length === 0) return null;
  const latest = known.reduce((max, v) => (compareBuildNumbers(v, max) > 0 ? v : max));
  return compareBuildNumbers(local, latest) > 0
    ? null
    : `Build ${local} is not greater than the latest App Store Connect build ${latest}. Bump CURRENT_PROJECT_VERSION in both targets.`;
}
