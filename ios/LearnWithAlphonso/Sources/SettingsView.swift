import SwiftUI
import UniformTypeIdentifiers
import LearnWithAlphonsoKit

/// Theme picker + account + sign out -- the app's first real settings
/// surface (there was none before; "Sign out" lived directly in
/// LessonBrowserView's toolbar). Ports the web's theme picker
/// (`profile.tsx`) to iOS: two themes (Royal and Meadow,
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
    /// Optional so a Settings screen without Pro context (previews) still builds; the Pro row shows only with it.
    var entitlementStore: EntitlementStore? = nil
    @EnvironmentObject private var aiConsent: AIConsentStore
    @AppStorage(AvatarPreference.key) private var showAlphonso = AvatarPreference.defaultValue
    @State private var showAIDisclosure = false
    @State private var isUpdatingAIConsent = false
    @State private var aiConsentErrorMessage: String?

    @State private var selectedTheme = AlphonsoThemeManager.shared.themeID

    @State private var displayName = ""
    @State private var avatarSeed = ""
    @State private var isSavingName = false
    @State private var isPickingAvatar = false
    @State private var identityErrorMessage: String?

    @State private var isExportingData = false
    @State private var exportDocument: AccountExportDocument?
    @State private var isPresentingExporter = false
    @State private var isDeletingAccount = false
    @State private var isPresentingDeleteConfirmation = false
    @State private var deleteConfirmationText = ""
    @State private var accountErrorMessage: String?

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        NavigationStack {
            List {
                DSOverline("Profile").dsListRow(top: AlphonsoDS.Space.s2, bottom: AlphonsoDS.Space.s2)
                profileCard.dsListRow()

                DSOverline("Theme").dsListRow(bottom: AlphonsoDS.Space.s2)
                themeCard.dsListRow()

                DSOverline("Practice").dsListRow(bottom: AlphonsoDS.Space.s2)
                practiceCard.dsListRow()

                if let label = entitlementStore?.proLabel {
                    DSOverline("Alphonso Pro").dsListRow(bottom: AlphonsoDS.Space.s2)
                    DSCard {
                        HStack(spacing: AlphonsoDS.Space.s3) {
                            Icon3DView(emoji: "✨", size: AlphonsoDS.Space.s8)
                            Text("Alphonso Pro").dsText(.headline).foregroundStyle(ds.ink)
                            Spacer(minLength: AlphonsoDS.Space.s2)
                            DSPill(text: label, tone: .good)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .dsListRow()
                }

                DSOverline("Explain in my language").dsListRow(bottom: AlphonsoDS.Space.s2)
                ExplainSettingsSection(session: session).dsListRow()

                DSOverline("Voices").dsListRow(bottom: AlphonsoDS.Space.s2)
                VoicesSettingsSection(session: session).dsListRow()

                if Analytics.isAvailable {
                    DSOverline("Analytics").dsListRow(bottom: AlphonsoDS.Space.s2)
                    AnalyticsSettingsSection().dsListRow()
                }

                DSOverline(AIConsentCopy.settingsTitle).dsListRow(bottom: AlphonsoDS.Space.s2)
                aiConsentCard.dsListRow()

                DSOverline("Account").dsListRow(bottom: AlphonsoDS.Space.s2)
                accountCard.dsListRow()

                // Apple expects a privacy policy to be "easily accessible"
                // in the app itself, not just reachable from the paywall or
                // the AI-disclosure sheet -- the only two places it existed
                // before this (found in a 2026-09-28 audit). Settings is
                // the conventional place a reviewer or user looks first.
                linksCard.dsListRow()

                Button("Sign out", role: .destructive) { session.signOut() }
                    .buttonStyle(.dsButton(.danger, fullWidth: false))
                    .frame(maxWidth: .infinity)
                    .dsListRow()
            }
            .dsSceneList(.profile)
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
                .disabled(!SettingsPresentation.canConfirmDelete(typed: deleteConfirmationText))
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
        .tint(ds.choice)
        .sheet(isPresented: $isPickingAvatar) {
            AvatarPickerSheet(session: session, name: displayName, current: avatarSeed) { avatarSeed = $0 }
        }
    }

    // MARK: - Cards

    private var profileCard: some View {
        DSCard {
            HStack(spacing: AlphonsoDS.Space.s3) {
                // The learner's animal or initial (visual round 6, part 3); hidden from VoiceOver, the name
                // is announced by the field below.
                ProfileAvatarView(seed: avatarSeed.isEmpty ? "a" : avatarSeed, name: displayName, size: AlphonsoDS.Space.s12)
                Button("Change picture") { isPickingAvatar = true }
                    .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
                    .accessibilityHint("Choose an animal or your initial")
                Spacer(minLength: 0)
            }
            TextField("Display name", text: $displayName)
                .dsField()
                .onSubmit { Task { await saveDisplayName() } }
            Button {
                Task { await saveDisplayName() }
            } label: {
                if isSavingName {
                    ProgressView().tint(ds.onAction)
                } else {
                    Text("Save Name")
                }
            }
            .buttonStyle(.dsButton(.primary))
            .disabled(!SettingsPresentation.canSaveName(displayName, isSaving: isSavingName))
            .accessibilityLabel(isSavingName ? "Saving name" : "Save Name")
            if let identityErrorMessage {
                Text(identityErrorMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
            }
            // Visible on LeaderboardView, FriendsView, and DuelsView
            // (see AvatarColor.swift's own doc comment) -- this is
            // the same "shown to strangers" surface the report/block
            // menu on those screens already exists for.
            Text("Your name and picture are visible to other learners on leaderboards, friends, and duels.")
                .dsText(.caption).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var themeCard: some View {
        DSCard {
            let columns = [GridItem(.flexible(), spacing: AlphonsoDS.Space.s2), GridItem(.flexible(), spacing: AlphonsoDS.Space.s2)]
            LazyVGrid(columns: columns, spacing: AlphonsoDS.Space.s2) {
                ForEach(AlphonsoThemeID.allCases) { themeID in
                    // The chip carries the .isSelected trait ("Meadow, selected"); the filled border and tint are
                    // only how a sighted learner sees the same fact.
                    DSChip(label: themeID.displayName, selected: selectedTheme == themeID, accessibilityText: nil, action: {
                        select(themeID)
                    }, leading: {
                        ThemeSwatch(themeID: themeID).accessibilityHidden(true)
                    })
                }
            }
        }
    }

    private var practiceCard: some View {
        DSCard {
            Toggle(isOn: $showAlphonso) {
                SettingsToggleLabel(
                    title: "Show Alphonso while practicing",
                    subtitle: "A little animated Alphonso listens and talks with you in Practice speaking, and Hector on his tab. Off keeps the classic screen.")
            }
            .tint(ds.choice)
            .accessibilityIdentifier("showAlphonsoToggle")
            SettingsDivider()
            SoundEffectsSettingsSection()
        }
    }

    private var aiConsentCard: some View {
        DSCard {
            if aiConsent.status == .unavailable {
                // The setting could not be read: say so and offer a retry, never a switch that reads "off".
                HStack(spacing: AlphonsoDS.Space.s3) {
                    Text(AIConsentCopy.checkFailedTitle).dsText(.headline).foregroundStyle(ds.ink)
                    Spacer(minLength: AlphonsoDS.Space.s2)
                    Button(AIConsentCopy.retry) { Task { await aiConsent.refresh() } }
                        .buttonStyle(.dsButton(.secondary, compact: true, fullWidth: false))
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
                    SettingsToggleLabel(title: AIConsentCopy.settingsTitle, subtitle: AIConsentCopy.settingsFooter)
                }
                .tint(ds.choice)
                .disabled(isUpdatingAIConsent || aiConsent.status == .loading)
            }
            if let aiConsentErrorMessage {
                Text(aiConsentErrorMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
            }
        }
    }

    private var accountCard: some View {
        let free = SettingsPresentation.canStartAccountAction(isExporting: isExportingData, isDeleting: isDeletingAccount)
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: AlphonsoDS.Space.s2))
            : AnyLayout(HStackLayout(spacing: AlphonsoDS.Space.s3))
        return DSCard {
            Text("Download the data in your Alphonso account, or permanently erase it.")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
            layout {
                Button {
                    Task { await exportData() }
                } label: {
                    if isExportingData {
                        ProgressView().tint(ds.brand)
                    } else {
                        Text("Export My Data")
                    }
                }
                .buttonStyle(.dsButton(.secondary, compact: true))
                .disabled(!free)
                .accessibilityLabel(isExportingData ? "Exporting your data" : "Export My Data")

                Button(role: .destructive) {
                    deleteConfirmationText = ""
                    isPresentingDeleteConfirmation = true
                } label: {
                    if isDeletingAccount {
                        ProgressView().tint(ds.wrongInk)
                    } else {
                        Text("Delete My Account")
                    }
                }
                .buttonStyle(.dsButton(.danger, compact: true))
                .disabled(!free)
                .accessibilityLabel(isDeletingAccount ? "Deleting your account" : "Delete My Account")
            }
            if let accountErrorMessage {
                Text(accountErrorMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
            }
        }
    }

    private var linksCard: some View {
        DSCard(spacing: AlphonsoDS.Space.s1) {
            Link(destination: AppConfig.apiBaseURL.appendingPathComponent("privacy")) {
                SettingsNavLabel(title: "Privacy Policy", trailing: "arrow.up.right")
            }
            SettingsDivider()
            Link(destination: AppConfig.apiBaseURL.appendingPathComponent("terms")) {
                SettingsNavLabel(title: "Terms of Use", trailing: "arrow.up.right")
            }
            SettingsDivider()
            NavigationLink("Acknowledgements") { AcknowledgementsView() }
                .dsText(.headline)
                .foregroundStyle(ds.ink)
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                .overlay(alignment: .trailing) {
                    Image(systemName: "chevron.right").dsText(.caption).foregroundStyle(ds.inkFaint)
                        .accessibilityHidden(true)
                }
        }
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
    @Environment(\.alphonsoDS) private var ds

    private var palette: AlphonsoPalette {
        AlphonsoPaletteCatalog.all[themeID] ?? AlphonsoPaletteCatalog.all[.royal]!
    }

    var body: some View {
        ZStack {
            Circle().fill(palette.surface)
            Circle()
                .trim(from: 0, to: 0.5)
                .fill(palette.moss)
        }
        .frame(width: AlphonsoDS.Space.s6, height: AlphonsoDS.Space.s6)
        .overlay(Circle().strokeBorder(ds.line, lineWidth: 1))
    }
}
