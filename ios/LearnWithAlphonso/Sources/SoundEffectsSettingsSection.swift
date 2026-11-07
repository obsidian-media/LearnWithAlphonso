import SwiftUI
import LearnWithAlphonsoKit

/// Settings > Sound effects: one switch, on by default and stored on this device. Off is completely silent and
/// turns the light haptics off too.
struct SoundEffectsSettingsSection: View {
    @AppStorage(SoundEffectsPreference.key) private var soundEffects = SoundEffectsPreference.defaultValue

    var body: some View {
        Section {
            Toggle(isOn: $soundEffects) {
                Text("Sound effects")
                    .dsText(.body)
            }
            .tint(AlphonsoColor.moss)
            .accessibilityIdentifier("soundEffectsToggle")
        } footer: {
            Text("Short sounds for a right or wrong answer, a finished lesson and a call. They never play over Alphonso or Hector. Turn them off and the light vibrations stop too.")
                .dsText(.caption)
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }
}
