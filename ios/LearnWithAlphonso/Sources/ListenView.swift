import SwiftUI

/// Listen: the podcast/audio library's iOS tab.
///
/// A deliberate placeholder. Phase 0 claims the tab slot (the bar was
/// over its five-item budget and had to be consolidated first); Phase 1b
/// replaces this body with the real client -- PodcastClient against
/// PostgREST, the folder tree, and an AVPlayer with background audio and
/// Now Playing controls. See
/// docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md.
///
/// It says so plainly rather than pretending to load. A fake spinner or
/// invented content would be a worse lie than an empty tab.
///
/// **No App Store release may ship between Phase 0 and Phase 1b**, or real
/// users get a tab that does nothing.
struct ListenView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Listen", systemImage: "headphones")
            } description: {
                Text("Short audio episodes are coming here soon.")
            }
            .background(AlphonsoColor.surface)
            .navigationTitle("Listen")
        }
        .tint(AlphonsoColor.moss)
    }
}
