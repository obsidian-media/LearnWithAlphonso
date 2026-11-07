import SwiftUI
import LearnWithAlphonsoKit

/// "Edit your answers" on Profile (visual round 6, part 3; part 4 moved the picture into the Profile hero): opens the
/// first-run questions again.
struct ProfileEditAnswersRow: View {
    let onEditAnswers: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: onEditAnswers) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                FirstRunIconBadge(icon: "target")
                VStack(alignment: .leading, spacing: 2) {
                    Text("Edit your answers").dsText(.headline).foregroundStyle(ds.brand)
                    Text("Your goal, level, daily time, interests and flag").dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                DSIconView(icon: .chevron, size: 16).foregroundStyle(ds.inkSoft)
            }
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .padding(.vertical, AlphonsoDS.Space.s3)
        }
        .buttonStyle(FirstRunCardStyle(selected: false))
        .accessibilityElement(children: .combine)
    }
}

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
