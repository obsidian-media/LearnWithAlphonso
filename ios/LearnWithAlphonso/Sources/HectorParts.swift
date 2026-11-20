import SwiftUI
import AVFoundation
import LearnWithAlphonsoKit

/// The pieces of Hector's converged screen: the tutor header, the suggestion chips and the type-or-talk composer.
/// HectorView owns the state and the voice plumbing; these only draw and report taps.

// MARK: - Header

/// The navy hero header: Hector's cut-out standing on its bottom edge, a top row with close and an overflow menu, the
/// name, a status pill with a live dot and the role line.
struct HectorHeader<MenuContent: View>: View {
    let art: String
    let status: HectorStatus?
    let courseName: String
    let handsFreeOn: Bool
    let onClose: (() -> Void)?
    @ViewBuilder let menu: () -> MenuContent

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var statusLabel: String {
        switch status {
        case nil: return "Ready"
        case .listening: return "Listening…"
        case .thinking: return "Thinking…"
        case .speaking: return "Speaking…"
        }
    }

    private var statusSpoken: String {
        "Hector is \(statusLabel.replacingOccurrences(of: "…", with: "").lowercased())"
    }

    private var dotColor: Color {
        switch status {
        case nil, .listening: return ds.right
        case .thinking, .speaking: return ds.action
        }
    }

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .topLeading, endPoint: .bottomTrailing)
            Circle()
                .fill(RadialGradient(
                    colors: [ds.onHeroKick.opacity(0.26), .clear], center: .center, startRadius: 0, endRadius: 90))
                .frame(width: 180, height: 180)
                .offset(x: 40, y: -40)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                .accessibilityHidden(true)

            HStack(alignment: .bottom, spacing: 12) {
                // Uncropped: the whole cut-out, bust on the header's bottom edge.
                Image(art)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 96, height: 112, alignment: .bottom)
                    .shadow(color: .black.opacity(0.45), radius: 8, y: 6)
                    .id(art)
                    .transition(.opacity)
                    .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: art)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Hector")
                        .dsText(.display)
                        .foregroundStyle(ds.onHero)
                    statusPill
                    Text(handsFreeOn ? "Your \(courseName) tutor · hands-free on" : "Your \(courseName) tutor")
                        .dsText(.caption)
                        .foregroundStyle(ds.onHeroSoft)
                }
                .padding(.bottom, AlphonsoSpacing.md)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, AlphonsoSpacing.md)

            topRow
        }
        .frame(maxWidth: .infinity, minHeight: 148)
        .clipped()
        .shadow(color: ds.heroB.opacity(0.5), radius: 10, y: 6)
        .accessibilityElement(children: .contain)
    }

    private var statusPill: some View {
        HStack(spacing: 6) {
            Circle().fill(dotColor).frame(width: 8, height: 8).pulsingGlow()
            Text(statusLabel).dsText(.caption).foregroundStyle(ds.onHero)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(ds.onHero.opacity(0.14), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(statusSpoken)
        .accessibilityIdentifier("hectorStatusPill")
    }

    private var topRow: some View {
        VStack {
            HStack {
                if let onClose {
                    Button(action: onClose) {
                        Image(systemName: "chevron.left").dsText(.headline)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Back")
                    .accessibilityIdentifier("hectorBack")
                }
                Spacer()
                Menu {
                    menu()
                } label: {
                    Image(systemName: "ellipsis").dsText(.headline)
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("More options")
                .accessibilityIdentifier("hectorMenu")
            }
            .foregroundStyle(ds.onHero)
            .padding(.horizontal, AlphonsoSpacing.xs)
            Spacer()
        }
    }
}

// MARK: - Chips

private func chipSymbol(_ icon: HectorChipIcon) -> some View {
    Group {
        switch icon {
        case .flame: DSIconView(icon: .flame, size: 15)
        case .book: DSIconView(icon: .book, size: 15)
        case .coffee: Image(systemName: "cup.and.saucer").dsText(.footnote)
        case .chat: Image(systemName: "bubble.left").dsText(.footnote)
        }
    }
    .accessibilityHidden(true)
}

/// Frosted-solid suggestion chips, like the Stories choice bubbles. Each one is a button that sends its message.
struct HectorChipsRow: View {
    let chips: [HectorChip]
    let onTap: (HectorChip) -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        LessonFlowLayout(spacing: 8) {
            ForEach(chips) { chip in
                Button { onTap(chip) } label: {
                    HStack(spacing: 7) {
                        chipSymbol(chip.icon).foregroundStyle(ds.choice)
                        Text(chip.label).dsText(.footnote).foregroundStyle(ds.ink)
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 9)
                    .frame(minHeight: AlphonsoSpacing.minTouchTarget - 8)
                    .background(ds.card, in: Capsule())
                    .overlay(Capsule().stroke(ds.line, lineWidth: 1.5))
                    .alphonsoLift()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(chip.label)
                .accessibilityHint("Sends this to Hector")
                .accessibilityIdentifier("hectorChip-\(chip.id)")
            }
        }
        .padding(.leading, 40)
    }
}

// MARK: - Composer

/// Six bars that follow the microphone level (dBFS), or sit still under Reduce Motion.
struct HectorWaveform: View {
    let level: () -> Double?
    let reduceMotion: Bool

    @Environment(\.alphonsoDS) private var ds
    private static let still: [CGFloat] = [7, 14, 20, 11, 16, 8]

    var body: some View {
        if reduceMotion {
            bars(Self.still)
        } else {
            TimelineView(.animation(minimumInterval: 0.08)) { context in
                let db = level() ?? -60
                // -50 dBFS (quiet room) ... -5 dBFS (loud): 0...1
                let norm = CGFloat(max(0, min(1, (db + 50) / 45)))
                let t = context.date.timeIntervalSinceReferenceDate
                bars((0..<6).map { i in
                    let wobble = 0.55 + 0.45 * CGFloat(abs(sin(t * 6 + Double(i) * 1.3)))
                    return 4 + 18 * norm * wobble
                })
            }
        }
    }

    private func bars(_ heights: [CGFloat]) -> some View {
        HStack(spacing: 3) {
            ForEach(Array(heights.enumerated()), id: \.offset) { _, h in
                RoundedRectangle(cornerRadius: 2).fill(ds.choice.opacity(0.85)).frame(width: 3, height: h)
            }
        }
        .frame(height: 22)
        .accessibilityHidden(true)
    }
}

/// Idle: a text field and a gold mic (a send button once there is text). Talking: the field becomes a "Listening"
/// pill with a live waveform and a red stop button.
struct HectorComposer: View {
    @Binding var text: String
    let isListening: Bool
    let isBusy: Bool
    /// Hands-free owns the microphone: no mic button, typing still works.
    let handsFreeOn: Bool
    let level: () -> Double?
    let reduceMotion: Bool
    let onSend: () -> Void
    let onMic: () -> Void
    let onStop: () -> Void
    /// Bumped to put the cursor in the field ("Try again" with no microphone).
    var focusCue: Int = 0

    @Environment(\.alphonsoDS) private var ds
    @FocusState private var focused: Bool

    private var hasText: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(alignment: .center, spacing: 9) {
            if isListening { listeningPill } else { field }
            trailing
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 10)
        .background(ds.card, ignoresSafeAreaEdges: .bottom)
        .shadow(color: ds.ink.opacity(0.12), radius: 8, y: -4)
        .onChange(of: focusCue) { focused = true }
    }

    private var field: some View {
        TextField("", text: $text, prompt: Text("Type or tap the mic…").foregroundStyle(ds.inkFaint), axis: .vertical)
            .lineLimit(1...4)
            .dsText(.body)
            .foregroundStyle(ds.ink)
            .focused($focused)
            .submitLabel(.send)
            .onSubmit { if hasText && !isBusy { onSend() } }
            .padding(.horizontal, 15)
            .frame(minHeight: AlphonsoSpacing.minTouchTarget)
            .background(ds.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ds.line, lineWidth: 1.5))
            .accessibilityLabel("Message Hector")
            .accessibilityIdentifier("hectorField")
    }

    private var listeningPill: some View {
        HStack(spacing: 11) {
            Text("Listening").dsText(.footnote).foregroundStyle(ds.choice)
            HectorWaveform(level: level, reduceMotion: reduceMotion)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .frame(minHeight: AlphonsoSpacing.minTouchTarget)
        .frame(maxWidth: .infinity)
        .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(ds.choice.opacity(0.25), lineWidth: 1.5))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Listening")
        .accessibilityIdentifier("hectorListening")
    }

    @ViewBuilder
    private var trailing: some View {
        if isListening {
            circleButton(fill: AnyShapeStyle(ds.wrong),
                         label: "Stop recording and send", id: "hectorStop", action: onStop) {
                Image(systemName: "stop.fill").dsText(.headline).foregroundStyle(ds.onWrong)
            }
        } else if hasText {
            circleButton(fill: AnyShapeStyle(ds.choice), label: "Send", id: "hectorSend", action: { onSend() }) {
                Image(systemName: "arrow.up").dsText(.headline).foregroundStyle(ds.onChoice)
            }
            .disabled(isBusy)
            .opacity(isBusy ? 0.5 : 1)
        } else if isBusy {
            ProgressView().tint(ds.choice).frame(width: 44, height: 44)
        } else if !handsFreeOn {
            circleButton(fill: AnyShapeStyle(LinearGradient(colors: [ds.actionHi, ds.action], startPoint: .top, endPoint: .bottom)),
                         label: "Talk to Hector", id: "hectorMic", action: { focused = false; onMic() }) {
                DSIconView(icon: .mic, size: 21).foregroundStyle(ds.onAction)
            }
        }
    }

    private func circleButton<Label: View>(
        fill: AnyShapeStyle, label: String, id: String, action: @escaping () -> Void,
        @ViewBuilder content: () -> Label
    ) -> some View {
        Button(action: action) {
            content()
                .frame(width: 44, height: 44)
                .background(fill, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }
}

// MARK: - Correction card

/// Says a correction's fix with the device's own voice (AVSpeechSynthesizer): no request, no server, no quota. The voice
/// comes from `SpeechVoice`, the one place the app picks one.
@MainActor
final class HectorFixSpeaker {
    static let shared = HectorFixSpeaker()
    private let synthesizer = AVSpeechSynthesizer()

    func speak(_ text: String, course: Course) {
        synthesizer.stopSpeaking(at: .immediate)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = SpeechVoice.voice(for: course)
        synthesizer.speak(utterance)
    }

    func stop() { synthesizer.stopSpeaking(at: .immediate) }

    /// Whether the device has a voice for the course; without one the card keeps its written fix and drops "Hear it".
    nonisolated static func canSpeak(_ course: Course) -> Bool { SpeechVoice.voice(for: course) != nil }
}

/// Hector's gentle correction under the learner's bubble: "Almost — one fix", the slip struck through, the fix in bold,
/// an optional note, "Hear it" (gold) and "Try again" (the mic).
struct HectorCorrectionCard: View {
    let correction: HectorCorrection
    /// False when the device has no voice for the course: the card still shows the written fix.
    let canHear: Bool
    let tryAgainDisabled: Bool
    /// The mic is open (hands-free listening or a recording): the fix must not be spoken into it.
    let hearDisabled: Bool
    let onHear: () -> Void
    let onTryAgain: () -> Void

    @Environment(\.alphonsoDS) private var ds

    /// What VoiceOver says for the correction line.
    var spoken: String { "You said \(correction.slip); better: \(correction.fix)" }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                DSIconView(icon: .check, size: 12)
                Text("Almost — one fix").dsText(.overline)
            }
            .foregroundStyle(ds.rightInk)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(ds.rightTint, in: Capsule())
            .accessibilityHidden(true)

            (Text(correction.slip).strikethrough(true, color: ds.wrong).foregroundColor(ds.wrong)
                + Text("  →  ").foregroundColor(ds.inkSoft)
                + Text(correction.fix).bold().foregroundColor(ds.rightInk))
                .dsText(.footnote)
                .accessibilityLabel(spoken)
                .accessibilityIdentifier("hectorCorrectionLine")

            if let note = correction.note {
                Text(note).dsText(.caption).foregroundStyle(ds.inkSoft)
            }

            HStack(spacing: 8) {
                if canHear {
                    Button(action: onHear) {
                        Label { Text("Hear it") } icon: { DSIconView(icon: .play, size: 13) }
                            .dsText(.footnote)
                            .foregroundStyle(ds.onAction)
                            .padding(.horizontal, 14)
                            .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                            .background(ds.action, in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(hearDisabled)
                    .opacity(hearDisabled ? 0.5 : 1)
                    .accessibilityLabel("Hear it: \(correction.fix)")
                    .accessibilityIdentifier("hectorHearIt")
                }
                Button(action: onTryAgain) {
                    Label { Text("Try again") } icon: { DSIconView(icon: .mic, size: 13) }
                        .dsText(.footnote)
                        .foregroundStyle(ds.brand)
                        .padding(.horizontal, 14)
                        .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                        .background(ds.sunk, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(tryAgainDisabled)
                .opacity(tryAgainDisabled ? 0.5 : 1)
                .accessibilityLabel("Try again: say it once more")
                .accessibilityIdentifier("hectorTryAgain")
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(ds.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(ds.line, lineWidth: 1))
        .padding(.leading, 39)
        .padding(.trailing, 40)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("hectorCorrection")
    }
}
