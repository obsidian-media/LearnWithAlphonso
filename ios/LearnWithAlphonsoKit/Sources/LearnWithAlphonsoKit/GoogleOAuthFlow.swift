import Foundation

/// Builds the PKCE handshake for Supabase's `/auth/v1/authorize` endpoint
/// so iOS can sign in with Google through the *same* Google OAuth client
/// the web app already uses (Supabase Dashboard > Authentication >
/// Providers > Google) -- no separate Google Cloud Console credentials
/// needed. The browser leg (ASWebAuthenticationSession) lives in the app
/// target since it needs a presentation anchor; this type only builds the
/// authorize URL and, once the app has the redirect-back URL, exchanges
/// the resulting code via SupabaseAuthClient.exchangeOAuthCode.
public struct GooglePKCEChallenge: Sendable, Equatable {
    public let verifier: String
    public let challenge: String
}

public enum SupabaseOAuthFlow {
    /// A fresh, cryptographically random PKCE verifier (RFC 7636: 43-128
    /// unreserved characters) and its S256 challenge.
    public static func makePKCEChallenge() -> GooglePKCEChallenge {
        let verifier = Data((0..<32).map { _ in UInt8.random(in: 0...255) }).base64URLEncodedString()
        return GooglePKCEChallenge(verifier: verifier, challenge: challenge(forVerifier: verifier))
    }

    /// Exposed separately (rather than folded into `makePKCEChallenge`) so
    /// tests can assert the S256 derivation against a known vector without
    /// needing to control randomness.
    public static func challenge(forVerifier verifier: String) -> String {
        SHA256Pure.hash(Data(verifier.utf8)).base64URLEncodedString()
    }

    /// `redirectTo` must already be registered in Supabase's redirect-URL
    /// allow list (Authentication > URL Configuration) -- e.g. this app's
    /// `com.obsidianmedia.learnwithalphonso://login-callback` scheme.
    public static func authorizeURL(supabaseURL: URL, redirectTo: String, challenge: GooglePKCEChallenge) -> URL {
        var components = URLComponents(
            url: supabaseURL.appendingPathComponent("auth/v1/authorize"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "provider", value: "google"),
            URLQueryItem(name: "redirect_to", value: redirectTo),
            URLQueryItem(name: "code_challenge", value: challenge.challenge),
            URLQueryItem(name: "code_challenge_method", value: "s256"),
        ]
        return components.url!
    }

    /// Pulls the `code` query item out of the URL Supabase/Google
    /// redirected back to (the app's custom-scheme callback URL).
    public static func authorizationCode(from callbackURL: URL) -> String? {
        URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems?
            .first(where: { $0.name == "code" })?
            .value
    }
}

extension Data {
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
