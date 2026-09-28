import SwiftUI
import AVFoundation
import Observation
import LearnWithAlphonsoKit

/// Scenario picker -- reuses the already-bundled (previously unused)
/// scenarios.json via ContentStore.scenarios.
struct ConversationView: View {
    let contentStore: ContentStore
    let session: Session

    var body: some View {
        NavigationStack {
            List {
                // V4 candidate #4: connected multi-scene campaigns,
                // additive alongside the scenarios below -- see
                // CampaignView.swift.
                if !contentStore.campaigns.isEmpty {
                    CampaignPickerSection(campaigns: contentStore.campaigns, session: session)
                }
                let scenarioRows = ForEach(contentStore.scenarios) { scenario in
                    NavigationLink {
                        ConversationSessionView(scenario: scenario, session: session)
                    } label: {
                        AlphonsoRowCard(title: scenario.title, subtitle: scenario.blurb, leadingEmoji: scenario.emoji)
                    }
                }
                Section {
                    scenarioRows
                } header: {
                    if !contentStore.campaigns.isEmpty {
                        Text("Scenarios")
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                }
                .listRowBackground(Color.clear)
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            .navigationTitle("Practice speaking")
        }
        .tint(AlphonsoColor.moss)
    }
}

/// V1 scope: hold the mic button to record, release to send. No live
/// streaming/interruption -- one full turn at a time (record -> transcribe
/// -> chat reply -> speak), matching what /api/stt (pre-recorded, not
/// streaming) supports.
private struct ConversationSessionView: View {
    let scenario: Scenario
    let session: Session

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var turns: [ChatMessage] = []
    @State private var recorder = TurnRecorder()
    @State private var isRecording = false
    @State private var phase: Phase = .idle
    @State private var errorMessage: String?
    @State private var player: AVAudioPlayer?
    // V3 package 3a: adaptive difficulty + pronunciation-clarity heuristic.
    @State private var cefrLevel: String?
    @State private var confidenceByTurnIndex: [Int: Double] = [:]

    private enum Phase: Equatable {
        case idle
        case transcribing
        case thinking
        case speaking
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(turns.enumerated()), id: \.offset) { index, turn in
                            bubble(for: turn, confidence: confidenceByTurnIndex[index]).id(index)
                        }
                    }
                    .padding()
                }
                .onChange(of: turns.count) {
                    if reduceMotion {
                        proxy.scrollTo(turns.count - 1, anchor: .bottom)
                    } else {
                        withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .padding(.horizontal)
            }

            micButton
                .padding()
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(scenario.title)
        .navigationBarTitleDisplayMode(.inline)
        .aiDisclosureGate()
        .task {
            turns = [ChatMessage(role: "assistant", content: scenario.opener)]
            // Best-effort -- if this fails, chat() just gets nil and skips
            // the difficulty hint, same as before this feature existed.
            if let accessToken = session.accessToken {
                let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
                cefrLevel = try? await client.fetchCefrLevel(course: "en")
            }
        }
        .onDisappear {
            guard turns.count >= 4, let accessToken = session.accessToken else { return }
            let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let transcript = turns
            Task { _ = try? await client.analyzeWeaknesses(transcript: transcript) }
        }
    }

