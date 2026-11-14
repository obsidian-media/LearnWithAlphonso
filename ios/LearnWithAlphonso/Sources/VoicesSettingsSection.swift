import SwiftUI
import LearnWithAlphonsoKit

/// Settings > Voices: per course, which voice Alphonso and Hector speak with. Free for everyone (Hector's choice
/// applies when the learner has Pro). Saved on the account (auth user_metadata.voices) and cached on the device
/// (VoicePrefsCache), so a call starts with the right voice at once and the choice follows the learner to the web
/// and Android. The list itself is the Kit's VoiceCatalog, a mirror of src/lib/voice-catalog.ts.
struct VoicesSettingsSection: View {
    let session: Session
    @State private var course = "en"
    @State private var courseFollowed = false
    @State private var prefs = VoicePrefsCache().load()

    @Environment(\.alphonsoDS) private var ds

    private var courseOptions: [DSSegmented<String>.Option] {
        [.init(value: "en", label: "English"), .init(value: "fr", label: "French"), .init(value: "es", label: "Spanish")]
    }

    var body: some View {
        DSCard {
            DSSegmented(options: courseOptions, selection: $course, accessibilityLabel: "Course for voices")
            ForEach(VoiceCharacter.allCases) { character in
                SettingsDivider()
                NavigationLink {
                    VoicePickerView(session: session, character: character, course: course, prefs: $prefs)
                } label: {
                    HStack(spacing: AlphonsoDS.Space.s3) {
                        Text(character.settingsLabel).dsText(.headline).foregroundStyle(ds.ink)
                        Spacer(minLength: AlphonsoDS.Space.s2)
                        Text(VoiceCatalog.find(prefs.voice(character, course: course))?.name ?? "")
                            .dsText(.footnote).foregroundStyle(ds.inkSoft)
                        Image(systemName: "chevron.right").dsText(.caption).foregroundStyle(ds.inkFaint)
                            .accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(
                    "\(character.settingsLabel) in \(Self.courseName(course)): "
                        + (VoiceCatalog.find(prefs.voice(character, course: course))?.name ?? "")
                )
                .accessibilityHint("Opens the list of voices")
            }
            Text("Choose how Alphonso and Hector sound in each course. Your choice is saved to your account.")
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
        .onAppear {
            // Opens on the learner's current course; the other courses are one tap away.
            guard !courseFollowed else { return }
            courseFollowed = true
            course = ActiveCoursePreference.load(for: session.userID).wireCode
        }
        .task {
            await session.hydrateVoicePrefs()
            prefs = VoicePrefsCache().load()
        }
    }

    static func courseName(_ code: String) -> String {
        switch code {
        case "fr": return "French"
        case "es": return "Spanish"
        default: return "English"
        }
    }
}
