import SwiftUI
import LearnWithAlphonsoKit

/// The session the Help entry points open the chat with. RootView puts it in the environment; an entry point (the
/// save-failure screen, the paywall error) shows "Get help" only when it is there, so a preview or a signed-out screen
/// never offers a chat that could not load.
private struct HelpSessionKey: EnvironmentKey {
    static let defaultValue: Session? = nil
}

extension EnvironmentValues {
    var helpSession: Session? {
        get { self[HelpSessionKey.self] }
        set { self[HelpSessionKey.self] = newValue }
    }
}

/// The Help chat (round 12 mock, sections 2 to 6). A learner talks to the AI helper or, when AI answers are off or the
/// learner asks, to a person; staff replies appear in the same chat. The server decides everything that matters (who
/// answers, the status, the limits); this draws it. Native twin of `src/components/help/HelpChat.tsx`, with the same
/// words (`SupportCopy`).
///
/// Every speaker has a text label and its own bubble shape, not colour alone. Learner and AI text is drawn as text,
/// never parsed. The only link an answer can carry is an allowed in-app screen (`SupportLinkID`).
struct HelpChatView: View {
    let session: Session
    /// Set when the chat is a sheet (from an error screen): a "Done" button closes it. Pushed from Settings, the
    /// system back button is the way out.
    var onClose: (() -> Void)?
    /// What a link chip on an AI answer does, per allowed screen: the action, or nil where this host cannot open that
    /// screen (the chip is then left out and the answer reads as text). The closure it is given leaves the chat.
    var linkAction: ((SupportLinkID, _ leave: @escaping () -> Void) -> (() -> Void)?)?

    @State private var model: HelpChatModel
    @EnvironmentObject private var aiConsent: AIConsentStore
    @Environment(NetworkMonitor.self) private var networkMonitor
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var composing: Bool

    init(session: Session, onClose: (() -> Void)? = nil, linkAction: ((SupportLinkID, _ leave: @escaping () -> Void) -> (() -> Void)?)? = nil) {
        self.session = session
        self.onClose = onClose
        self.linkAction = linkAction
        _model = State(initialValue: HelpChatModel(session: session))
    }

    private var online: Bool { networkMonitor.isConnected }
    private var state: SupportChatState { model.state }
    private let clock = SupportClock()

    private var banner: SupportBanner? {
        SupportChatRules.banner(
            status: state.load == .ready ? state.status : nil,
            aiAvailable: state.aiAvailable,
            aiDeclined: aiConsent.status == .denied,
            online: online
        )
    }

    private var aiAnswering: Bool {
        state.aiAvailable && aiConsent.status != .denied && (state.status == SupportStatus.none || state.status == .ai)
    }

    private var composer: SupportChatRules.Composer {
        SupportChatRules.composer(status: state.status, limit: state.limit, online: online, aiFirstOpen: state.isEmpty && banner == .ai)
    }

    private var composerDisabled: Bool {
        composer.disabled || state.load != .ready || state.pending?.state == .failed
    }

    private var canSend: Bool {
        SupportChatRules.sendableText(model.draft) != nil && state.canSend(online: online, composerDisabled: composerDisabled)
    }

    /// Changes whenever the newest line changes, so the list scrolls to it.
    private var endMark: String {
        "\(state.messages.count):\(state.pending?.state == .failed ? "f" : state.pending == nil ? "" : "s"):\(state.limit.map { "\($0)" } ?? ""):\(state.load)"
    }

    private var pollKey: String {
        "\(SupportChatRules.shouldPoll(status: state.load == .ready ? state.status : nil))-\(online)-\(scenePhase == .active)"
    }

