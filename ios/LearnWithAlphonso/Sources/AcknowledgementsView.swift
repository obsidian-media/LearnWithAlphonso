import SwiftUI
import LearnWithAlphonsoKit

/// Settings, Acknowledgements. Lists the open-source work bundled in the app and shows each
/// licence's full text from the app bundle.
struct AcknowledgementsView: View {
    var body: some View {
        List {
            Section {
                Text("Learn with Alphonso is built with these open-source projects. Thank you to their authors.")
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
            .listRowBackground(AlphonsoColor.parchment)
            Section {
                ForEach(Acknowledgements.all) { item in
                    NavigationLink {
                        LicenseTextView(item: item)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .font(AlphonsoFont.sans(15, weight: .medium))
                                .foregroundStyle(AlphonsoColor.ink)
                            Text(item.licenseName)
                                .font(AlphonsoFont.sans(12))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
                    }
                }
            }
            .listRowBackground(AlphonsoColor.parchment)
        }
        .scrollContentBackground(.hidden)
        .background(AlphonsoColor.surface)
        .navigationTitle("Acknowledgements")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LicenseTextView: View {
    let item: Acknowledgement

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
                if let url = URL(string: item.url) {
                    Link(item.url, destination: url)
                        .font(AlphonsoFont.sans(14))
                }
                Text(Self.text(for: item))
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(AlphonsoColor.ink)
                    .textSelection(.enabled)
            }
            .padding(AlphonsoSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(AlphonsoColor.surface)
        .navigationTitle(item.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    static func text(for item: Acknowledgement) -> String {
        guard let url = Bundle.main.url(forResource: item.licenseResource, withExtension: "txt"),
              let text = try? String(contentsOf: url, encoding: .utf8) else {
            return "\(item.licenseName). The full text is at \(item.url)."
        }
        return text
    }
}
