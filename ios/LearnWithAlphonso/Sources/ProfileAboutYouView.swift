import SwiftUI
import LearnWithAlphonsoKit

/// The picture picker on its own, from Profile or Settings: the 16 animals and the initial, saved to avatar_seed.
struct AvatarPickerSheet: View {
    let session: Session
    let name: String
    let current: String
    let onSaved: (String) -> Void

    @State private var value: String
    @State private var busy = false
    @State private var error: String?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.alphonsoDS) private var ds

    init(session: Session, name: String, current: String, onSaved: @escaping (String) -> Void) {
        self.session = session
        self.name = name
        self.current = current
        self.onSaved = onSaved
        _value = State(initialValue: current)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                    Text("Your friends and leaderboards show it.")
                        .dsText(.footnote)
                        .foregroundStyle(ds.inkSoft)
                    AvatarPickerGrid(value: value, name: name, initialsSeed: ProfileAvatars.initialsSeed(current: current)) { value = $0 }
                    if let error {
                        Text(error).dsText(.footnote).foregroundStyle(ds.wrongInk)
                    }
                }
                .padding(AlphonsoDS.Space.s5)
            }
            .background(ds.surface.ignoresSafeArea())
            .navigationTitle("Profile picture")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(busy ? "Saving\u{2026}" : "Save") { Task { await save() } }
                        .disabled(busy || value == current)
                }
            }
        }
        .lessonLightScope()
    }

    private func save() async {
        guard ProfileAvatars.isAllowedSeed(value), let token = await session.freshAccessToken(), let userID = session.userID else {
            error = "Couldn't save your picture. Try again."
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        do {
            let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
            try await client.updateProfileAvatarSeed(value, userID: userID)
            onSaved(value)
            dismiss()
        } catch {
            self.error = "Couldn't save your picture. Try again."
        }
    }
}
