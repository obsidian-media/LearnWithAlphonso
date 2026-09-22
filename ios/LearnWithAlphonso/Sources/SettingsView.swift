import SwiftUI
import LearnWithAlphonsoKit

/// Theme picker + sign out -- the app's first real settings surface
/// (there was none before; "Sign out" lived directly in
/// LessonBrowserView's toolbar). Ports the web's theme picker
/// (`profile.tsx`) to iOS: three themes (Meadow/Studio Ink/Manuscript,
/// see DesignSystem/AlphonsoTheme.swift), applied instantly and locally
/// via `AlphonsoThemeManager`, synced to `profiles.theme` in the
/// background so it round-trips with the web app on the same account.
struct SettingsView: View {
    let session: Session

    @State private var selectedTheme = AlphonsoThemeManager.shared.themeID

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(AlphonsoThemeID.allCases) { themeID in
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
                } header: {
                    Text("Theme")
                        .font(AlphonsoFont.sans(12, weight: .semiBold))
                        .tracking(0.4)
                        .foregroundStyle(AlphonsoColor.ember)
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
