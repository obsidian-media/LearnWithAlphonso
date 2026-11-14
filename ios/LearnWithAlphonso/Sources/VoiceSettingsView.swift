import AVFoundation
import SwiftUI
import LearnWithAlphonsoKit

/// The list for one character and course, grouped Male / Female. ▶ plays the voice's static clip from the web app
/// (learn.alphonsoecosystem.app/voices/<id>.mp3): streamed, not bundled, so the app does not carry ~2 MB of clips
/// for a screen most learners open once, and never a TTS call.
struct VoicePickerView: View {
    let session: Session
    let character: VoiceCharacter
    let course: String
    @Binding var prefs: VoicePrefs
    @State private var player: AVPlayer?
    @State private var playingID: String?
    @State private var savingID: String?
    @State private var errorMessage: String?

    private var selected: String { prefs.voice(character, course: course) }
    private var defaultID: String { VoiceCatalog.defaultVoice(character, course: course) }

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .listRowBackground(AlphonsoColor.parchment)
            }
            ForEach(VoiceGender.allCases, id: \.self) { gender in
                let voices = VoiceCatalog.voices(for: course).filter { $0.gender == gender }
                if !voices.isEmpty {
                    Section {
                        ForEach(voices) { voice in row(voice) }
                    } header: {
                        Text(gender.groupLabel)
                            .font(AlphonsoFont.sans(12, weight: .semiBold))
                            .tracking(0.4)
                            .foregroundStyle(AlphonsoColor.ember)
                    }
                    .listRowBackground(AlphonsoColor.parchment)
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
        .navigationTitle("\(character.settingsLabel) · \(VoicesSettingsSection.courseName(course))")
        .navigationBarTitleDisplayMode(.inline)
        .onDisappear { stopPreview() }
        .onReceive(NotificationCenter.default.publisher(for: .AVPlayerItemDidPlayToEndTime)) { _ in
            playingID = nil
        }
    }

    private func row(_ voice: VoiceOption) -> some View {
        let isSelected = voice.id == selected
        let isPlaying = playingID == voice.id
        return HStack(spacing: AlphonsoSpacing.sm + 4) {
            Button {
                togglePreview(voice.id)
            } label: {
                Image(systemName: isPlaying ? "stop.circle.fill" : "play.circle.fill")
                    .font(.title2)
                    .foregroundStyle(AlphonsoColor.moss)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(isPlaying ? "Stop \(voice.name) preview" : "Play \(voice.name) preview")

            Button {
                Task { await choose(voice.id) }
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: AlphonsoSpacing.sm) {
                            Text(voice.name)
                                .font(AlphonsoFont.sans(15, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                            if voice.id == defaultID {
                                Text("Default")
                                    .font(AlphonsoFont.sans(11, weight: .medium))
                                    .foregroundStyle(AlphonsoColor.inkSoft)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(Capsule().fill(AlphonsoColor.surface))
                            }
                        }
                        Text("\(voice.accent) · \(voice.descriptor)")
                            .font(AlphonsoFont.sans(13))
                            .foregroundStyle(AlphonsoColor.inkSoft)
                    }
                    Spacer()
                    if savingID == voice.id {
                        ProgressView().tint(AlphonsoColor.moss)
                    } else if isSelected {
                        // The .isSelected trait below is what VoiceOver reads; the checkmark is how a sighted
                        // learner sees the same fact.
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(AlphonsoColor.moss)
                            .accessibilityHidden(true)
                    }
                }
            }
            .buttonStyle(.borderless)
            .disabled(savingID != nil)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "\(voice.name)\(voice.id == defaultID ? ", default" : ""), \(voice.accent), \(voice.descriptor)"
            )
            .accessibilityAddTraits(isSelected ? .isSelected : [])
        }
    }

    private func togglePreview(_ id: String) {
        if playingID == id {
            stopPreview()
            return
        }
        stopPreview()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        let next = AVPlayer(url: VoiceCatalog.previewURL(for: id, base: AppConfig.apiBaseURL))
        player = next
        playingID = id
        next.play()
    }

    private func stopPreview() {
        player?.pause()
        player = nil
        playingID = nil
    }

    private func choose(_ id: String) async {
        guard id != selected else { return }
        errorMessage = nil
        savingID = id
        defer { savingID = nil }
        do {
            prefs = try await session.saveVoiceChoice(character, course: course, voice: id)
        } catch {
            errorMessage = "Couldn't save your voice. Check your connection and try again."
        }
    }
}
