# Owner setup for the Android app

Everything on this page is an account or portal action only the account
owner can do. None of it is created by the build, and none of it belongs in
this public repository. The long form with click-by-click steps lives in the
owner's Claude doc "Android Owner Setup Guide" (2026-09-29); this file is
the checklist and the names, so a future session can tell what is still
owed.

| # | Item | Where | Goes to | Unblocks |
| --- | --- | --- | --- | --- |
| 1 | Redirect URL `com.obsidianmedia.learnwithalphonso://login-callback` | Supabase, Authentication, URL Configuration | dashboard setting | Google sign-in on Android |
| 2 | Firebase project with an Android app (package `com.obsidianmedia.learnwithalphonso`), its `google-services.json` | Firebase console | GitHub secret `FIREBASE_GOOGLE_SERVICES_JSON` | Push on the device |
| 3 | Firebase service-account JSON and project id | Firebase console, Project settings | Supabase Edge Function secrets `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID` | Server sending nudge and overtake pushes to Android |
| 4 | Vault secret `push_trigger_service_key` (service-role key) | Supabase SQL editor: `select vault.create_secret('<key>', 'push_trigger_service_key');` | Vault | The nudge push trigger, both platforms |
| 5 | Play developer account, app record, merchant profile | Play Console | account | Every Play feature |
| 6 | Subscription product `pro_monthly` (base plan `monthly`) | Play Console, Monetize | product | A price on the paywall |
| 7 | RevenueCat Play Store app, `pro` entitlement attached, current offering, public SDK key (`goog_...`) | RevenueCat | GitHub secret `REVENUECAT_ANDROID_PUBLIC_KEY` | Hector unlocking after purchase |
| 8 | Upload keystore, store password, alias `upload`, key password | `keytool` on the owner's machine | GitHub secrets `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEY_PASSWORD` | Signed release builds |
| 9 | The keystore's SHA-256 fingerprint (public) | same `keytool -list -v` | published as `public/.well-known/assetlinks.json` (live) | Invite links opening in the app |
| 10 | Play service account with Release manager | Google Cloud + Play Console, Users and permissions | GitHub secret `PLAY_SERVICE_ACCOUNT_JSON` | Unattended uploads from `android-release.yml` |
| 11 | Listing material: feature graphic 1024x500, 512 px icon, screenshots, content rating | Play Console | uploads | Production review |

Status (verified 2026-11-22 against d8350542, secrets by name with `gh secret list`):

- Done: items 1 to 4 (reported by the owner 2026-09-30, dashboard settings not re-checkable from the repo; the secrets `FIREBASE_GOOGLE_SERVICES_JSON`, `FCM_SERVICE_ACCOUNT_JSON`, `FCM_PROJECT_ID` exist; item 2 is on a provisional Google account, to move to the owner's account, `docs/OPEN-ITEMS.md` item 10).
- Done: items 8 and 9. The four `ANDROID_UPLOAD_*` secrets exist, and `public/.well-known/assetlinks.json` is live on `https://learnwithalphonso.com/.well-known/assetlinks.json` with the upload key's fingerprint. The keystore and its passwords stay on the owner's machine, never in this repository.
- Still owed, by the owner (these are the only things blocking the first Android release; neither secret exists yet):
  1. Create the app record in Play Console (item 5: developer account, app record, merchant profile) and upload the first bundle by hand.
  2. Item 6, the `pro_monthly` subscription product, then item 7: the Android app in RevenueCat, the `pro` entitlement attached to a current offering, and its public SDK key stored as the GitHub secret `REVENUECAT_ANDROID_PUBLIC_KEY` (the release build refuses an empty or `test_` key).
  3. Item 10: the Play service account with Release manager, stored as `PLAY_SERVICE_ACCOUNT_JSON` (only needed for unattended uploads).
  4. Item 11, listing material, at the production submission. After Play App Signing re-signs the app, add the Play signing certificate's fingerprint to `assetlinks.json`.

Order that respects the dependencies: 1, then 5 (Google's identity
verification and the 14-day closed-test rule are wall-clock waits), 8 and 9,
then 2 and 3 and 4 together, then the app record and first manual upload,
then 6 and 7, then 10. Item 11 only matters at the production submission.

How each proves itself: 1 by a Google sign-in landing on the Learn tab; 8 by
the signed-bundle job going green; 2 to 4 by a nudge from a second account
reaching the phone's lock screen; 6 and 7 by the Hector tab showing a price
and a test purchase unlocking it.
