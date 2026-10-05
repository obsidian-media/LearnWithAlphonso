import Foundation

/// Whether a written translation may be sent to the server (and on to NVIDIA)
/// for a second opinion on what the curated phrasings rejected.
///
/// This is where AI-processing consent is enforced for lesson translations.
/// The lesson player used to be wrapped in the consent gate wholesale because
/// it "might" reach a translate question, so tapping "Not now" popped the
/// learner out of every lesson -- including ones with no AI question at all
/// (BACKLOG 0.0-z #2), and Apple dislikes core features depending on extra
/// data sharing. Gating at the single point a written answer leaves the
/// device keeps the same privacy guarantee (nothing is sent without consent)
/// without blocking the lesson: without consent the curated-phrasing verdict
/// simply stands.
///
/// A pure function of its three inputs so the privacy-critical property is
/// unit-tested here rather than only reviewed in the app target, which only
/// CI can compile.
public enum TranslationGradingPolicy {
    public static func mayAskServer(
        isConnected: Bool,
        hasAccessToken: Bool,
        hasAIConsent: Bool
    ) -> Bool {
        isConnected && hasAccessToken && hasAIConsent
    }
}
