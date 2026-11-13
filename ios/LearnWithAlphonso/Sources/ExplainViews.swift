import SwiftUI
import LearnWithAlphonsoKit

/// The small "AI" tag every AI-written explanation carries: "AI" alone, or "AI - Persian" when it is in the learner's
/// language. One shared view so the wording and look never drift between places.
struct AILabelView: View {
    /// The language's English name, or nil for a plain "AI".
    var language: String? = nil
    @Environment(\.alphonsoDS) private var ds

    private var text: String {
        if let language, !language.isEmpty { return "AI - \(language)" }
        return "AI"
    }

    var body: some View {
        Text(text)
            .dsText(.caption)
            .foregroundStyle(ds.inkSoft)
            .padding(.horizontal, AlphonsoDS.Space.s2)
            .padding(.vertical, 2)
            .background(Capsule().fill(ds.sunk))
            .overlay(Capsule().strokeBorder(ds.line, lineWidth: 1))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(language.map { "AI written, in \($0)" } ?? "AI written")
    }
}

/// The explanation itself. Set right to left (per block only, never the screen) for Persian, Arabic, Hebrew, Urdu and
/// Pashto, with quoted course-language phrases isolated so they stay left to right.
struct ExplainText: View {
    let result: ExplainResult
    var color: Color
    var quoteColor: Color

    var body: some View {
        let rtl = result.direction == .rtl
        composed(rtl: rtl)
            .dsText(.body)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
            // Under a right-to-left environment "leading" is the right edge, so the same two lines serve both.
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .environment(\.layoutDirection, rtl ? .rightToLeft : .leftToRight)
    }

    private func composed(rtl: Bool) -> Text {
        guard rtl else { return Text(result.explanation) }
        // U+2066 (left-to-right isolate) and U+2069 (pop) wrap each quoted run so it keeps its own direction.
        return ExplainRules.splitDirectionRuns(result.explanation).reduce(Text("")) { partial, run in
            if run.ltr {
                return partial + Text("\u{2066}\(run.text)\u{2069}").bold().foregroundStyle(quoteColor)
            }
            return partial + Text(run.text)
        }
    }
}

/// "Explain in <language>": one quiet chip that fetches a short WHY in the learner's own language, only when tapped
/// (or straight away for "Always show"). Draws nothing when the learner chose target language only, has no native
/// language on file, or it equals the course's. The result is labelled as AI and can be reported ("Not clear?").
///
/// The shape follows the request: a wrong answer gets a bordered card with Alphonso at its head, a word a tinted
/// "IN <LANGUAGE>" block, a chat message a translation set right under the bubble ("Say that in <language>").
struct ExplainInMyLanguage: View {
    /// The item; nil when there is nothing to explain (a skipped question).
    let request: ExplainRequest?
    let session: Session
    /// `.hector` spends Hector's own Pro allowance; everything else the free explain budget.
    var surface: ExplainSurface = .app

    @ObservedObject private var settings = ExplainSettingsStore.shared
    @EnvironmentObject private var aiConsent: AIConsentStore
    @Environment(\.alphonsoDS) private var ds
    @State private var phase: Phase = .idle
    @State private var showDisclosure = false

    private enum Phase: Equatable {
        case idle
        case loading
        case shown(ExplainResult)
        case failed(ExplainErrorKind)
    }

    private var offer: ExplainOffer {
        guard let request, settings.isLoaded else { return .hidden }
        return ExplainRules.offer(mode: settings.mode, nativeLanguage: settings.nativeLanguage, course: request.course)
    }

    private var languageName: String {
        ExplainRules.languageName(settings.nativeLanguage ?? "")
    }

    private var isMessage: Bool {
        if case .message? = request { return true }
        return false
    }

    var body: some View {
        content
            .task { await settings.load(session: session) }
            .task(id: request) {
                // "Always show": ask as soon as the item is on screen, once per item.
                if offer == .auto, phase == .idle { await run(userInitiated: false) }
            }
            .onChange(of: request) { _, _ in phase = .idle }
            .onChange(of: settings.isLoaded) { _, _ in
                if offer == .auto, phase == .idle { Task { await run(userInitiated: false) } }
            }
            .aiDisclosureSheet(isPresented: $showDisclosure) {
                Task { await run(userInitiated: true) }
            }
    }

    @ViewBuilder
    private var content: some View {
        if let request, offer != .hidden {
            if case .shown(let result) = phase {
                shown(result, request: request)
            } else {
                chip(request: request)
            }
        }
    }

    // MARK: - Idle, loading, failed

