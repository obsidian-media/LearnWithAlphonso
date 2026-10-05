import SwiftUI
import LearnWithAlphonsoKit

/// What the sheet saves. `Identifiable` so a screen can present it with
/// `.sheet(item:)`; a fresh id per tap means tapping the same word twice
/// re-presents the sheet.
struct SaveWordRequest: Identifiable {
    let id = UUID()
    let word: String
    let sentence: String
    let course: String
}

/// Shows a tapped word and its sentence, saves it on demand, then shows the
/// meaning so the learner learns it now, not only at review. Never blocks the
/// screen underneath: every failure is a message in the sheet and "Done" always
/// works.
struct SaveWordSheet: View {
    let request: SaveWordRequest
    let session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var phase: Phase = .idle
    @State private var showDisclosure = false

    private enum Phase: Equatable {
        case idle
        case saving
        case saved(SavedWordResult)
        case failed(SavedWordError)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoSpacing.md) {
            Text(request.word)
                .font(AlphonsoFont.display(26, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("\u{201C}\(request.sentence)\u{201D}")
                .font(AlphonsoFont.sans(15))
                .foregroundStyle(AlphonsoColor.inkSoft)

            content

            Spacer(minLength: 0)

            Button("Done") { dismiss() }
                .font(AlphonsoFont.sans(14, weight: .medium))
                .tint(AlphonsoColor.inkSoft)
                .frame(maxWidth: .infinity)
        }
        .padding()
        .background(AlphonsoColor.surface)
        .presentationDetents([.medium, .large])
        .aiDisclosureSheet(isPresented: $showDisclosure) {
            Task { await save() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .idle:
            Button("Save word") { Task { await save() } }
                .buttonStyle(.alphonsoPrimary)
        case .saving:
            ProgressView("Looking it up...").tint(AlphonsoColor.moss)
        case .saved(let result):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Label(
                    result.alreadySaved ? "Already saved" : "Saved for review",
                    systemImage: "checkmark.circle.fill"
                )
                .font(AlphonsoFont.sans(14, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.moss)
                Text(result.explanation)
                    .font(AlphonsoFont.sans(16))
                    .foregroundStyle(AlphonsoColor.ink)
                Text("AI-generated meaning. It can occasionally be wrong.")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
            }
        case .failed(let error):
            VStack(alignment: .leading, spacing: AlphonsoSpacing.sm) {
                Text(error.userMessage)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.destructive)
                if error == .unavailable || error == .offline {
                    Button("Try again") { Task { await save() } }
                        .buttonStyle(.alphonsoSecondary)
                }
            }
        }
    }

    private func save() async {
        // The word and sentence go to NVIDIA, so the same consent every other
        // AI path needs applies. Declining just closes the disclosure.
        guard AIDisclosureGate.isAcknowledged() else {
            showDisclosure = true
            return
        }
        guard let token = session.accessToken else {
            phase = .failed(.notSignedIn)
            return
        }
        phase = .saving
        let client = AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { token })
        do {
            phase = .saved(try await client.defineWord(
                word: request.word, sentence: request.sentence, course: request.course))
        } catch let error as SavedWordError {
            phase = .failed(error)
        } catch is URLError {
            phase = .failed(.offline)
        } catch {
            phase = .failed(.unavailable)
        }
    }
}
