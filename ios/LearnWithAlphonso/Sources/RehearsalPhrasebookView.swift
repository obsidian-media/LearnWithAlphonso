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
    /// "Say it": one recording at a time across the rows (the rules live in the Kit). Held in memory only; nothing the
    /// learner says is stored or replayed.
    @State private var say = PhraseSayState()
    @State private var voiceSession = VoiceSessionController()
    /// The row whose attempt last ran, so the existing mic / upload / quota message sits under that phrase.
    @State private var errorRow: Int?
    @State private var showDisclosure = false
    /// A short note under one row: the offline line, or "Tap Say it again" after the learner allows AI.
    @State private var rowNote: [Int: String] = [:]
    /// The row that needs the learner's consent, so "Tap Say it again" lands on it.
    @State private var consentRow: Int?

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
                    Text(PhraseSayCopy.framing).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    if let note { Text(note).dsText(.footnote).foregroundStyle(ds.inkSoft) }
                }
                ForEach(Array(snapshot.rows.enumerated()), id: \.offset) { index, row in phraseRow(row, index: index) }
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .task {
            // The title is not in the accessibility tree on the first frame, so focus it after a short hop.
            try? await Task.sleep(nanoseconds: 350_000_000)
            titleFocused = true
        }
        .aiDisclosureSheet(isPresented: $showDisclosure) {
            if let row = consentRow { rowNote[row] = PhraseSayCopy.tapAgain }
        }
        .onAppear {
            voiceSession.onCapture = { capture in await handle(capture) }
            voiceSession.appeared()
        }
        .onDisappear {
            hearing?.cancel(); player.stop(); HectorFixSpeaker.shared.stop()
            voiceSession.disappeared()
            voiceSession.onCapture = nil
            say.reset()
        }
        // An interruption (a phone call, Siri) or a refused microphone never reaches onCapture: the Kit frees the row.
        .onChange(of: voiceSession.phase) { _, phase in
            say.voiceChanged(to: phase)
        }
        // The server says consent is missing: ask, instead of swallowing it. After allowing, the row says to tap again.
        .onChange(of: voiceSession.failure) { _, failure in
            if failure == .aiConsentRequired {
                consentRow = errorRow
                showDisclosure = true
            }
        }
        // The recording stops itself at the shared cap, as on the other speaking screens.
        .task(id: voiceSession.isRecording) {
            guard voiceSession.isRecording else { return }
            try? await Task.sleep(for: .seconds(SayThePicture.maxRecordSeconds))
            if !Task.isCancelled, voiceSession.isRecording {
                say.recordingEnded()
                voiceSession.pressEnded()
            }
        }
        .onChange(of: voiceSession.isRecording) { _, recording in
            if recording, say.isRecording { AccessibilityNotification.Announcement(PhraseSayCopy.listening).post() }
        }
        .onChange(of: say.results) { old, new in
            for (row, check) in new where old[row] != check {
                AccessibilityNotification.Announcement(PhraseSayCopy.resultText(check)).post()
            }
        }
    }


    /// The row: "Hear" (the phrase and its meaning, one button) and "Say" (a microphone), with the outcome inline below.
    /// While one row is recording or being checked, the other rows' microphones and every Hear button are off.
    private func phraseRow(_ row: RehearsalPhraseRow, index: Int) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            HStack(spacing: AlphonsoDS.Space.s2) {
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
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!say.hearEnabled)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(row.meaning.map { "\(row.text). \($0)" } ?? row.text)
                .accessibilityHint(RehearsalPhrasebook.hearLabel(row.text))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction(named: Text(RehearsalPhrasebook.hearLabel(row.text))) { if say.hearEnabled { hear(row.text) } }

                micButton(row.text, index: index)
            }
            if let line = say.status(row: index, voicePhase: voiceSession.phase) {
                Text(line).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .accessibilityIdentifier("phraseSayStatus\(index)")
            }
            if errorRow == index, let message = visibleError {
                Text(message).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            if let note = rowNote[index] {
                Text(note).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))
    }

    private func micButton(_ phrase: String, index: Int) -> some View {
        // The stop icon, like "Listening...", waits for the engine to be recording (not the permission prompt).
        let recordingHere = say.isRecording && say.busyRow == index && voiceSession.isRecording
        return Button { micTapped(index: index) } label: {
            Group {
                if recordingHere {
                    Image(systemName: "stop.fill").dsText(.headline)
                } else {
                    DSIconView(icon: .mic, size: 20)
                }
            }
            .foregroundStyle(recordingHere ? ds.card : ds.choice)
            .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
            .background(Circle().fill(recordingHere ? ds.choice : ds.sunk))
        }
        .buttonStyle(.plain)
        .disabled(!say.micEnabled(row: index))
        .accessibilityLabel(PhraseSayCopy.micLabel(phrase: phrase))
        .accessibilityValue(recordingHere ? PhraseSayCopy.listening : "")
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("phraseSayMic\(index)")
    }

    // MARK: Say it

    /// The existing mic / upload / quota message. Neutral colour, never red.
    private var visibleError: String? {
        if voiceSession.failure == .aiConsentRequired { return nil }
        // Permission denied: say so under the row; a tap tries the permission request again, as on the other screens.
        if voiceSession.microphoneUnavailable { return VoiceCopy.microphoneOff }
        return voiceSession.failure?.cardMessage()
            ?? (voiceSession.recorderStartFailed ? VoiceCopy.microphoneCouldNotStart : nil)
    }

    private func micTapped(index: Int) {
        // Voice goes to Deepgram, so it needs the learner's AI consent: ask, never block the phrasebook.
        rowNote[index] = nil
        guard aiConsent.isGranted else { consentRow = index; showDisclosure = true; return }
        // Transcribing needs a connection; the phrases can still be heard.
        guard online else { if say.busyRow == nil { rowNote[index] = PhraseSayCopy.offline }; return }
        // A tap while the permission prompt is up would stop a recording that has not started.
        if case .requestingPermission = voiceSession.phase { return }
        switch say.micTapped(row: index) {
        case .startRecording:
            hearing?.cancel(); player.stop(); HectorFixSpeaker.shared.stop()
            note = nil
            errorRow = index
            if !voiceSession.pressBegan() { say.failed() }
        case .stopRecording:
            voiceSession.pressEnded()
        case .ignore:
            break
        }
    }

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            // Silence reads "Not understood yet".
            say.heardNothing()
        case let .audio(audio, generation, debugTiming):
            say.recordingEnded()
            await transcribe(audio: audio, generation: generation, debugTiming: debugTiming)
        }
    }

    private func transcribe(audio: Data, generation: Int, debugTiming: String) async {
        guard let row = say.busyRow, snapshot.rows.indices.contains(row) else { say.failed(); return }
        let expected = snapshot.rows[row].text
        guard let accessToken = await session.freshAccessToken() else {
            say.failed()
            voiceSession.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        do {
            // The existing STT call, quota and errors; the per-word list is what phrase mode reads.
            let result = try await client.transcribeWithWords(
                audio: audio, mimeType: "audio/m4a", course: course.sttCourseCode, debugTiming: debugTiming)
            guard voiceSession.isCurrent(generation) else { return }
            let heard = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if heard.isEmpty { say.heardNothing() } else { say.transcribed(expected: expected, heard: heard, words: result.words) }
        } catch {
            say.failed()
            voiceSession.fail(generation, TutorError.from(error))
        }
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