    var body: some View {
        VStack(spacing: 0) {
            if let banner {
                BannerView(banner: banner)
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                    .padding(.top, AlphonsoDS.Space.s2)
            }
            messageList
            composerBar
        }
        .background(ds.surface.ignoresSafeArea())
        .navigationTitle(SupportCopy.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let onClose {
                ToolbarItem(placement: .cancellationAction) { Button("Done", action: onClose) }
            }
            ToolbarItem(placement: .primaryAction) {
                Button(SupportCopy.talkToPerson) { Task { await model.talkToPerson(online: online) } }
                    .disabled(state.handoffBusy || !online)
            }
        }
        .tint(ds.choice)
        // The loaders hang off this always-present root, never off conditional content that can draw nothing.
        .task { await model.load() }
        .task(id: pollKey) {
            guard SupportChatRules.shouldPoll(status: state.load == .ready ? state.status : nil), online, scenePhase == .active else { return }
            // Back in the app (or back online): look now, then every interval.
            await model.poll()
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(SupportChatRules.pollInterval))
                if Task.isCancelled { return }
                await model.poll()
            }
        }
        .onChange(of: state.messages.last?.id) { old, new in
            // A new reply from the AI or a person is said aloud; the learner's own lines are not.
            guard old != nil, new != nil, let last = state.messages.last, last.kind == .ai || last.kind == .support else { return }
            AccessibilityNotification.Announcement(last.body).post()
        }
    }

    // MARK: - The conversation

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: AlphonsoDS.Space.s3) {
                    if state.load == .error {
                        errorCard(SupportCopy.loadFailed) { Task { await model.load() } }
                    }
                    if state.isEmpty {
                        WelcomeView(aiAnswering: aiAnswering) { starter in model.draft = starter; composing = true }
                    }
                    thread
                    if state.pending?.state == .failed {
                        errorCard(state.pending?.failure == .unreachable ? SupportCopy.unreachable : SupportCopy.sendFailed) { model.retry() }
                    }
                    if state.handoffFailed {
                        errorCard(SupportCopy.handoffFailed) { Task { await model.talkToPerson(online: online) } }
                    }
                    if state.limit == .conversation { SystemLine(text: SupportCopy.conversationLimit) }
                    if state.limit == .daily { DailyLimitView() }
                    Color.clear.frame(height: 1).id("end")
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.top, AlphonsoDS.Space.s3)
                .padding(.bottom, AlphonsoDS.Space.s2)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: endMark) { _, _ in
                if reduceMotion { proxy.scrollTo("end", anchor: .bottom) } else { withAnimation { proxy.scrollTo("end", anchor: .bottom) } }
            }
        }
        .accessibilityLabel(SupportCopy.messageLog)
    }

    @ViewBuilder
    private var thread: some View {
        let now = Date()
        let rows = Self.rows(messages: state.messages, dividerID: state.dividerID, pending: state.pendingShown, clock: clock, now: now)
        ForEach(rows) { row in
            switch row.content {
            case let .day(label, fresh):
                DividerLine(label: label, fresh: fresh)
            case let .message(message):
                let when = clock.timeLabel(message.at, now: now)
                switch message.kind {
                case .you:
                    YouBubble(text: message.body, when: when, stateWord: state.sentIDs.contains(message.id) ? SupportCopy.stateSent : nil)
                case .ai:
                    AiBubble(message: message, when: when, openLink: message.link.flatMap { linkAction?($0, onClose ?? { dismiss() }) })
                case .support:
                    PersonBubble(text: message.body, when: when)
                case .system:
                    SystemLine(text: message.body)
                }
            case let .pending(pending):
                YouBubble(
                    text: pending.text,
                    when: clock.timeLabel(pending.at, now: now),
                    stateWord: pending.state == .failed
                        ? (pending.failure == .unreachable ? SupportCopy.stateSaved : SupportCopy.stateNotSent) : nil)
            }
        }
        if aiAnswering && state.pending?.state == .sending { TypingBubble() }
    }

    struct Row: Identifiable {
        enum Content {
            case day(label: String, fresh: Bool)
            case message(SupportMessage)
            case pending(SupportPending)
        }
        let id: String
        let content: Content
    }

    /// The thread as rows: a day divider where the day changes, the "New reply" divider before the first unread person
    /// reply, each message, then the unsent one.
    static func rows(messages: [SupportMessage], dividerID: Int?, pending: SupportPending?, clock: SupportClock, now: Date) -> [Row] {
        var rows: [Row] = []
        var lastDay = ""
        func pushDay(_ iso: String) {
            let key = clock.dayKey(iso)
            if key != lastDay {
                lastDay = key
                rows.append(Row(id: "day-\(key)", content: .day(label: clock.dayLabel(iso, now: now), fresh: false)))
            }
        }
        for message in messages {
            pushDay(message.at)
            if message.id == dividerID {
                rows.append(Row(id: "new-\(message.id)", content: .day(label: SupportCopy.newReply, fresh: true)))
            }
            rows.append(Row(id: "m-\(message.id)", content: .message(message)))
        }
        if let pending {
            pushDay(pending.at)
            rows.append(Row(id: "p-\(pending.clientID)", content: .pending(pending)))
        }
        return rows
    }

    private func errorCard(_ text: String, retry: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text(text).dsText(.footnote).foregroundStyle(ds.wrongInk).fixedSize(horizontal: false, vertical: true)
            Button(action: retry) {
                Label(SupportCopy.tryAgain, systemImage: "arrow.clockwise")
            }
            .buttonStyle(.dsButton(.primary, compact: true, fullWidth: false))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoDS.Space.s3)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.wrongTint))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.wrong, lineWidth: 2))
        .accessibilityElement(children: .contain)
    }

    // MARK: - The composer

    private var composerBar: some View {
        VStack(spacing: AlphonsoDS.Space.s1) {
            HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
                TextField("", text: $model.draft, prompt: Text(composer.placeholder).foregroundStyle(ds.inkFaint), axis: .vertical)
                    .dsText(.body)
                    .foregroundStyle(ds.ink)
                    .lineLimit(1...5)
                    .textFieldStyle(.plain)
                    .focused($composing)
                    .disabled(composer.disabled || state.load != .ready)
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                    .padding(.vertical, AlphonsoDS.Space.s3)
                    .frame(minHeight: AlphonsoDS.Space.minTouch)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble + 1, style: .continuous).fill(composer.disabled || state.load != .ready ? ds.sunk : ds.card))
                    .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble + 1, style: .continuous).strokeBorder(composing ? ds.choice : ds.line, lineWidth: 2))
                    .accessibilityLabel(SupportCopy.placeholder)
                    .onChange(of: model.draft) { _, new in
                        // The server counts UTF-16 units (2000 at most), not Characters; the box never holds more.
                        let kept = SupportChatRules.clamped(new)
                        if kept != new { model.draft = kept }
                    }
                Button {
                    model.send(online: online, composerDisabled: composerDisabled)
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.body.weight(.heavy))
                        .foregroundStyle(ds.onAction)
                        .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                        .background(Circle().fill(ds.action))
                        .opacity(canSend ? 1 : 0.4)
                }
                .disabled(!canSend)
                .accessibilityLabel(SupportCopy.sendLabel)
            }
            if !composer.fine.isEmpty {
                Text(composer.fine)
                    .dsText(.caption)
                    .foregroundStyle(ds.inkFaint)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.top, AlphonsoDS.Space.s2)
        .padding(.bottom, AlphonsoDS.Space.s3)
        .background(ds.surface)
        .overlay(alignment: .top) { Rectangle().fill(ds.line).frame(height: 1) }
    }
}