    private func bubble(for turn: ChatMessage, confidence: Double?) -> some View {
        VStack(alignment: turn.role == "user" ? .trailing : .leading, spacing: 2) {
            HStack {
                if turn.role == "assistant" { Spacer(minLength: 40) }
                Text(turn.content)
                    .font(AlphonsoFont.sans(15))
                    .foregroundStyle(turn.role == "user" ? .white : AlphonsoColor.ink)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        turn.role == "user" ? AlphonsoColor.moss : AlphonsoColor.parchment,
                        in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
                    )
                if turn.role == "user" { Spacer(minLength: 40) }
            }
            // V3 package 3a: lightweight pronunciation-clarity heuristic
            // from Deepgram's own utterance-level confidence, not real
            // phoneme-level scoring -- see AIConversationClient.transcribe.
            if let confidence {
                Text(clarityLabel(confidence))
                    .font(AlphonsoFont.sans(11))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .padding(.trailing, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
    }

    private func clarityLabel(_ confidence: Double) -> String {
        if confidence >= 0.85 { return "🟢 Clear" }
        if confidence >= 0.6 { return "🟡 Okay" }
        return "🔴 Unclear"
    }

    private var micButton: some View {
        Group {
            switch phase {
            case .transcribing, .thinking, .speaking:
                ProgressView(label(for: phase)).tint(AlphonsoColor.moss)
            case .idle:
                Circle()
                    .fill(isRecording ? AlphonsoColor.destructive : AlphonsoColor.moss)
                    .frame(width: 72, height: 72)
                    .overlay(Image(systemName: "mic.fill").foregroundStyle(.white).font(.title2))
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in if !isRecording { startRecording() } }
                            .onEnded { _ in stopRecordingAndSend() }
                    )
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func label(for phase: Phase) -> String {
        switch phase {
        case .transcribing: return "Listening..."
        case .thinking: return "Thinking..."
        case .speaking: return "..."
        case .idle: return ""
        }
    }

    private func startRecording() {
        errorMessage = nil
        // Permission is asked for EXPLICITLY rather than left to the implicit
        // prompt AVAudioRecorder.record() raises. A denied microphone does
        // not make start() throw -- record() just returns false and the file
        // stays empty, which api/stt.ts's own 512-byte floor then rejects as
        // "Empty or missing audio" -- the minimum-recording-duration fix
        // (found the same day) only helps a too-short *successful* capture;
        // it cannot produce audio from a recorder that never actually
        // started. Same fix SpeakQuestionCard already had for exactly this
        // reason, applied here after the duration fix alone did not resolve
        // a live report of the same symptom on Hector.
        requestMicrophonePermission { granted in
            guard granted else {
                errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
                return
            }
            do {
                try recorder.start()
                isRecording = true
            } catch {
                errorMessage = "Couldn't access the microphone. Check Settings > Privacy > Microphone."
            }
        }
    }

    /// Calls back on the main actor whether or not permission was granted.
    private func requestMicrophonePermission(_ completion: @escaping @MainActor (Bool) -> Void) {
        if #available(iOS 17.0, *) {
            AVAudioApplication.requestRecordPermission { granted in
                Task { @MainActor in completion(granted) }
            }
        } else {
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                Task { @MainActor in completion(granted) }
            }
        }
    }

    private func stopRecordingAndSend() {
        guard isRecording else { return }
        isRecording = false
        Task {
            // A quick tap (or the very first recording of an app launch,
            // before the audio hardware has finished warming up after
            // AVAudioSession.setActive) can finalize before the encoder
            // has written anything meaningful -- api/stt.ts's own
            // `file.size < 512` guard rejects that with a raw "Empty or
            // missing audio" server error, which a learner just sees as
            // Practice being broken (found live 2026-09-28). Giving the
            // recorder a real minimum run first, then treating a still-
            // too-small result the same as an empty transcript (silently
            // back to idle, an existing and already-correct posture just
            // above) fixes both causes at once without ever bothering the
            // server with a request that cannot succeed.
            if let remaining = recorder.remainingTimeToMinimumDuration() {
                try? await Task.sleep(nanoseconds: UInt64(remaining * 1_000_000_000))
            }
            guard let audio = await recorder.stop(), audio.count >= TurnRecorder.minimumAudioBytes else { return }
            await sendTurn(audio: audio)
        }
    }

    private func sendTurn(audio: Data) async {
        guard let accessToken = await session.freshAccessToken() else {
            errorMessage = "You've been signed out. Please sign in again."
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { accessToken },
            // Session used to refresh its token only once, at cold
            // launch -- a turn attempted more than ~an hour into a
            // session always 401'd here with no visible reason (this
            // was Hector re-parenting Phase 0's own bug report; see
            // Session.freshAccessToken's doc comment for the full
            // story). `freshAccessToken` above already refreshes
            // proactively when close to expiry; this closure is the
            // one-retry backstop for what that can still miss.
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
        )
        do {
            phase = .transcribing
            let result = try await client.transcribe(audio: audio, mimeType: "audio/m4a")
            guard !result.text.trimmingCharacters(in: .whitespaces).isEmpty else {
                phase = .idle
                return
            }
            if let confidence = result.confidence {
                confidenceByTurnIndex[turns.count] = confidence
            }
            turns.append(ChatMessage(role: "user", content: result.text))

            phase = .thinking
            let reply = try await client.chat(messages: turns, systemPrompt: scenario.systemPrompt, cefrLevel: cefrLevel)
            turns.append(ChatMessage(role: "assistant", content: reply))

            phase = .speaking
            let audioReply = try await client.synthesizeSpeech(text: reply)
            player = try AVAudioPlayer(data: audioReply)
            // Same discarded-Bool shape as AVAudioRecorder.record() (found
            // in the same sweep, 2026-09-28): play() can return false --
            // an audio session conflict, most plausibly, right after this
            // exact screen was just recording -- without throwing. The
            // turn itself already succeeded (the reply text is appended
            // above), so this stays informational rather than resetting
            // the turn as failed; silence with zero signal would have
            // been strictly worse.
            if player?.play() == false {
                errorMessage = "Got a reply, but couldn't play it back."
            }
            phase = .idle
        } catch {
            // Was unconditionally "Something went wrong. Try again." --
            // discarded the server's own message even when it had one,
            // e.g. ai-quota.server.ts's real "Daily CHAT limit reached
            // (60/day). Try again tomorrow." A learner who'd simply used
            // up today's AI quota saw the same generic text as an actual
            // crash, with no way to tell the difference.
            if case let AIConversationError.server(_, message?) = error, !message.isEmpty {
                errorMessage = message
            } else {
                errorMessage = "Something went wrong. Try again."
            }
            phase = .idle
        }
    }
}

/// AVAudioRecorder.record() returns false rather than throwing on failure
/// -- this makes that a catchable error instead of a silently-ignored Bool.
private enum RecordingStartError: Error {
    case recordCallFailed
}

/// Wraps AVAudioRecorder for a single hold-to-talk turn: start() begins
/// recording to a fresh temp file, stop() finalizes it and returns the
/// recorded bytes (nil if nothing was captured).
@Observable
private final class TurnRecorder: NSObject, AVAudioRecorderDelegate {
    /// Below this, `api/stt.ts`'s own floor (`file.size < 512`) would
    /// reject it anyway -- set well above that so a genuinely-too-short
    /// recording is caught locally, instantly, instead of round-tripping
    /// to the server first for the same verdict.
    static let minimumAudioBytes = 4_096
    /// Below this held duration, the recording is likely to still be
    /// mid-hardware-warm-up (or was just a quick tap, not a real hold) --
    /// see `stopRecordingAndSend`'s own doc comment for the full story.
    private static let minimumDuration: TimeInterval = 0.4

