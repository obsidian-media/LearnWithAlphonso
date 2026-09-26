import SwiftUI
import UniformTypeIdentifiers
import LearnWithAlphonsoKit

/// Theme picker + account + sign out -- the app's first real settings
/// surface (there was none before; "Sign out" lived directly in
/// LessonBrowserView's toolbar). Ports the web's theme picker
/// (`profile.tsx`) to iOS: three themes (Meadow/Studio Ink/Manuscript,
/// see DesignSystem/AlphonsoTheme.swift), applied instantly and locally
/// via `AlphonsoThemeManager`, synced to `profiles.theme` in the
/// background so it round-trips with the web app on the same account.
///
/// The Account section (App Store Guideline 5.1.1(v): an app that supports
/// account creation must let a user initiate deletion from inside the app,
/// not just link out to a web page) mirrors `profile.tsx`'s "Your data"
/// section: export calls the same GDPR export the web app already has,
/// and deletion requires typing DELETE, same as web.
struct SettingsView: View {
    let session: Session

    @State private var selectedTheme = AlphonsoThemeManager.shared.themeID

    @State private var displayName = ""
    @State private var avatarSeed = ""
    @State private var isSavingName = false
    @State private var isShufflingAvatar = false
    @State private var identityErrorMessage: String?

    @State private var isExportingData = false
    @State private var exportDocument: AccountExportDocument?
    @State private var isPresentingExporter = false
    @State private var isDeletingAccount = false
    @State private var isPresentingDeleteConfirmation = false
    @State private var deleteConfirmationText = ""
    @State private var accountErrorMessage: String?
    @State private var isPresentingLinkHector = false

