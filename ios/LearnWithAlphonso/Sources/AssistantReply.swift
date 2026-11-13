import SwiftUI
import LearnWithAlphonsoKit

/// "Say that in <language>" under one tutor bubble (Practice, Campaigns and Hector). Hector's calls spend his own Pro
/// allowance (surface "hector"); the rest spend the free explain budget. The fixed opening line is ours and has none.
struct AssistantExplainRow: View {
    let turn: ChatMessage
    let isOpener: Bool
    let course: Course
    let surface: AIResponseSurface
    let session: Session

    var body: some View {
        if turn.role == "assistant", !isOpener {
            ExplainInMyLanguage(
                request: ExplainRequest.makeMessage(text: turn.content, course: course.wireCode),
                session: session,
                surface: surface == .hector ? .hector : .app)
        }
    }
}

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
        // Hector replies are wholly in the language being practiced.
        TappableText(text: turn.content, color: color, course: course.wireCode, mode: .allWords) {
            savingWord = $0
        }
        .reportableAIMessage(
            turn.content, enabled: !isOpener, surface: surface, course: course.wireCode,
            scenarioID: scenarioID, campaignID: campaignID, sceneIndex: sceneIndex, session: session)
    }
}