// MARK: - Pieces

private struct BannerView: View {
    let banner: SupportBanner
    @Environment(\.alphonsoDS) private var ds

    private var symbol: String {
        switch banner {
        case .ai: return "info.circle"
        case .person: return "person"
        case .declined: return "lock"
        case .team: return "person.2"
        case .wait: return "hourglass"
        case .done: return "checkmark.circle"
        case .offline: return "wifi.slash"
        }
    }

    private var colours: (face: Color, text: Color, edge: Color?) {
        switch banner {
        case .ai, .person, .declined: return (ds.choiceTint, ds.choice, nil)
        case .team: return (ds.choiceTint, ds.choice, ds.choiceEdge)
        case .wait: return (ds.actionTint, ds.actionText, ds.actionEdge)
        case .done: return (ds.rightTint, ds.rightInk, ds.right)
        case .offline: return (ds.wrongTint, ds.wrongInk, ds.wrong)
        }
    }

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        HStack(alignment: .center, spacing: AlphonsoDS.Space.s3) {
            Image(systemName: symbol).dsText(.headline).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(banner.title).dsText(.footnote)
                Text(banner.body).dsText(.caption)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .foregroundStyle(colours.text)
        .padding(.horizontal, AlphonsoDS.Space.s3)
        .padding(.vertical, AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(shape.fill(colours.face))
        .overlay { if let edge = colours.edge { shape.strokeBorder(edge, lineWidth: 2) } }
        .accessibilityElement(children: .combine)
    }
}

private struct WelcomeView: View {
    let aiAnswering: Bool
    let onStarter: (String) -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            VStack(spacing: AlphonsoDS.Space.s2) {
                Image("Alphonso-explaining-pointer").resizable().scaledToFit()
                    .frame(height: AlphonsoDS.Space.s12 * 2.8)
                    .accessibilityHidden(true)
                Text(aiAnswering ? SupportCopy.welcomeAiTitle : SupportCopy.welcomeTitle)
                    .dsText(.title).foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(aiAnswering ? SupportCopy.welcomeAiBody : SupportCopy.welcomeBody)
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if aiAnswering {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                    Text(SupportCopy.canHelpWith).dsText(.overline).foregroundStyle(ds.actionText)
                        .accessibilityAddTraits(.isHeader)
                    // The starters fill the box and never send.
                    LessonFlowLayout(spacing: AlphonsoDS.Space.s2) {
                        ForEach(SupportCopy.starters, id: \.self) { starter in
                            DSChip(starter, selected: false) { onStarter(starter) }
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) {
                    Image(systemName: "info.circle").dsText(.caption).accessibilityHidden(true)
                    Text(SupportCopy.welcomeTip).dsText(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(ds.inkSoft)
                .padding(AlphonsoDS.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct DividerLine: View {
    let label: String
    let fresh: Bool
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Rectangle().fill(fresh ? ds.action : ds.line).frame(height: 1)
            Text(label).dsText(.overline).foregroundStyle(fresh ? ds.actionText : ds.inkFaint)
            Rectangle().fill(fresh ? ds.action : ds.line).frame(height: 1)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The shape of a bubble: the corner nearest its speaker is tight, the others round (the mock's 20 / 6 corners).
private struct BubbleShape: Shape {
    let tightCorner: UIRectCorner

    func path(in rect: CGRect) -> Path {
        let round = AlphonsoDS.Radius.bubble - 2
        let tight = AlphonsoDS.Radius.key - 2
        func radius(_ corner: UIRectCorner) -> CGFloat { tightCorner == corner ? tight : round }
        var path = Path()
        let (tl, tr, br, bl) = (radius(.topLeft), radius(.topRight), radius(.bottomRight), radius(.bottomLeft))
        path.move(to: CGPoint(x: rect.minX + tl, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX - tr, y: rect.minY))
        path.addArc(center: CGPoint(x: rect.maxX - tr, y: rect.minY + tr), radius: tr, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - br))
        path.addArc(center: CGPoint(x: rect.maxX - br, y: rect.maxY - br), radius: br, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + bl, y: rect.maxY))
        path.addArc(center: CGPoint(x: rect.minX + bl, y: rect.maxY - bl), radius: bl, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + tl))
        path.addArc(center: CGPoint(x: rect.minX + tl, y: rect.minY + tl), radius: tl, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.closeSubpath()
        return path
    }
}

private struct YouBubble: View {
    let text: String
    let when: String
    let stateWord: String?
    @Environment(\.alphonsoDS) private var ds

    var bodyText: some View {
        Text(text).dsText(.body).foregroundStyle(ds.card)
            .padding(.horizontal, AlphonsoDS.Space.s4 - 2).padding(.vertical, AlphonsoDS.Space.s3)
            .background(BubbleShape(tightCorner: .bottomRight).fill(ds.choice))
            .textSelection(.enabled)
    }

    var body: some View {
        VStack(alignment: .trailing, spacing: AlphonsoDS.Space.s1) {
            Text(SupportCopy.you).dsText(.overline).foregroundStyle(ds.inkSoft)
            bodyText
            Text(stateWord.map { "\(when) \u{00B7} \($0)" } ?? when).dsText(.caption).foregroundStyle(ds.inkFaint)
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.leading, AlphonsoDS.Space.s8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(SupportCopy.you): \(text). \(stateWord.map { "\(when), \($0)" } ?? when)")
    }
}

private struct SpeakerTag: View {
    let text: String
    var quiet = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(text).dsText(.overline)
            .foregroundStyle(quiet ? ds.inkSoft : ds.actionText)
            .padding(.horizontal, AlphonsoDS.Space.s1 + 2).padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key - 2, style: .continuous).fill(quiet ? ds.sunk : ds.actionTint))
    }
}

private struct AiFace: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Image("Alphonso-help-head").resizable().scaledToFill()
            .frame(width: AlphonsoDS.Space.s8 + 2, height: AlphonsoDS.Space.s8 + 2)
            .background(ds.choiceTint)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(ds.line, lineWidth: 2))
            .accessibilityHidden(true)
    }
}

private struct AiBubble: View {
    let message: SupportMessage
    let when: String
    let openLink: (() -> Void)?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
                AiFace()
                HStack(spacing: AlphonsoDS.Space.s1 + 2) {
                    Text(SupportCopy.ai).dsText(.overline).foregroundStyle(ds.inkSoft)
                    SpeakerTag(text: SupportCopy.aiTag)
                }
            }
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text(message.body).dsText(.body).foregroundStyle(ds.ink).textSelection(.enabled)
                // The one link an answer can carry: an allowed in-app screen, by id, never a URL.
                if let link = message.link, let openLink {
                    Button(action: openLink) {
                        HStack(spacing: AlphonsoDS.Space.s1 + 2) {
                            Text(link.label).dsText(.footnote)
                            Image(systemName: "arrow.right").dsText(.caption).accessibilityHidden(true)
                        }
                        .foregroundStyle(ds.choice)
                        .padding(.horizontal, AlphonsoDS.Space.s3)
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control - AlphonsoDS.Space.s1, style: .continuous).fill(ds.choiceTint))
                        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control - AlphonsoDS.Space.s1, style: .continuous).strokeBorder(ds.choiceEdge, lineWidth: 2))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.s4 - 2).padding(.vertical, AlphonsoDS.Space.s3)
            .background(BubbleShape(tightCorner: .bottomLeft).fill(ds.card))
            .overlay(BubbleShape(tightCorner: .bottomLeft).stroke(ds.line, lineWidth: 2))
            Text(when).dsText(.caption).foregroundStyle(ds.inkFaint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, AlphonsoDS.Space.s8)
        .accessibilityElement(children: .contain)
    }
}

