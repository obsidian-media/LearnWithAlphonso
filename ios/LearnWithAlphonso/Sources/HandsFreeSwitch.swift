import SwiftUI
import LearnWithAlphonsoKit

/// The "Hands-free" switch for a voice call, with its once-per-device safety note. Used by the Practice calls
/// (scenario talks and campaign scenes). Turning it on is free: it is the same turn as a held press, so the server's
/// daily caps already apply. It is off every time a call starts (the voice controller is made per call and
/// `disappeared()` turns it off), the same as Hector's switch.
///
/// Lives inside the call's conversation sheet: a view under a presented sheet cannot present an alert, so the note is
/// presented from this view, which is part of the sheet's content.
struct HandsFreeSwitch: View {
    let voice: VoiceSessionController
    /// Who is on the call; the note names them.
    let partner: String

    @AppStorage(HandsFreeCopy.noteSeenKey) private var noteSeen = false
    @State private var showNote = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Toggle(HandsFreeCopy.toggle, isOn: Binding(
            get: { voice.isHandsFreeOn },
            set: { on in
                if on, !noteSeen {
                    showNote = true
                } else {
                    voice.setHandsFree(on)
                }
            }
        ))
        .dsText(.footnote)
        .tint(ds.choice)
        .padding(.horizontal, AlphonsoSpacing.md)
        .padding(.bottom, 6)
        .accessibilityIdentifier("practiceHandsFreeToggle")
        .alert(HandsFreeCopy.firstUseTitle, isPresented: $showNote) {
            Button(HandsFreeCopy.firstUseConfirm) {
                noteSeen = true
                voice.setHandsFree(true)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(HandsFreeCopy.firstUseBody(partner: partner))
        }
    }
}
