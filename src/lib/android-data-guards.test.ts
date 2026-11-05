import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Android keeps the session (EncryptedSharedPreferences, keyed by the Android Keystore) on this device only. Cloud
 * backup was already off; a device-to-device transfer also has to be excluded, because the Keystore key does not
 * move with it: the copied file cannot be decrypted on the new phone. These read the manifest and resources, which
 * only an emulator run could otherwise exercise.
 */
const APP = "android/LearnWithAlphonso/app/src/main";
const read = (p: string) => fs.readFileSync(path.join(APP, p), "utf8");

describe("Android app data stays on the device", () => {
  const manifest = read("AndroidManifest.xml");

  it("the manifest turns off backup and names extraction rules for Android 12 and later", () => {
    expect(manifest).toMatch(/android:allowBackup="false"/);
    expect(manifest).toMatch(/android:fullBackupContent="false"/);
    expect(manifest).toMatch(/android:dataExtractionRules="@xml\/data_extraction_rules"/);
  });

  it("the extraction rules exclude every domain from cloud backup and from device transfer", () => {
    const rules = read("res/xml/data_extraction_rules.xml");
    for (const section of ["cloud-backup", "device-transfer"]) {
      const body = new RegExp(`<${section}[^>]*>([\\s\\S]*?)</${section}>`).exec(rules)?.[1] ?? "";
      for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
        expect(body, `${section} ${domain}`).toMatch(new RegExp(`<exclude domain="${domain}" path="\\."\\s*/>`));
      }
    }
  });

  it("an undecryptable session file is reset instead of crashing the app at start", () => {
    const store = read("java/com/obsidianmedia/learnwithalphonso/auth/EncryptedSessionStore.kt");
    expect(store).toMatch(/runCatching \{ open\(context\) \}/);
    expect(store).toMatch(/deleteSharedPreferences\(FILE\)/);
  });
});