private struct PersonBubble: View {
    let text: String
    let when: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
                Image(systemName: "person.fill").dsText(.footnote).foregroundStyle(ds.surface)
                    .frame(width: AlphonsoDS.Space.s8 + 2, height: AlphonsoDS.Space.s8 + 2)
                    .background(Circle().fill(ds.brand))
                    .accessibilityHidden(true)
                HStack(spacing: AlphonsoDS.Space.s1 + 2) {
                    Text(SupportCopy.person).dsText(.overline).foregroundStyle(ds.inkSoft)
                    SpeakerTag(text: SupportCopy.personTag, quiet: true)
                }
            }
            Text(text).dsText(.body).foregroundStyle(ds.ink)
                .padding(.horizontal, AlphonsoDS.Space.s4 - 2).padding(.vertical, AlphonsoDS.Space.s3)
                .background(BubbleShape(tightCorner: .bottomLeft).fill(ds.choiceTint))
                .overlay(BubbleShape(tightCorner: .bottomLeft).stroke(ds.choiceEdge, lineWidth: 2))
                .textSelection(.enabled)
            Text(when).dsText(.caption).foregroundStyle(ds.inkFaint)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, AlphonsoDS.Space.s8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(SupportCopy.person), \(SupportCopy.personTag): \(text). \(when)")
    }
}

