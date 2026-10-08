import SwiftUI
import LearnWithAlphonsoKit

private struct SessionLifecycleKey: EnvironmentKey {
    static let defaultValue: SessionLifecycle? = nil
}

extension EnvironmentValues {
    /// The app's one SessionLifecycle. Created in LearnWithAlphonsoApp and injected into
    /// Session. Views that own account-scoped state read it here to register their own
    /// cleanup. Nil only in previews.
    var sessionLifecycle: SessionLifecycle? {
        get { self[SessionLifecycleKey.self] }
        set { self[SessionLifecycleKey.self] = newValue }
    }
}
