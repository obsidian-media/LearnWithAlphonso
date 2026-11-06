/**
 * The "Please update" gate for the iOS and Android apps. The server says the lowest app build it still supports;
 * an app below it shows a full-screen "Please update Alphonso" card with a store link instead of the app.
 *
 * Off by default: with no minimum set (the env var missing, empty or not a positive whole number), every build opens
 * normally. An app that cannot read the setting also opens normally, so a server problem never locks anyone out.
 * A platform with no usable https store link has no gate either (iOS needs APP_IOS_STORE_URL).
 *
 * Ported to Swift (ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AppUpdateGate.swift) and Kotlin
 * (android/LearnWithAlphonso/core/.../logic/AppUpdateGate.kt). Keep the three in step.
 *
 * Env (Vercel): APP_MIN_IOS_BUILD (the CFBundleVersion number, e.g. 59), APP_MIN_ANDROID_VERSION_CODE (versionCode),
 * APP_IOS_STORE_URL (the App Store page), APP_ANDROID_STORE_URL (defaults to the Play listing).
 */

export const ANDROID_STORE_URL_DEFAULT =
  "https://play.google.com/store/apps/details?id=com.obsidianmedia.learnwithalphonso";

export type PlatformGate = { minBuild: number | null; storeUrl: string | null };
export type AppUpdateConfig = { ios: PlatformGate; android: PlatformGate };

/** A positive whole number, or null (gate off). */
export function parseMinBuild(raw: string | undefined): number | null {
  const v = raw?.trim();
  if (!v || !/^[0-9]+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function httpsOrNull(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function appUpdateConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): AppUpdateConfig {
  // A gate with nowhere to update from would strand people, so a platform without a usable store link has no gate.
  const iosStore = httpsOrNull(env.APP_IOS_STORE_URL);
  const androidStore = httpsOrNull(env.APP_ANDROID_STORE_URL) ?? ANDROID_STORE_URL_DEFAULT;
  return {
    ios: { minBuild: iosStore ? parseMinBuild(env.APP_MIN_IOS_BUILD) : null, storeUrl: iosStore },
    android: { minBuild: parseMinBuild(env.APP_MIN_ANDROID_VERSION_CODE), storeUrl: androidStore },
  };
}

/** True when this build is below the minimum. No minimum, or an unknown build, never blocks. */
export function needsUpdate(currentBuild: number | null, minBuild: number | null): boolean {
  if (minBuild === null || currentBuild === null || !Number.isFinite(currentBuild)) return false;
  return currentBuild < minBuild;
}
