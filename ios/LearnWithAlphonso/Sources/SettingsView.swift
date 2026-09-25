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
                    Text("Download everything we hold about you, or permanently erase your account.")
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
                // Hector/Cloud Voice is a separate account in a separate
                // Supabase project this backend has no admin access to (see
                // AccountClient's header comment) -- said here rather than
                // silently implying a full-account erasure this can't
                // actually perform.
                Text("""
                This permanently deletes your account, progress, streaks, achievements, and review history. It cannot be undone. Type DELETE to confirm.

                This does not delete a separate Hector sign-in, if you have one -- Hector uses its own account. Sign out of Hector separately to remove it from this device.
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
        FileWrapper(regularFileContents: data)
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