private struct SystemLine: View {
    let text: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Text(text).dsText(.caption).foregroundStyle(ds.inkSoft)
            .multilineTextAlignment(.center)
            .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s2)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key + 4, style: .continuous).fill(ds.sunk))
            .frame(maxWidth: .infinity)
    }
}

/// "Alphonso AI is writing…" while the AI answers: said in words as well as dots, and Send is closed meanwhile.
private struct TypingBubble: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            HStack(alignment: .bottom, spacing: AlphonsoDS.Space.s2) {
                AiFace()
                HStack(spacing: AlphonsoDS.Space.s1 + 2) {
                    Text(SupportCopy.ai).dsText(.overline).foregroundStyle(ds.inkSoft)
                    SpeakerTag(text: SupportCopy.aiTag)
                    Text(SupportCopy.isWriting).dsText(.overline).foregroundStyle(ds.inkSoft)
                }
            }
            HStack(spacing: AlphonsoDS.Space.s1 + 2) {
                ForEach([1.0, 0.65, 0.35], id: \.self) { opacity in
                    Circle().fill(ds.inkFaint.opacity(opacity)).frame(width: AlphonsoDS.Space.s2, height: AlphonsoDS.Space.s2)
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.s4).padding(.vertical, AlphonsoDS.Space.s3 + 2)
            .background(BubbleShape(tightCorner: .bottomLeft).fill(ds.card))
            .overlay(BubbleShape(tightCorner: .bottomLeft).stroke(ds.line, lineWidth: 2))
            .accessibilityHidden(true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(SupportCopy.ai) \(SupportCopy.isWriting)")
    }
}

