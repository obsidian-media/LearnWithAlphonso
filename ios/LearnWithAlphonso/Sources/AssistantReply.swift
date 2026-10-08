import SwiftUI
import LearnWithAlphonsoKit

/// One AI reply's text, with tappable words. Every conversation surface (Hector,
/// Practice, Campaigns) draws the partner's replies through this one view, so
/// anything that belongs on an AI reply attaches here, in one place.
/// `isOpener` marks the fixed first line of a scene, which we wrote rather than
/// the model.
struct AssistantReply: View {
    let turn: ChatMessage
    let isOpener: Bool
    let course: Course
    let color: Color
    @Binding var savingWord: SaveWordRequest?

    var body: some View {
        TappableText(text: turn.content, color: color, course: course.wireCode) {
            savingWord = $0
        }
    }
}
