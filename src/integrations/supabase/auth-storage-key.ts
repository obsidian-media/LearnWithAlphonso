/**
 * The browser session's localStorage key, pinned.
 *
 * supabase-js derives its default key from the project URL's first host label
 * (`sb-${hostname.split(".")[0]}-auth-token`, SupabaseClient.ts). Moving SUPABASE_URL from
 * qhcjpfbxfcltjbiuknyt.supabase.co to api.learnwithalphonso.com would change the default to `sb-api-auth-token`,
 * silently signing out every web learner and orphaning an in-flight PKCE code verifier (`<key>-code-verifier`).
 * So the key is fixed to the value the old host produced, whatever URL the client is pointed at.
 *
 * Never change this string without a migration that copies the stored session across.
 */
export const AUTH_STORAGE_KEY = "sb-qhcjpfbxfcltjbiuknyt-auth-token";
