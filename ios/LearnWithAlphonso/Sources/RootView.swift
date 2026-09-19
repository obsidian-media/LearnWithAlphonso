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
            TabView {
                LessonBrowserView(contentStore: contentStore, session: session)
                    .tabItem { Label("Learn", systemImage: "book.fill") }
                ReviewQueueView(contentStore: contentStore, session: session)
                    .tabItem { Label("Review", systemImage: "arrow.clockwise") }
                ConversationView(contentStore: contentStore, session: session)
                    .tabItem { Label("Practice", systemImage: "mic.fill") }
            }
        }
    }
}
