import SwiftUI
import LearnWithAlphonsoKit

/// Settings, Acknowledgements. Lists the open-source work bundled in the app and shows each
/// licence's full text from the app bundle.
struct AcknowledgementsView: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        List {
            Section {
                Text("Learn with Alphonso is built with these open-source projects. Thank you to their authors.")
                    .dsText(.footnote)
                    .foregroundStyle(ds.inkSoft)
            }
            .listRowBackground(ds.card)
            Section {
                ForEach(Acknowledgements.all) { item in
                    NavigationLink {
                        LicenseTextView(item: item)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name)
                                .dsText(.headline)
                                .foregroundStyle(ds.ink)
                            Text(item.licenseName)
                                .dsText(.caption)
                                .foregroundStyle(ds.inkSoft)
                        }
                    }
                }
            }
            .listRowBackground(ds.card)
        }
        .scrollContentBackground(.hidden)
        .background(ds.surface)
        .tint(ds.choice)
        .navigationTitle("Acknowledgements")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct LicenseTextView: View {
    let item: Acknowledgement
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                if let url = URL(string: item.url) {
                    Link(item.url, destination: url)
                        .dsText(.footnote)
                }
                Text(Self.text(for: item))
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(ds.ink)
                    .textSelection(.enabled)
            }
            .padding(AlphonsoDS.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(ds.surface)
        .tint(ds.choice)
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
