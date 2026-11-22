import SwiftUI
import LearnWithAlphonsoKit

/// Shown instead of the lesson when the server refuses it as not unlocked yet (start-lesson-session's 409
/// lesson-locked), before any of it is played: its finish could never be saved. The web lesson page says the same,
/// and Android's LessonLockedContent is the twin.
struct LessonLockedView: View {
    let onBack: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        // Scrolls so the button stays reachable at the largest text sizes and in landscape.
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s3) {
                Image("Alphonso-thinking").resizable().scaledToFit()
                    .frame(height: AlphonsoDS.Space.s12 * 3)
                    .accessibilityHidden(true)
                DSCard(spacing: AlphonsoDS.Space.s2) {
                    Text(LessonLockedCopy.title).dsText(.title).foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text(LessonLockedCopy.message).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button(LessonLockedCopy.backTitle, action: onBack).buttonStyle(.dsButton(.primary))
            }
            .padding(AlphonsoDS.Space.gutter)
            .frame(maxWidth: .infinity)
        }
        .background(ds.surface)
    }
}
