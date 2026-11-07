import SwiftUI
import LearnWithAlphonsoKit

/// Settings > Sound effects: one switch, on by default and stored on this device. Off is completely silent; the
/// light haptics follow the system haptics setting instead.
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
            Text("Short sounds for a right or wrong answer, a finished lesson and a call. They never play over Alphonso or Hector.")
                .dsText(.caption)
                .foregroundStyle(AlphonsoColor.inkSoft)
        }
        .listRowBackground(AlphonsoColor.parchment)
    }
}
