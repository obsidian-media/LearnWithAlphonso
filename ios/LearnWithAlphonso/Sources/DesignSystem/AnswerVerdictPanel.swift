import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// Everything after Check, as one panel at the bottom of the question: green or red, the verdict, the right answer
/// when it was missed, Alphonso reacting (happy, or a thumbs-up when it was missed), and the button on. Shared by
/// the lesson player and review. The verdict is the caller's (a translation's comes from its settled grade); the
/// words come from the Kit's `AnswerVerdict`. The explanation itself stays in the question card above.
struct AnswerVerdictPanel: View {
    let correct: Bool
    /// Shown as "Answer: ..." when the learner missed it; nil or empty shows no answer line.
    let correctAnswer: String?
    /// A screen's own wording for the verdict (review says "Still got it."); nil uses Correct! / Not quite.
    var title: String? = nil
    let continueTitle: String
    let onContinue: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var answerLine: String? {
        guard !correct, let correctAnswer, !correctAnswer.isEmpty else { return nil }
        return "Answer: \(correctAnswer)"
    }

    /// Build 55: a wrong answer is the theme's softer coral where it has one (AlphonsoColor.wrongAnswer).
    private var tint: Color { correct ? AlphonsoColor.moss : AlphonsoColor.wrongAnswer }

    var body: some View {
        VStack(spacing: AlphonsoSpacing.sm + 4) {
            HStack(alignment: .center, spacing: AlphonsoSpacing.sm + 4) {
                // Decorative: the words carry the verdict.
                Image(correct ? "Alphonso-happy" : "Alphonso-encouraging")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 64, height: 64)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title ?? AnswerVerdict.title(correct: correct))
                        .font(AlphonsoFont.display(20, weight: .bold))
                        // Ink for "Not quite": coral text on its own tint is under 3:1 on the light themes.
                        .foregroundStyle(correct ? tint : AlphonsoColor.ink)
                    if let answerLine {
                        Text(answerLine)
                            .font(AlphonsoFont.sans(15, weight: .semiBold))
                            .foregroundStyle(AlphonsoColor.ink)
                    }
                }
                Spacer(minLength: 0)
            }
            Button(continueTitle, action: onContinue)
                .buttonStyle(
                    correct
                        ? AlphonsoPrimaryButtonStyle(foreground: AlphonsoColor.onPrimary)
                        : AlphonsoPrimaryButtonStyle.alphonsoEmber
                )
        }
        .padding(AlphonsoSpacing.md)
        .background(tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(alignment: .top) {
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .strokeBorder(tint.opacity(0.55), lineWidth: 2)
        }
        .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
        // The one verdict announcement (two posts in the same frame cut each other off): the screens that show this
        // panel set `verdictAnnouncedByPanel`, so ExplanationView stays quiet under it.
        .onAppear {
            let announcement = correct ? "Correct" : (answerLine.map { "Incorrect. \($0)" } ?? "Incorrect")
            UIAccessibility.post(notification: .announcement, argument: announcement)
        }
    }
}

/// One multiple-choice (or listening) answer: a chunky tile with a darker bottom edge that collapses while pressed.
/// Parchment when idle, moss when picked, moss with a check when it is the right answer, the theme's wrong-answer colour with a
/// cross when it was the wrong pick. Shared by the lesson player and review.
struct AnswerChoiceButton: View {
    let choice: String
    let picked: String?
    let checked: Bool
    let isCorrectChoice: Bool
    let onPick: () -> Void

    private var isPicked: Bool { picked == choice }

    private var fill: Color {
        if checked && isCorrectChoice { return AlphonsoColor.moss.opacity(0.22) }
        if checked && isPicked { return AlphonsoColor.wrongAnswer.opacity(0.18) }
        if isPicked { return AlphonsoColor.moss.opacity(0.14) }
        return AlphonsoColor.parchment
    }

    private var edge: Color {
        if checked && isCorrectChoice { return AlphonsoColor.moss }
        if checked && isPicked { return AlphonsoColor.wrongAnswer }
        if isPicked { return AlphonsoColor.moss }
        return AlphonsoColor.hairline
    }