    var body: some View {
        NavigationStack {
            let themeRows = ForEach(AlphonsoThemeID.allCases) { themeID in
                Button {
                    select(themeID)
                } label: {
                    HStack(spacing: AlphonsoSpacing.sm + 4) {
                        ThemeSwatch(themeID: themeID)
                        Text(themeID.displayName)
                            .font(AlphonsoFont.sans(15, weight: .medium))
                            .foregroundStyle(AlphonsoColor.ink)
                        Spacer()
                        if selectedTheme == themeID {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(AlphonsoColor.moss)
                        }
                    }
                }
            }
            List {
                Section {
                    HStack(spacing: AlphonsoSpacing.sm + 4) {
                        // A single letter never grows in length, but its
                        // FONT does with Dynamic Type -- a fixed 40x40
                        // frame with the letter as an .overlay doesn't clip
                        // it (overlay isn't clipped to its base shape by
                        // default), so it would spill outside the circle
                        // at large accessibility sizes instead. Background,
                        // not overlay, plus a minimum (not fixed) frame on
                        // the TEXT lets the circle grow to actually contain it.
                        Text(displayName.prefix(1).uppercased())
                            .font(AlphonsoFont.sans(16, weight: .semiBold))
                            .foregroundStyle(.white)
                            .frame(minWidth: 40, minHeight: 40)
                            .background(Circle().fill(AvatarColor.forSeed(avatarSeed.isEmpty ? "a" : avatarSeed)))
                        Button {
                            Task { await shuffleAvatar() }
                        } label: {
                            if isShufflingAvatar {
                                ProgressView().tint(AlphonsoColor.moss)
                            } else {
                                Text("Shuffle")
                            }
                        }
                        .font(AlphonsoFont.sans(14, weight: .medium))
                        .disabled(isShufflingAvatar)
                    }
                    TextField("Display name", text: $displayName)
                        .font(AlphonsoFont.sans(15))
                        .onSubmit { Task { await saveDisplayName() } }
                    Button {
                        Task { await saveDisplayName() }
                    } label: {
                        if isSavingName {
                            ProgressView().tint(AlphonsoColor.moss)
                        } else {
                            Text("Save Name")
                        }
                    }
                    .font(AlphonsoFont.sans(15, weight: .medium))
                    .disabled(isSavingName || displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if let identityErrorMessage {
                        Text(identityErrorMessage)
                            .font(AlphonsoFont.sans(13))
                            .foregroundStyle(AlphonsoColor.destructive)
                    }
                } header: {
                    Text("Profile")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                } footer: {
                    // Visible on LeaderboardView, FriendsView, and DuelsView
                    // (see AvatarColor.swift's own doc comment) -- this is
                    // the same "shown to strangers" surface the report/block
                    // menu on those screens already exists for.
                    Text("Your name and avatar color are visible to other learners on leaderboards, friends, and duels.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .listRowBackground(AlphonsoColor.parchment)

                Section {
                    themeRows
                } header: {
                    Text("Theme")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                }
                .listRowBackground(AlphonsoColor.parchment)

                Section {
                    Button {
                        Task { await exportData() }
                    } label: {
                        if isExportingData {
                            ProgressView().tint(AlphonsoColor.moss)
                        } else {
                            Text("Export My Data")
                        }
                    }
                    .font(AlphonsoFont.sans(15, weight: .medium))
                    .disabled(isExportingData || isDeletingAccount)

                    // Hector re-parenting Phase 2 (docs/superpowers/specs/
                    // 2026-09-26-hector-reparenting-design.md): the one
                    // moment someone who signed into Hector before Phase 0
                    // shipped -- and hasn't reopened Hector since -- can
                    // still be reached. Always offered, not just shown
                    // when unlinked (no read endpoint exists to check
                    // that, and re-linking an already-linked account is a
                    // harmless no-op upsert).
                    Button {
                        isPresentingLinkHector = true
                    } label: {
                        Text("Link Hector Account")
                    }
                    .font(AlphonsoFont.sans(15, weight: .medium))
                    .disabled(isExportingData || isDeletingAccount)

                    Button(role: .destructive) {
                        deleteConfirmationText = ""
                        isPresentingDeleteConfirmation = true
                    } label: {
                        if isDeletingAccount {
                            ProgressView().tint(AlphonsoColor.destructive)
                        } else {
                            Text("Delete My Account")
                        }
                    }
                    .font(AlphonsoFont.sans(15, weight: .medium))
                    .disabled(isExportingData || isDeletingAccount)

                    if let accountErrorMessage {
                        Text(accountErrorMessage)
                            .font(AlphonsoFont.sans(13))
                            .foregroundStyle(AlphonsoColor.destructive)
                    }
                } header: {
                    Text("Account")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                } footer: {
                    // "Everything we hold about you" would overclaim: export
                    // and deletion both cover this Alphonso account only, not
                    // a separate Hector account -- see the delete alert's
                    // message below and privacy.tsx's "Hector (advanced
                    // voice tutor)" section.
                    Text("Download the data in your Alphonso account, or permanently erase it.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .listRowBackground(AlphonsoColor.parchment)

                Section {
                    Button("Sign out", role: .destructive) { session.signOut() }
                        .font(AlphonsoFont.sans(15, weight: .medium))
                }
                .listRowBackground(AlphonsoColor.parchment)
            }
            .scrollContentBackground(.hidden)
            .background(AlphonsoColor.surface)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .task { await loadIdentity() }
            .fileExporter(
                isPresented: $isPresentingExporter,
                document: exportDocument,
                contentType: .json,
                defaultFilename: "alphonso-my-data"
            ) { result in
                if case .failure = result {
                    accountErrorMessage = "Couldn't save the export. Try again."
                }
                exportDocument = nil
            }
            .sheet(isPresented: $isPresentingLinkHector) {
                LinkHectorAccountSheet(session: session)
            }
            // Two-step type-to-confirm, matching profile.tsx's "Your data"
            // section on web -- disabling the destructive action until the
            // typed text matches exactly is the whole point of the gate, so
            // it lives on the button here rather than being pre-validated.
            .alert("Delete your account?", isPresented: $isPresentingDeleteConfirmation) {
                TextField("Type DELETE to confirm", text: $deleteConfirmationText)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                Button("Cancel", role: .cancel) {
                    deleteConfirmationText = ""
                }
                Button("Delete Forever", role: .destructive) {
                    Task { await deleteAccount() }
                }
                .disabled(deleteConfirmationText != "DELETE")
            } message: {
                // Hector re-parenting Phase 2 (docs/superpowers/specs/
                // 2026-09-26-hector-reparenting-design.md): "Link Hector
                // Account" above is how someone who signed into Hector
                // before Phase 0 shipped -- and hasn't reopened Hector
                // since -- gets covered by this same deletion. Pointing
                // at it here, right where it matters, rather than only
                // in the Account section above.
                Text("""
                This permanently deletes your account, progress, streaks, achievements, and review history. It cannot be undone. Type DELETE to confirm.

                This also removes a linked Hector account, if you have one. If you haven't linked one yet, use "Link Hector Account" above first, or write to privacy@alphonsoecosystem.app to have it deleted separately.
                """)
            }
        }
        .tint(AlphonsoColor.moss)
    }

    /// Applies instantly (AlphonsoThemeManager.setTheme re-renders the
    /// whole app immediately, same as a SwiftUI @Observable change
    /// anywhere else) and syncs to the server in the background --
    /// mirrors theme.ts's setTheme: local application is never blocked
    /// on the network round trip.
    private func select(_ themeID: AlphonsoThemeID) {
        selectedTheme = themeID
        AlphonsoThemeManager.shared.setTheme(themeID)
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        Task {
            try? await client.updateProfileTheme(themeID.rawValue, userID: userID)
        }
    }

    private func loadIdentity() async {
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        if let identity = try? await client.fetchProfileIdentity(userID: userID) {
            displayName = identity.displayName
            avatarSeed = identity.avatarSeed
        }
    }

    private func saveDisplayName() async {
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        identityErrorMessage = nil
        isSavingName = true
        defer { isSavingName = false }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            try await client.updateProfileDisplayName(trimmed, userID: userID)
            displayName = trimmed
        } catch {
            identityErrorMessage = "Couldn't save your name. Try again."
        }
    }

    /// A fresh 8-hex-character seed, same shape as the server default
    /// (`substr(md5(random()::text), 1, 8)` in the profiles table) -- only
    /// used as input to AvatarColor.forSeed's hash, so any string works,
    /// but matching the existing shape keeps seeds looking consistent
    /// regardless of which client generated them.
    private func shuffleAvatar() async {
        guard let accessToken = session.accessToken, let userID = session.userID else { return }
        let next = String((0..<8).map { _ in "0123456789abcdef".randomElement()! })
        identityErrorMessage = nil
        isShufflingAvatar = true
        defer { isShufflingAvatar = false }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            try await client.updateProfileAvatarSeed(next, userID: userID)
            avatarSeed = next
        } catch {
            identityErrorMessage = "Couldn't shuffle your avatar. Try again."
        }
    }

    private func exportData() async {
        guard let accessToken = session.accessToken else { return }
        accountErrorMessage = nil
        isExportingData = true
        defer { isExportingData = false }
        do {
            let client = AccountClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            let data = try await client.exportMyData()
            exportDocument = AccountExportDocument(data: data)
            isPresentingExporter = true
        } catch {
            accountErrorMessage = "Couldn't export your data. Try again."
        }
    }

    /// Mirrors profile.tsx's remove(): delete on the server, then sign out
    /// locally so RootView drops back to AuthView. Calling session.signOut()
    /// here (rather than duplicating its logic) means Session A's upcoming
    /// Sign in with Apple token revocation, once added inside signOut(),
    /// applies to account deletion automatically with no change needed here.
    private func deleteAccount() async {
        guard let accessToken = session.accessToken else { return }
        accountErrorMessage = nil
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        do {
            let client = AccountClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
            try await client.deleteMyAccount()
            session.signOut()
        } catch {
            accountErrorMessage = "Couldn't delete your account. Try again."
        }
    }
}

/// A plain pass-through document for `.fileExporter` -- the export bytes
/// already arrive as finished JSON from `/api/account-export`, so this
/// only needs to satisfy `FileDocument`'s write side. `readableContentTypes`
/// is empty: this app never opens one of these back, only writes it.
private struct AccountExportDocument: FileDocument {
    static var readableContentTypes: [UTType] { [] }
    static var writableContentTypes: [UTType] { [.json] }

    let data: Data

    init(data: Data) {
        self.data = data
    }

    init(configuration: ReadConfiguration) throws {
        data = configuration.file.regularFileContents ?? Data()
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }
}

private struct ThemeSwatch: View {
    let themeID: AlphonsoThemeID

    private var palette: AlphonsoPalette {
        AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.meadow]!
    }

    var body: some View {
        ZStack {
            Circle().fill(palette.surface)
            Circle()
                .trim(from: 0, to: 0.5)
                .fill(palette.moss)
        }
        .frame(width: 28, height: 28)
        .overlay(Circle().strokeBorder(AlphonsoColor.hairline, lineWidth: 1))
    }
}