    private var recorder: AVAudioRecorder?
    private var fileURL: URL?
    private var startedAt: Date?

    func start() throws {
        // Set before touching the session, so the flag is already true
        // when iOS delivers interruption-began to the podcast player --
        // that is how it tells an in-app mic takeover from a phone call.
        // See RecordingState.
        //
        // Wrapped in do/catch (found in the same sweep, 2026-09-28,
        // looking for every way this could still fail silently): began()
        // must be called before touching the session, but if setCategory,
        // setActive, the AVAudioRecorder initializer, or record() itself
        // then throws/fails, nothing previously called the matching
        // ended() -- RecordingState.isRecording would stay stuck true
        // forever. PodcastAudioPlayer.handleInterruption reads that flag
        // to decide whether a REAL interruption (a phone call) should
        // resume playback after -- stuck true means a later genuine call
        // would never resume the podcast, for the rest of the app's
        // process lifetime, from a failure that has nothing to do with
        // phone calls at all.
        RecordingState.shared.began()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default)
            try session.setActive(true)

            let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
            ]
            let newRecorder = try AVAudioRecorder(url: url, settings: settings)
            newRecorder.delegate = self
            // record() returns false rather than throwing when it can't
            // actually start (a session conflict, an interruption landing
            // at this exact instant) -- the same "reports success,
            // produces nothing" shape as the missing-permission bug just
            // fixed, just a different trigger. Caught here, immediately
            // and attributably, instead of silently producing an empty
            // file the server rejects 400ms+ later with no indication of
            // why.
            guard newRecorder.record() else {
                throw RecordingStartError.recordCallFailed
            }
            recorder = newRecorder
            fileURL = url
            startedAt = Date()
        } catch {
            RecordingState.shared.ended()
            throw error
        }
    }

    /// How much longer the caller should wait before actually finalizing,
    /// so the recorder always gets at least `minimumDuration` of real run
    /// time. Nil if that minimum has already elapsed (the normal case for
    /// an actual hold) or if no recording is in progress.
    func remainingTimeToMinimumDuration() -> TimeInterval? {
        guard let startedAt else { return nil }
        let remaining = Self.minimumDuration - Date().timeIntervalSince(startedAt)
        return remaining > 0 ? remaining : nil
    }

    private var finishContinuation: CheckedContinuation<Void, Never>?

    /// Waits for AVAudioRecorderDelegate's audioRecorderDidFinishRecording
    /// before reading the file back -- stop() returning is documented to
    /// itself trigger that delegate callback, which only makes sense if
    /// finalizing the file (writing its container's real duration/sample
    /// table) isn't guaranteed complete just because stop() returned.
    ///
    /// **Confirmed live, not theoretical** (2026-09-28): production
    /// Deepgram logs showed every failing request reporting a duration of
    /// ~0.46-0.51s, tightly clustered, regardless of the actual file size
    /// (60-61KB -- several real seconds of audio at this bitrate). Reading
    /// the file immediately after stop() sometimes caught it mid-
    /// finalization: the raw audio bytes were already flushed (correct
    /// file size), but the container's own duration metadata still
    /// reflected an earlier, incomplete snapshot, so Deepgram only
    /// recognized that first fraction of a second as real audio. Explains
    /// why one attempt worked at all (pure timing) and most didn't.
    func stop() async -> Data? {
        RecordingState.shared.ended()
        guard let recorder, let fileURL else { return nil }
        await withCheckedContinuation { continuation in
            finishContinuation = continuation
            recorder.stop()
        }
        self.recorder = nil
        startedAt = nil
        defer { self.fileURL = nil }
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        try? FileManager.default.removeItem(at: fileURL)
        return data
    }

    // AVAudioRecorderDelegate fires on an arbitrary thread, not
    // necessarily the main actor -- resume(), unlike touching stored
    // properties, is documented safe to call from any thread.
    nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        Task { @MainActor in
            self.finishContinuation?.resume()
            self.finishContinuation = nil
        }
    }
}
