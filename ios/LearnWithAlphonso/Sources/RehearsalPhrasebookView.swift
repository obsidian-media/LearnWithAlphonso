import SwiftUI
import LearnWithAlphonsoKit

// Rehearsals: "Your phrases for this {event}". The key phrases of the brief, to hear again on the day. Tapping a phrase
// says it with /api/tts (Alphonso, labelled AI) and, with no consent, no connection or a failed request, with the device's
// own voice in the course language. What is shown and which voice is chosen is decided in the Kit (RehearsalPhrasebook).
// Compiled by CI's ios-app-build; not run on a device by the change that added it.

/// The plan's entry: a book, "Your phrases", how many, and a chevron. A row card, not a plain button.
struct RehearsalPhrasebookEntry: View {
    let count: Int
    let onOpen: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                DSIconView(icon: .book, size: 22)
                    .foregroundStyle(ds.choice)
                    .frame(width: 40, height: 40)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.sunk))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(RehearsalPhrasebook.entryTitle).dsText(.headline).foregroundStyle(ds.ink)
                    Text(RehearsalPhrasebook.entrySubtitle(count: count)).dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                Spacer(minLength: AlphonsoDS.Space.s2)
                DSIconView(icon: .chevron, size: 16).foregroundStyle(ds.inkSoft).accessibilityHidden(true)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(RehearsalPhrasebook.entryTitle). \(RehearsalPhrasebook.entrySubtitle(count: count))")
        .accessibilityAddTraits(.isButton)
    }
}

struct RehearsalPhrasebookView: View {
    let snapshot: RehearsalPhraseSnapshot
    let course: Course
    let session: Session
    let onBack: () -> Void

    @EnvironmentObject private var aiConsent: AIConsentStore
    @Environment(NetworkMonitor.self) private var networkMonitor: NetworkMonitor?
    @Environment(\.alphonsoDS) private var ds
    @AccessibilityFocusState private var titleFocused: Bool
    @State private var player = SayThePictureModelPlayer()
    /// Clips already fetched this visit, so a replay does not ask /api/tts again.
    @State private var clips = RehearsalPhraseAudioCache()
    @State private var deviceVoice: Bool?
    /// The tap being served: a newer tap, or leaving the screen, cancels it so a late clip never talks over the next one.
    @State private var hearing: Task<Void, Never>?
    /// Shown instead of a silent failure when nothing can speak the phrase.
    @State private var note: String?

    private var online: Bool { networkMonitor?.isConnected ?? true }

    /// The hint under the title: what the next tap will use, until a tap shows what really played.
    private var usingDeviceVoice: Bool {
        deviceVoice ?? (RehearsalPhrasebook.voice(hasAIConsent: aiConsent.isGranted, isOnline: online, modelFailed: false) == .device)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                Button(RehearsalPhrasebook.backLabel) { onBack() }
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkSoft)
                    .frame(minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Text(RehearsalPhrasebook.title(kind: snapshot.kind)).dsText(.title).foregroundStyle(ds.ink)
                        .accessibilityAddTraits(.isHeader)
                        .accessibilityFocused($titleFocused)
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        Text(RehearsalPhrasebook.hint(deviceVoice: usingDeviceVoice)).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        if !usingDeviceVoice { AILabelView() }
                    }
                    if let note { Text(note).dsText(.footnote).foregroundStyle(ds.inkSoft) }
                }
                ForEach(Array(snapshot.rows.enumerated()), id: \.offset) { _, row in phraseRow(row) }
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .task {
            // The title is not in the accessibility tree on the first frame, so focus it after a short hop.
            try? await Task.sleep(nanoseconds: 350_000_000)
            titleFocused = true
        }
        .onDisappear { hearing?.cancel(); player.stop(); HectorFixSpeaker.shared.stop() }
    }

    /// The whole row is one button: VoiceOver reads the phrase and its meaning, and activating it hears the phrase.
    private func phraseRow(_ row: RehearsalPhraseRow) -> some View {
        Button { hear(row.text) } label: {
            HStack(spacing: AlphonsoDS.Space.s3) {
                DSIconView(icon: .speaker, size: 20)
                    .foregroundStyle(ds.card)
                    .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                    .background(Circle().fill(ds.choice))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.text).dsText(.headline).foregroundStyle(ds.ink)
                    if let meaning = row.meaning { Text(meaning).dsText(.caption).foregroundStyle(ds.inkSoft) }
                }
                Spacer(minLength: 0)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.meaning.map { "\(row.text). \($0)" } ?? row.text)
        .accessibilityHint(RehearsalPhrasebook.hearLabel(row.text))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: Text(RehearsalPhrasebook.hearLabel(row.text))) { hear(row.text) }
    }

    /// A tap: whatever is playing stops, any earlier tap still fetching is cancelled, then this phrase is said.
    private func hear(_ phrase: String) {
        hearing?.cancel()
        player.stop()
        HectorFixSpeaker.shared.stop()
        note = nil
        hearing = Task { await play(phrase) }
    }

    /// Alphonso's voice when allowed, online and working; otherwise the device voice in the course language. A cancelled
    /// tap says nothing: it is never a reason to fall back.
    private func play(_ phrase: String) async {
        var played = false
        if RehearsalPhrasebook.voice(hasAIConsent: aiConsent.isGranted, isOnline: online, modelFailed: false) == .model,
           let audio = await clip(for: phrase), !Task.isCancelled {
            played = player.play(audio)
        }
        switch RehearsalPhrasebook.afterModel(played: played, cancelled: Task.isCancelled) {
        case .stop:
            if played { deviceVoice = false }
        case .deviceVoice:
            guard HectorFixSpeaker.canSpeak(course) else { note = RehearsalPhrasebook.noDeviceVoiceNote; return }
            deviceVoice = true
            HectorFixSpeaker.shared.speak(phrase, course: course)
        }
    }

    private func clip(for phrase: String) async -> Data? {
        if let hit = clips.clip(for: phrase) { return hit }
        guard let token = await session.freshAccessToken() else { return nil }
        let session = self.session
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        let voice = VoicePrefsCache().voice(.alphonso, course: course.wireCode)
        // A cancelled fetch throws too: the caller checks Task.isCancelled, so it is never read as "the model failed".
        do {
            let audio = try await client.synthesizeSpeech(text: phrase, voice: voice, course: course.wireCode)
            guard !Task.isCancelled else { return nil }
            clips.store(audio, for: phrase)
            return audio
        } catch {
            return nil
        }
    }
}
