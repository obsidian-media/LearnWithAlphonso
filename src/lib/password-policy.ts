/**
 * The shortest password a new account or a password reset may set. The auth server's own minimum (Supabase
 * Authentication settings) is the control; this only lets the form say so before the request. Existing accounts with a
 * shorter password can still sign in, so the sign-in form does not apply it.
 */
export const MIN_NEW_PASSWORD_LENGTH = 10;

export const NEW_PASSWORD_TOO_SHORT = `Use at least ${MIN_NEW_PASSWORD_LENGTH} characters for your password.`;

export function isLongEnoughNewPassword(password: string): boolean {
  return password.length >= MIN_NEW_PASSWORD_LENGTH;
}