    private func chip(request: ExplainRequest) -> some View {
        let loading = phase == .loading
        return VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Button {
                Task { await run(userInitiated: true) }
            } label: {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    if loading {
                        ProgressView().controlSize(.small).tint(ds.brand)
                    } else if !isMessage {
                        avatar(.hmm, size: 22)
                    }
                    Text(loading ? "Explaining\u{2026}" : (isMessage ? "Say that in \(languageName)" : "Explain in \(languageName)"))
                        .dsText(.footnote)
                        .foregroundStyle(ds.brand)
                }
                .padding(.horizontal, AlphonsoDS.Space.s3)
                .frame(minHeight: AlphonsoDS.Space.minTouch)
                .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous)
                        .strokeBorder(ds.brand, lineWidth: 2))
            }
            .buttonStyle(.plain)
            .disabled(loading)
            .accessibilityLabel(loading ? "Explaining" : (isMessage ? "Say that in \(languageName)" : "Explain in \(languageName)"))
            .accessibilityHint("Written by AI")
            if case .failed(let kind) = phase {
                Text(kind.copy)
                    .dsText(.caption)
                    .foregroundStyle(ds.wrongInk)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
    }

    private func avatar(_ pose: LessonExpression, size: CGFloat) -> some View {
        Group {
            if let art = LessonArt.expression(pose) {
                Image(uiImage: art)
                    .resizable()
                    .scaledToFit()
                    .scaleEffect(1.9, anchor: UnitPoint(x: 0.5, y: 0.24))
            }
        }
        .frame(width: size, height: size)
        .background(ds.card)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }

    // MARK: - Shown

    @ViewBuilder
    private func shown(_ result: ExplainResult, request: ExplainRequest) -> some View {
        let hide = { phase = .idle }
        switch request {
        case .wrongAnswer:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    avatar(.talk, size: 30)
                    Text("Alphonso explains").dsText(.footnote).foregroundStyle(ds.ink)
                    Spacer(minLength: 0)
                    AILabelView(language: languageName)
                }
                ExplainText(result: result, color: ds.ink, quoteColor: ds.brand)
                HStack {
                    reportButton(result, request: request, label: "Not clear?")
                    Spacer(minLength: 0)
                    Button("Show in English", action: hide)
                        .buttonStyle(.plain)
                        .dsText(.caption)
                        .foregroundStyle(ds.choice)
                        .underline()
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                }
            }
            .padding(AlphonsoDS.Space.s3)
            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .strokeBorder(ds.brand, lineWidth: 2))
            .accessibilityElement(children: .contain)
        case .word:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Text("In \(languageName)").dsText(.overline).foregroundStyle(ds.brand)
                    Spacer(minLength: 0)
                    AILabelView()
                }
                ExplainText(result: result, color: ds.brand, quoteColor: ds.brand)
                HStack {
                    reportButton(result, request: request, label: "Not clear?")
                    Spacer(minLength: 0)
                    Button("Hide", action: hide)
                        .buttonStyle(.plain)
                        .dsText(.caption)
                        .foregroundStyle(ds.choice)
                        .underline()
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                }
            }
            .padding(AlphonsoDS.Space.s3)
            .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            .accessibilityElement(children: .contain)
        case .message:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                ExplainText(result: result, color: ds.ink, quoteColor: ds.brand)
                HStack(spacing: AlphonsoDS.Space.s2) {
                    AILabelView(language: languageName)
                    reportButton(result, request: request, label: "Not clear?")
                    Spacer(minLength: 0)
                    Button("Hide", action: hide)
                        .buttonStyle(.plain)
                        .dsText(.caption)
                        .foregroundStyle(ds.choice)
                        .underline()
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.s3)
            .padding(.top, AlphonsoDS.Space.s2)
            .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            .accessibilityElement(children: .contain)
        }
    }

    private func reportButton(_ result: ExplainResult, request: ExplainRequest, label: String) -> some View {
        AIReportButton(
            message: result.explanation, surface: .explain, course: request.course, label: label, session: session)
    }

    // MARK: - Asking

    /// `userInitiated` is false for "Always show": it never opens the consent sheet on its own, it just leaves the chip
    /// there for the learner to tap.
    private func run(userInitiated: Bool) async {
        guard let request, phase != .loading, offer != .hidden else { return }
        // `.loading` BEFORE any await, so a second tap during the consent read is blocked too.
        phase = .loading
        // The item goes to the AI provider, so the account's AI consent applies (same order as SaveWordSheet).
        if !aiConsent.isGranted { await aiConsent.refresh() }
        switch aiConsent.status {
        case .granted:
            break
        case .denied:
            phase = .idle
            if userInitiated { showDisclosure = true }
            return
        case .loading, .unavailable:
            phase = userInitiated ? .failed(.unavailable) : .idle
            return
        }
        guard let token = await session.freshAccessToken() else {
            phase = .failed(.unavailable)
            return
        }
        let client = ExplainClient(
            baseURL: AppConfig.apiBaseURL,
            accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        do {
            let result = try await client.explain(request, surface: surface)
            // A different item may have replaced this one while the call was in flight.
            guard self.request == request else { return }
            phase = .shown(result)
            SoundEffectsPlayer.shared.play(.tap)
        } catch is CancellationError {
            phase = .idle
        } catch let kind as ExplainErrorKind {
            phase = .failed(kind)
        } catch {
            phase = .failed(.unavailable)
        }
    }
}
