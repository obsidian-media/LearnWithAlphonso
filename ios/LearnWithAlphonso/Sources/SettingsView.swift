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
    @EnvironmentObject private var aiConsent: AIConsentStore
    @State private var showAIDisclosure = false
    @State private var isUpdatingAIConsent = false
    @State private var aiConsentErrorMessage: String?

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

    var body: some View {
        NavigationStack {
            let themeRows = ForEach(AlphonsoThemeID.allCases) { themeID in
                Button {
                    select(themeID)
                } label: {
                    HStack(spacing: AlphonsoSpacing.sm + 4) {
                        ThemeSwatch(themeID: themeID)
                            .accessibilityHidden(true)
                        Text(themeID.displayName)
                            .font(AlphonsoFont.sans(15, weight: .medium))
                            .foregroundStyle(AlphonsoColor.ink)
                        Spacer()
                        if selectedTheme == themeID {
                            // Hidden, not left to be read on its own -- the
                            // .isSelected trait below is what actually tells
                            // VoiceOver "this is the current theme"
                            // ("Meadow, selected"); this checkmark existing
                            // or not is only how a sighted user sees the
                            // same fact.
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(AlphonsoColor.moss)
                                .accessibilityHidden(true)
                        }
                    }
                }
                .accessibilityAddTraits(selectedTheme == themeID ? .isSelected : [])
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
                        //
                        // Hidden from VoiceOver entirely: the color is
                        // decorative (no meaning a VoiceOver user needs),
                        // and the name it's paired with is already
                        // announced by the TextField right below it.
                        Text(displayName.prefix(1).uppercased())
                            .font(AlphonsoFont.sans(16, weight: .semiBold))
                            .foregroundStyle(.white)
                            .frame(minWidth: 40, minHeight: 40)
                            .background(Circle().fill(AvatarColor.forSeed(avatarSeed.isEmpty ? "a" : avatarSeed)))
                            .accessibilityHidden(true)
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
                        .accessibilityLabel(isShufflingAvatar ? "Shuffling avatar color" : "Shuffle avatar color")
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
                    .accessibilityLabel(isSavingName ? "Saving name" : "Save Name")
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
                    if aiConsent.status == .unavailable {
                        // The setting could not be read: say so and offer a retry, never a switch that reads "off".
                        HStack {
                            Text(AIConsentCopy.checkFailedTitle)
                                .font(AlphonsoFont.sans(15))
                            Spacer()
                            Button(AIConsentCopy.retry) { Task { await aiConsent.refresh() } }
                                .font(AlphonsoFont.sans(14, weight: .semiBold))
                                .tint(AlphonsoColor.moss)
                        }
                    } else {
                        Toggle(isOn: Binding(
                            get: { aiConsent.isGranted },
                            set: { wantsOn in
                                if wantsOn {
                                    // Turning it on is informed consent: the same sheet, not a silent write.
                                    showAIDisclosure = true
                                } else {
                                    Task { await withdrawAIConsent() }
                                }
                            }
                        )) {
                            Text(AIConsentCopy.settingsTitle)
                                .font(AlphonsoFont.sans(15, weight: .medium))
                        }
                        .tint(AlphonsoColor.moss)
                        .disabled(isUpdatingAIConsent || aiConsent.status == .loading)
                    }
                    if let aiConsentErrorMessage {
                        Text(aiConsentErrorMessage)
                            .font(AlphonsoFont.sans(13))
                            .foregroundStyle(AlphonsoColor.destructive)
                    }
                } header: {
                    Text(AIConsentCopy.settingsTitle)
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
                } footer: {
                    Text(AIConsentCopy.settingsFooter)
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
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
                    .accessibilityLabel(isExportingData ? "Exporting your data" : "Export My Data")

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
                    .accessibilityLabel(isDeletingAccount ? "Deleting your account" : "Delete My Account")

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
                    Text("Download the data in your Alphonso account, or permanently erase it.")
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .listRowBackground(AlphonsoColor.parchment)

                // Apple expects a privacy policy to be "easily accessible"
                // in the app itself, not just reachable from the paywall or
                // the AI-disclosure sheet -- the only two places it existed
                // before this (found in a 2026-09-28 audit). Settings is
                // the conventional place a reviewer or user looks first.
                Section {
                    Link("Privacy Policy", destination: AppConfig.apiBaseURL.appendingPathComponent("privacy"))
                    Link("Terms of Use", destination: AppConfig.apiBaseURL.appendingPathComponent("terms"))
                    NavigationLink("Acknowledgements") { AcknowledgementsView() }
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
            .task { await aiConsent.refresh() }
            .onChange(of: aiConsent.isGranted) { _, _ in aiConsentErrorMessage = nil }
            .aiDisclosureSheet(isPresented: $showAIDisclosure) {}
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
                // Apple bills and owns subscription cancellation
                // (Guideline 3.1.2); deleting the Alphonso account does not
                // touch that relationship at all. Added in a 2026-09-28
                // audit -- without this, someone could delete their
                // account thinking it stops the charge, then be billed
                // again with no account left to explain why.
                //
                // The Apple revocation line (a second-opinion audit,
                // 2026-09-28) covers the same class of gap for Sign in
                // with Apple specifically: deletion already attempts
                // server-side revocation (deleteAccount()'s own doc
                // comment), but Apple's own guidance for when that can't
                // be guaranteed is to point the user at manual revocation
                // -- privacy.tsx's "Your rights" section has the full
                // path (Settings > [name] > Sign-In & Security > Apps
                // Using Apple ID, or appleid.apple.com); this is the
                // pointer to it, kept short since this is a system alert.
                Text("""
                This permanently deletes your account, progress, streaks, achievements, and review history. It cannot be undone. Type DELETE to confirm.

                This does not cancel an active Alphonso Pro subscription. Apple bills that separately. Cancel it yourself in Settings > Subscriptions on your device.

                If you signed in with Apple, this also revokes that connection. See our Privacy Policy if you ever need to revoke it yourself.
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

    private func withdrawAIConsent() async {
        isUpdatingAIConsent = true
        aiConsentErrorMessage = nil
        defer { isUpdatingAIConsent = false }
        do {
            try await aiConsent.set(false)
        } catch {
            aiConsentErrorMessage = AIConsentCopy.saveFailed
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
        guard let accessToken = session.accessToken else { return }
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        identityErrorMessage = nil
        isSavingName = true
        defer { isSavingName = false }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        do {
            // confirm_display_name validates (2 to 40 characters, the filter) and returns the cleaned, stored name.
            displayName = try await client.confirmDisplayName(trimmed)
        } catch {
            identityErrorMessage = SocialReasonCopy.nameSaveMessage(for: error)
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
        accountErrorMessage = nil
        isExportingData = true
        defer { isExportingData = false }
        guard let accessToken = await session.freshAccessToken() else {
            accountErrorMessage = "Couldn't export your data. Try again."
            return
        }
        do {
            let client = AccountClient(
                baseURL: AppConfig.apiBaseURL,
                accessToken: { accessToken },
                refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
            )
            let data = try await client.exportMyData()
            exportDocument = AccountExportDocument(data: data)
            isPresentingExporter = true
        } catch {
            accountErrorMessage = "Couldn't export your data. Try again."
        }
    }

    /// Mirrors profile.tsx's remove(): delete on the server, then sign out
    /// locally so RootView drops back to AuthView. The server-side DELETE
    /// itself is what revokes the account's Sign in with Apple grant (see
    /// AccountClient.deleteMyAccount / apple-revocation.ts) -- accountDeleted()
    /// then clears local session state and runs every SessionLifecycle handler
    /// for `.accountDeleted`.
    ///
    /// Uses a freshly-refreshed token plus a one-retry-on-401 backstop
    /// (2026-09-29 pre-submission audit): with the plain stored token,
    /// deletion failed for anyone who had been in the app for over an
    /// hour -- exactly how an App Store reviewer reaches this screen.
    private func deleteAccount() async {
        accountErrorMessage = nil
        isDeletingAccount = true
        defer { isDeletingAccount = false }
        guard let accessToken = await session.freshAccessToken() else {
            accountErrorMessage = "Couldn't delete your account. Check your connection and try again."
            return
        }
        do {
            let client = AccountClient(
                baseURL: AppConfig.apiBaseURL,
                accessToken: { accessToken },
                refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) }
            )
            try await client.deleteMyAccount()
            session.accountDeleted()
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
