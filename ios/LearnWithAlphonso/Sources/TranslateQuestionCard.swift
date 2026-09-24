import SwiftUI
import LearnWithAlphonsoKit

/// The answer control for a "translate" question, shared by LessonPlayerView's
/// QuestionCard and ReviewQueueView's ReviewQuestionCard -- the two players are
/// separate renderers, and a type wired into only one shows up in the other as
/// a card the learner cannot answer.
///
/// Mirrors the web's TranslateAnswer.tsx: the prompt is rendered by the player
/// as the question heading, the accepted phrasings stay hidden until the
/// learner has answered, and exactly one is revealed afterwards as "one way to
/// say it" rather than as "the" answer -- several wordings are right, and
/// theirs may simply not have been on the list.
///
/// Grading is the same two-step as everywhere else, with the device-specific
/// part being what happens with no network: the curated phrasings are bundled
/// content, so an offline learner still gets a real verdict instead of a dead
/// end. That matters more than leniency here, because lesson completion needs
/// an answer for every question -- a question that cannot resolve is a lesson
/// that never pays out XP, a streak or an unlock.
struct TranslateQuestionCard: View {
    let question: Question.Translate
    let checked: Bool
    @Binding var picked: String?
    /// Set once the verdict settles, so the player can show the outcome and
    /// score it. Nil until then.
    @Binding var verdict: TranslationVerdict?

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
            Text("WRITE IT YOURSELF")
                .font(AlphonsoFont.sans(12, weight: .semiBold))
                .tracking(0.4)
                .foregroundStyle(AlphonsoColor.inkSoft)
            Text(question.prompt)
                .font(AlphonsoFont.display(22, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)

            TextField(
                "Write your answer",
                text: Binding(get: { picked ?? "" }, set: { picked = $0 }),
                axis: .vertical
            )
            .lineLimit(3...6)
            .textFieldStyle(.plain)
            .padding(AlphonsoSpacing.sm)
            .alphonsoInputBackground()
            .disabled(checked)

            if checked, let verdict, !verdict.correct {
                VStack(alignment: .leading, spacing: AlphonsoSpacing.xs) {
                    if let reason = verdict.reason {
                        Text(reason)
                            .font(AlphonsoFont.sans(14))
                            .foregroundStyle(AlphonsoColor.ink)
                    }
                    Text("ONE WAY TO SAY IT")
                        .font(AlphonsoFont.sans(11, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.inkSoft)
                    Text(question.acceptableAnswers.first ?? "")
                        .font(AlphonsoFont.sans(15))
                        .foregroundStyle(AlphonsoColor.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(AlphonsoSpacing.sm)
                .background(
                    AlphonsoColor.surface,
                    in: RoundedRectangle(cornerRadius: AlphonsoRadius.lg, style: .continuous))
            }

            if checked {
                ExplanationView(
                    question: .translate(question),
                    picked: picked,
                    explanation: question.explanation,
                    // The settled verdict, not a re-derivation of it.
                    correctOverride: verdict?.correct)
            }
        }
    }

}

/// Settles the verdict for one written translation, for whichever player is
/// asking.
///
/// A free function rather than a method on the card because both players own
/// the grading decision and the card only displays it -- the same split the web
/// uses, where TranslateAnswer.tsx renders and the players grade.
///
/// The local match is the floor and is never overturned; the server is asked
/// only about what it rejects, and only when there is a network and a token to
/// ask with. Everything else leaves the local verdict standing, because being
/// offline is not evidence about the learner's English.
@MainActor
func settledTranslationVerdict(
    question: Question.Translate,
    lessonId: String,
    course: Course,
    session: Session,
    isConnected: Bool,
    submission rawSubmission: String?
) async -> TranslationVerdict {
    let submission = (rawSubmission ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    if TranslationAnswer.matches(submission: submission, acceptable: question.acceptableAnswers) {
        return TranslationVerdict(correct: true, reason: nil)
    }
    guard isConnected, let accessToken = session.accessToken else {
        return TranslationVerdict(correct: false, reason: nil)
    }
    let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
    let remote = await client.gradeTranslation(
        lessonId: lessonId,
        questionId: question.id,
        submission: submission,
        course: course.translationCourseCode)
    return remote ?? TranslationVerdict(correct: false, reason: nil)
}

extension Course {
    /// The course code the web API expects, matching `localeForCourse`'s
    /// counterpart on that side.
    var translationCourseCode: String {
        switch self {
        case .english: return "en"
        case .french: return "fr"
        case .spanish: return "es"
        }
    }
}
