import SwiftUI
import LearnWithAlphonsoKit

/// Settings > Explain in my language: the learner's own language, and when explanations show (tap, always, or never).
/// Both live on the learner profile, so the web and the other platform follow. Nothing here is AI itself; it only
/// decides whether the offers elsewhere appear.
struct ExplainSettingsSection: View {
    let session: Session

    @ObservedObject private var settings = ExplainSettingsStore.shared
    @State private var errorMessage: String?
    @State private var isSaving = false

    /// Every language the learner can pick, by English name.
    private static let languages: [(code: String, name: String)] =
        LearnerProfileLists.nativeLanguages
        .map { (code: $0, name: ExplainRules.languageName($0)) }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }

    private var languageSelection: Binding<String> {
        Binding(
            get: { settings.nativeLanguage ?? "" },
            set: { code in
                guard !code.isEmpty, code != settings.nativeLanguage else { return }
                Task { await saveLanguage(code) }
            })
    }

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard {
            Picker(selection: languageSelection) {
                if settings.nativeLanguage == nil {
                    Text("Not set").tag("")
                }
                ForEach(Self.languages, id: \.code) { language in
                    Text(language.name).tag(language.code)
                }
            } label: {
                Text("My language").dsText(.headline).foregroundStyle(ds.ink)
            }
            .tint(ds.choice)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .disabled(isSaving || !settings.isLoaded)
            .accessibilityIdentifier("explainLanguagePicker")

            ForEach(ExplainMode.allCases, id: \.self) { mode in
                SettingsDivider()
                Button {
                    guard mode != settings.mode else { return }
                    Task { await saveMode(mode) }
                } label: {
                    HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                        SettingsRadioDot(selected: settings.mode == mode)
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                            HStack(spacing: AlphonsoDS.Space.s2) {
                                Text(mode.title).dsText(.headline).foregroundStyle(ds.ink)
                                if mode == ExplainMode.default {
                                    DSPill(text: "Default", tone: .neutral)
                                }
                            }
                            Text(mode.detail).dsText(.caption).foregroundStyle(ds.inkSoft)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(minHeight: AlphonsoDS.Space.minTouch)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(isSaving || !settings.isLoaded)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(settings.mode == mode ? .isSelected : [])
                .accessibilityIdentifier("explainMode-\(mode.rawValue)")
            }

            if let errorMessage {
                Text(errorMessage).dsText(.caption).foregroundStyle(ds.wrongInk)
            }
            Text("Written by AI (Alphonso), so they can be wrong. You can report one. Free: \(ExplainRules.dailyLimit) a day. Pro learners talking to Hector use Hector's own allowance.")
                .dsText(.caption)
                .foregroundStyle(ds.inkSoft)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { await settings.load(session: session) }
    }

    private func saveMode(_ mode: ExplainMode) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        if !(await settings.setMode(mode, session: session)) {
            errorMessage = "Couldn't save that. Check your connection and try again."
        }
    }

    private func saveLanguage(_ code: String) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        if !(await settings.setNativeLanguage(code, session: session)) {
            errorMessage = "Couldn't save that. Check your connection and try again."
        }
    }
}