    var body: some View {
        Button(action: onPick) {
            HStack {
                Text(choice)
                    .font(AlphonsoFont.sans(17, weight: .medium))
                    .multilineTextAlignment(.leading)
                Spacer()
                if checked && isCorrectChoice {
                    Image(systemName: "checkmark.circle.fill").symbolRenderingMode(.palette)
                        .foregroundStyle(.white, AlphonsoColor.moss)
                        .accessibilityHidden(true)
                } else if checked && isPicked {
                    Image(systemName: "xmark.circle.fill").symbolRenderingMode(.palette)
                        .foregroundStyle(.white, AlphonsoColor.wrongAnswer)
                        .accessibilityHidden(true)
                }
            }
            .foregroundStyle(AlphonsoColor.ink)
        }
        .buttonStyle(ChunkyTileStyle(fill: fill, edge: edge, radius: 18, minHeight: 56))
        .disabled(checked)
        // The checkmark/xmark is hidden from VoiceOver (it repeats the label), so the label says both "which choice
        // was right" and "was mine right" outright.
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
    }

    private var accessibilityText: String {
        guard checked else { return choice }
        if isCorrectChoice {
            return isPicked ? "\(choice), your answer, correct" : "\(choice), correct answer"
        }
        return isPicked ? "\(choice), your answer, incorrect" : choice
    }
}

/// The tile behind `AnswerChoiceButton` and the word chips: a fill, a 2 pt border and a 4 pt bottom edge in the
/// border's colour that collapses while pressed. No movement under Reduce Motion.
struct ChunkyTileStyle: ButtonStyle {
    let fill: Color
    let edge: Color
    var radius: CGFloat = 18
    var minHeight: CGFloat = 56
    /// Set by a style that builds this one itself (AlphonsoWordChipStyle): its environment is not installed here.
    var reduceMotionOverride: Bool? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let still = reduceMotionOverride ?? reduceMotion
        let pressed = configuration.isPressed && !still
        return configuration.label
            .padding(.horizontal, AlphonsoSpacing.md)
            .padding(.vertical, AlphonsoSpacing.sm)
            .frame(maxWidth: .infinity, minHeight: minHeight)
            .background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .background(AlphonsoColor.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(edge, lineWidth: 2)
            )
            .offset(y: pressed ? 4 : 0)
            .background(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(edge)
                    .offset(y: pressed ? 0 : 4)
            )
            .animation(still ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
            .sensoryFeedback(.impact(weight: .light), trigger: configuration.isPressed) { _, pressed in pressed && SoundEffectsPreference.isOn() }
    }
}

/// One word in a fill-in word bank or a reorder pool, as a chunky chip; highlighted when it is the picked word.
struct AlphonsoWordChipStyle: ButtonStyle {
    let picked: Bool

    // Read here, where the style is installed, and handed to the tile it builds (whose own @Environment is not).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        ChunkyTileStyle(
            fill: picked ? AlphonsoColor.moss.opacity(0.16) : AlphonsoColor.parchment,
            edge: picked ? AlphonsoColor.moss : AlphonsoColor.hairline,
            radius: 14, minHeight: AlphonsoSpacing.minTouchTarget,
            reduceMotionOverride: reduceMotion
        )
        .makeBody(configuration: configuration)
        .font(AlphonsoFont.sans(16, weight: .medium))
        .foregroundStyle(AlphonsoColor.ink)
        .fixedSize()
    }
}

/// True on a screen whose AnswerVerdictPanel announces the verdict, so ExplanationView does not announce it too.
private struct VerdictAnnouncedByPanelKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var verdictAnnouncedByPanel: Bool {
        get { self[VerdictAnnouncedByPanelKey.self] }
        set { self[VerdictAnnouncedByPanelKey.self] = newValue }
    }
}

extension ButtonStyle where Self == AlphonsoWordChipStyle {
    static func alphonsoWordChip(picked: Bool) -> AlphonsoWordChipStyle { AlphonsoWordChipStyle(picked: picked) }
}
