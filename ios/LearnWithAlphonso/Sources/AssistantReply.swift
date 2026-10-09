import SwiftUI
import LearnWithAlphonsoKit

/// One AI reply's text, with tappable words. Every conversation surface (Hector,
/// Practice, Campaigns) draws the partner's replies through this one view, so
/// anything that belongs on an AI reply attaches here, in one place.
/// `isOpener` marks the fixed first line of a scene, which we wrote rather than
/// the model: it is not reportable as an AI response, every other reply is.
struct AssistantReply: View {
    let turn: ChatMessage
    let isOpener: Bool
    let course: Course
    let color: Color
    let surface: AIResponseSurface
    var scenarioID: String? = nil
    var campaignID: String? = nil
    var sceneIndex: Int? = nil
    let session: Session
    @Binding var savingWord: SaveWordRequest?

    var body: some View {
        TappableText(text: turn.content, color: color, course: course.wireCode) {
            savingWord = $0
        }
        .reportableAIMessage(
            turn.content, enabled: !isOpener, surface: surface, course: course.wireCode,
            scenarioID: scenarioID, campaignID: campaignID, sceneIndex: sceneIndex, session: session)
    }
}