/// The daily limit: the sleepy pose says "come back tomorrow", not "you did something wrong".
private struct DailyLimitView: View {
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Image("Alphonso-sleepy-night").resizable().scaledToFit()
                .frame(height: AlphonsoDS.Space.s12 * 3)
                .accessibilityHidden(true)
            Text(SupportCopy.dailyLimit).dsText(.footnote).foregroundStyle(ds.ink)
                .multilineTextAlignment(.center)
            Text(SupportCopy.dailyLimitNote).dsText(.caption).foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Entry points

/// "Get help": opens the chat in a sheet over a screen that reports a problem. Shown only when the app has a signed-in
/// session in the environment.
struct GetHelpButton: View {
    var prominent = false
    @Environment(\.helpSession) private var session
    @State private var showing = false

    var body: some View {
        if let session {
            Button { showing = true } label: {
                Label(SupportCopy.getHelp, systemImage: "lifepreserver")
            }
            .buttonStyle(.dsButton(prominent ? .primary : .secondary, compact: !prominent, fullWidth: prominent))
            .sheet(isPresented: $showing) {
                NavigationStack {
                    HelpChatView(session: session, onClose: { showing = false })
                }
            }
        }
    }
}

/// The Settings row: its own section between AI features and Account.
struct HelpSettingsRow: View {
    let session: Session
    var linkAction: ((SupportLinkID, _ leave: @escaping () -> Void) -> (() -> Void)?)?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard(spacing: AlphonsoDS.Space.s1) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                Image(systemName: "lifepreserver").dsText(.headline).foregroundStyle(ds.card)
                    .frame(width: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s1, height: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s1)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control - AlphonsoDS.Space.s1, style: .continuous).fill(ds.choice))
                    .accessibilityHidden(true)
                SettingsNavLabel(title: SupportCopy.entryTitle, subtitle: SupportCopy.entrySubtitle)
            }
            // The link sits invisibly behind the row: a visible NavigationLink in a List adds a second chevron.
            .background(NavigationLink(SupportCopy.entryTitle) { HelpChatView(session: session, linkAction: linkAction) }.opacity(0).accessibilityHidden(true))
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
        }
    }
}
