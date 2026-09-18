import SwiftUI
import LearnWithAlphonsoKit

struct RootView: View {
    let session: Session
    let contentStore: ContentStore

    var body: some View {
        switch session.state {
        case .signedOut, .awaitingCode:
            AuthView(session: session)
        case .signedIn:
            LessonBrowserView(contentStore: contentStore, session: session)
        }
    }
}
