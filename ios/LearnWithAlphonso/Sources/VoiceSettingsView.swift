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
    @Environment(\.alphonsoDS) private var ds

    private var selected: String { prefs.voice(character, course: course) }
    private var defaultID: String { VoiceCatalog.defaultVoice(character, course: course) }

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage)
                    .dsText(.footnote)
                    .foregroundStyle(ds.wrongInk)
                    .dsListRow(top: AlphonsoDS.Space.s2)
            }
            ForEach(VoiceGender.allCases, id: \.self) { gender in
                let voices = VoiceCatalog.voices(for: course).filter { $0.gender == gender }
                if !voices.isEmpty {
                    DSOverline(gender.groupLabel).dsListRow(bottom: AlphonsoDS.Space.s2)
                    DSCard(spacing: AlphonsoDS.Space.s1) {
                        ForEach(Array(voices.enumerated()), id: \.element.id) { index, voice in
                            if index > 0 { Divider().overlay(ds.line) }
                            row(voice)
                        }
                    }
                    .dsListRow()
                }
            }
        }
        .dsSceneList(.profile)
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
        return HStack(spacing: AlphonsoDS.Space.s3) {
            Button {
                togglePreview(voice.id)
            } label: {
                Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                    .dsText(.footnote)
                    .foregroundStyle(ds.onAction)
                    .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                    .background(Circle().fill(ds.action))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isPlaying ? "Stop \(voice.name) preview" : "Play \(voice.name) preview")

            Button {
                Task { await choose(voice.id) }
            } label: {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            Text(voice.name).dsText(.headline).foregroundStyle(ds.ink)
                            if voice.id == defaultID {
                                DSPill(text: "Default", tone: .neutral)
                            }
                        }
                        Text("\(voice.accent) · \(voice.descriptor)")
                            .dsText(.caption).foregroundStyle(ds.inkSoft)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    if savingID == voice.id {
                        ProgressView().tint(ds.choice)
                    } else {
                        // The .isSelected trait below is what VoiceOver reads; the radio is how a sighted
                        // learner sees the same fact.
                        SettingsRadioDot(selected: isSelected)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
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
