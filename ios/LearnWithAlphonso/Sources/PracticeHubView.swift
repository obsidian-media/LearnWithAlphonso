import SwiftUI
import LearnWithAlphonsoKit

/// The Practice hub ("Practice A"): call cards, conversations, a campaigns rail, split drills and Hector's quiet nudge, with native navigation and scrolling at large text sizes.
struct PracticeHubView: View {
    let contentStore: ContentStore
    let session: Session
    let course: Course
    let conversationStore: ConversationStore
    let entitlementStore: EntitlementStore
    private var ds: AlphonsoDS.Colors { AlphonsoDS.colors(AlphonsoThemeManager.shared.paletteID, night: false) }
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var data: PracticeHubData?
    @State private var error = false
    @State private var level = "All"
    @State private var target: PracticeTarget?
    @State private var playing: PracticeTarget?
    @State private var chat = false
    @State private var modeInitialized = false
    @State private var paywall = false
    @State private var sayPicture = false
    @State private var sayItRight = false
    /// A talk or campaign stop tapped on the learning path: opened here once Practice is showing.
    @Environment(PathDeepLink.self) private var deepLink
    /// The subscription screen for the memory sheet over a call's result.
    private var upgradeBuilder: UpgradeViewBuilder {
        { close in AnyView(PaywallView(entitlementStore: entitlementStore, source: .practiceCard, onClose: close)) }
    }
    private var scenarios: [Scenario] { contentStore.scenarios(for: course) }
    private var campaigns: [Campaign] { contentStore.campaigns(for: course) }
    private var rows: [PracticeStarRow] { data?.stars ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                    HStack(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s3) {
                        Text("Practice").dsText(.display).foregroundStyle(ds.ink).lineLimit(1).minimumScaleFactor(0.5).accessibilityAddTraits(.isHeader)
                        Spacer(minLength: CGFloat.zero)
                        if let data {
                            let tally = PracticeHub.tally(data.stars, scenarios: scenarios, campaigns: campaigns)
                            Label("\(tally.earned) / \(tally.total)", systemImage: "star.fill").dsText(.caption).lineLimit(1).minimumScaleFactor(0.6)
                                .foregroundStyle(ds.xpText).padding(AlphonsoDS.Space.s2).background(ds.xpTint, in: Capsule())
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel("\(tally.earned) of \(tally.total) stars earned")
                        }
                    }
                    Text(greeting).dsText(.caption).foregroundStyle(ds.inkSoft)
                    if let data {
                        // The call cards: where the learner left off, then Today's picks (the Kit's rule).
                        PracticeHeroCarousel(cards: heroCards(data), call: { card in chat = false; target = card.target }, chat: { card in chat = true; target = card.target })
                    } else if error {
                        Text("Could not load Practice.").dsText(.body)
                        Button("Try again") { Task { await load() } }
                    } else { ProgressView("Loading Practice…") }
                    practiceSectionLabel("Conversations")
                    ScrollView(.horizontal) {
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            ForEach(PracticeHub.levels, id: \.self) { l in
                                Button { level = l } label: {
                                    Text(l).dsText(.footnote).padding(AlphonsoDS.Space.s3)
                                        .background(level == l ? ds.choiceTint : ds.card, in: Capsule())
                                }.accessibilityAddTraits(level == l ? .isSelected : [])
                            }
                        }
                    }.scrollIndicators(.hidden)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: AlphonsoDS.Space.s3), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                        ForEach(PracticeHub.filtered(scenarios, level: level)) { scenario in
                            let n = PracticeHub.stars(rows, kind: "scenario", key: scenario.id)
                            Button { target = .scenario(scenario) } label: {
                                PracticeTile(room: scenario.id, overline: scenario.level, title: scenario.title, stars: data == nil ? nil : n, mastered: n >= 3)
                            }.buttonStyle(.plain)
                        }
                    }
                    practiceSectionLabel("Campaigns · \(campaigns.count) stories")
                    // Each campaign is a card with its own room, how far in, and a dot per scene; the scene stars are in its detail.
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                            ForEach(campaigns) { c in
                                let progress = PracticeHub.progress(c, rows: rows)
                                Button { target = .campaign(c, PracticeHub.nextScene(c, rows: rows)) } label: {
                                    PracticeTile(room: PracticeHub.room(campaignID: c.id, sceneID: c.scenes[0].id), overline: "\(c.level) · \(c.scenes.count) scenes", title: c.title, stars: nil, mastered: false, progress: data == nil ? nil : progress)
                                        .frame(width: AlphonsoDS.Space.s12 * 3 + AlphonsoDS.Space.s4)
                                }.buttonStyle(.plain)
                            }
                        }
                    }.scrollIndicators(.hidden)
                    practiceSectionLabel("Quick practice")
                    PracticeDrillCard(title: "Say the picture", detail: "See a picture and say the word. A miss shows you the word and how it sounds.", identifier: "practiceSayPictureCard", action: { sayPicture = true }) {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: AlphonsoDS.Space.s1) {
                            ForEach(["\u{2615}", "\u{2708}\u{FE0F}", "\u{1FA7A}", "\u{1F35D}"], id: \.self) { Icon3DView(emoji: $0, size: AlphonsoDS.Space.s6) }
                        }.padding(AlphonsoDS.Space.s2).frame(maxHeight: .infinity).background(ds.choiceTint)
                    }
                    PracticeDrillCard(title: "Say it right", detail: "Hear a word you have learned, say it, and find out how clearly you were understood. A miss teaches, it never punishes.", identifier: "practiceSayItRightCard", action: { sayItRight = true }) {
                        Image(systemName: "waveform").dsText(.display).foregroundStyle(ds.rightEdge).frame(maxWidth: .infinity, maxHeight: .infinity).background(ds.rightTint)
                    }
                    // Hector keeps the same entitlement and paywall source rules as the previous Practice card; quiet and last.
                    if !entitlementStore.isPro {
                        Button { paywall = true } label: {
                            HStack(alignment: .center, spacing: AlphonsoDS.Space.s3) {
                                Image("Hector-waving").resizable().scaledToFit().frame(height: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s3).accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                                    Text(PaywallCopy.practiceCardTitle + " · Pro").dsText(.headline)
                                    Text(PaywallCopy.practiceCardSubtitle).dsText(.caption).foregroundStyle(ds.onHeroSoft)
                                }
                            }.padding(AlphonsoDS.Space.s3).frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(ds.onHero)
                                .background(ds.hero, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                        }.buttonStyle(.plain).accessibilityIdentifier("practiceHectorCard")
                    }
                }.padding(AlphonsoDS.Space.gutter).environment(\.alphonsoDS, ds)
            }.background(ds.surface).foregroundStyle(ds.ink)
                .task { if !modeInitialized { chat = !(UserDefaults.standard.object(forKey: AvatarPreference.key) as? Bool ?? AvatarPreference.defaultValue); modeInitialized = true }; await load() }.refreshable { await load() }
                .sheet(item: $target) { t in
                    PracticePreCall(target: t, chat: $chat, rows: rows) { target = nil; playing = t }.environment(\.alphonsoDS, ds).environment(\.colorScheme, .light)
                }
                .navigationDestination(isPresented: $sayPicture) {
                    SayThePictureView(contentStore: contentStore, session: session, course: course, onExit: { sayPicture = false }).environment(\.alphonsoDS, ds)
                }
                .navigationDestination(isPresented: $sayItRight) {
                    PronunciationView(contentStore: contentStore, session: session, course: course, onExit: { sayItRight = false }).environment(\.alphonsoDS, ds)
                }
                .sheet(isPresented: $paywall) { PaywallView(entitlementStore: entitlementStore, source: .practiceCard, onClose: { paywall = false }) }
                .navigationDestination(item: $playing) { t in
                    switch t {
                    case let .scenario(s): ConversationSessionView(scenario: s, course: course, session: session, conversationStore: conversationStore, chatMode: chat, upgradeView: upgradeBuilder)
                    case let .campaign(c, i): CampaignSessionView(campaign: c, course: course, session: session, conversationStore: conversationStore, startScene: i, chatMode: chat, upgradeView: upgradeBuilder)
                    }
                }
        }.onChange(of: playing == nil) { if playing == nil { Task { await load() } } }
            .task(id: deepLink.pending) { openPathStop() }
    }

    /// The carousel's cards: where the learner left off (if anywhere), then Today's picks, three in all (the Kit's rule).
    private func heroCards(_ data: PracticeHubData) -> [PracticeHeroCard] {
        var out: [PracticeHeroCard] = []
        if let resume = PracticeHub.resume(rows, campaigns: campaigns), let c = campaigns.first(where: { $0.id == resume.campaignID }) {
            let scene = c.scenes[resume.sceneIndex]
            out.append(PracticeHeroCard(id: "continue:\(c.id):\(resume.sceneIndex)", kicker: "Continue", title: scene.title,
                subtitle: "\(c.title) · Scene \(resume.sceneIndex + 1) of \(c.scenes.count)", reason: "Pick up where you left off",
                room: PracticeHub.room(campaignID: c.id, sceneID: scene.id), stars: PracticeHub.stars(rows, kind: "scene", key: c.id + "/" + scene.id), target: .campaign(c, resume.sceneIndex)))
        }
        var first = true
        for pick in PracticeHub.picks(data, scenarios: scenarios).prefix(max(0, PracticeHub.heroCards - out.count)) {
            guard let s = scenarios.first(where: { $0.id == pick.scenarioID }) else { continue }
            out.append(PracticeHeroCard(id: "pick:\(s.id)", kicker: first ? "Today's pick" : "Also for you", title: s.title, subtitle: s.level,
                reason: PracticeHub.reason(pick, level: s.level, first: first), room: s.id, stars: PracticeHub.stars(rows, kind: "scenario", key: s.id), target: .scenario(s)))
            first = false
        }
        return out
    }

    /// Opens the pre-call sheet for the path stop that sent the learner here, if it is in this course's content.
    private func openPathStop() {
        guard let destination = deepLink.pending else { return }
        deepLink.pending = nil
        let counts = Dictionary(campaigns.map { ($0.id, $0.scenes.count) }, uniquingKeysWith: { a, _ in a })
        switch PathStopRouting.practiceChoice(for: destination, scenarioIDs: scenarios.map(\.id), campaignSceneCounts: counts) {
        case let .scenario(id)?:
            if let s = scenarios.first(where: { $0.id == id }) { target = .scenario(s) }
        case let .campaign(id, scene)?:
            if let c = campaigns.first(where: { $0.id == id }) { target = .campaign(c, scene) }
        case nil:
            break
        }
    }
    private var greeting: String {
        switch course.wireCode {
        case "fr": return "On pratique un peu aujourd'hui ?\nShall we practice a bit today?"
        case "es": return "¿Practicamos un poco hoy?\nShall we practice a bit today?"
        default: return "Shall we practice a bit today?"
        }
    }
    private func load() async {
        do { data = try await practiceClient(session).practiceHub(course: course.wireCode); error = false }
        catch { self.error = true }
    }
}

enum PracticeTarget: Identifiable, Hashable {
    case scenario(Scenario), campaign(Campaign, Int)
    var id: String { switch self { case let .scenario(s): return s.id; case let .campaign(c, i): return c.id + "/" + String(i) } }
    static func == (a: Self, b: Self) -> Bool { a.id == b.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    var title: String { switch self { case let .scenario(s): return s.title; case let .campaign(c, i): return c.scenes[i].title } }
    var detail: String { switch self { case let .scenario(s): return s.level; case let .campaign(c, i): return "\(c.level) · \(c.title), scene \(i + 1) of \(c.scenes.count)" } }
    var persona: String { switch self { case let .scenario(s): return s.persona ?? ""; case let .campaign(c, i): return c.scenes[i].persona ?? "" } }
    var opener: String { switch self { case let .scenario(s): return s.opener; case let .campaign(c, i): return c.scenes[i].opener } }
}

struct PracticePreCall: View {
    let target: PracticeTarget
    @Binding var chat: Bool
    /// The learner's stars, for the campaign's scene list.
    var rows: [PracticeStarRow] = []
    let start: () -> Void
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                Button("Close", systemImage: "xmark") { dismiss() }
                Text(target.title).dsText(.questionSmall)
                Text(target.detail).dsText(.caption)
                Text(target.persona).dsText(.footnote)
                Text("\(target.persona.components(separatedBy: ",").first ?? "Alphonso") starts the \(chat ? "chat" : "call"):").dsText(.caption)
                Text(target.opener).dsText(.body).padding(AlphonsoDS.Space.s3)
                    .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
                // A campaign's detail: every scene with the stars it holds, the one starting now first in line.
                if case let .campaign(c, current) = target {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        Text("Scenes in this campaign").dsText(.overline)
                        ForEach(Array(c.scenes.enumerated()), id: \.element.id) { i, scene in
                            let n = PracticeHub.stars(rows, kind: "scene", key: c.id + "/" + scene.id)
                            HStack(spacing: AlphonsoDS.Space.s2) {
                                Text("\(i + 1). \(scene.title)").dsText(.caption).fontWeight(i == current ? .bold : .regular)
                                Spacer(minLength: CGFloat.zero)
                                PracticeStarsView(n: n)
                            }.accessibilityElement(children: .combine).accessibilityLabel("Scene \(i + 1), \(scene.title), \(PracticeHub.starLabel(n))")
                        }
                    }.padding(AlphonsoDS.Space.s3).frame(maxWidth: .infinity, alignment: .leading)
                        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                }
                Text("How to earn stars").dsText(.overline)
                ForEach(Array(PracticeHub.starRules(chat: chat).enumerated()), id: \.offset) { i, line in
                    HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                        PracticeStarsView(n: i + 1)
                        Text(line).dsText(.caption).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Picker("How to practice", selection: $chat) {
                    Text("Call (speak)").tag(false)
                    Text("Chat (type)").tag(true)
                }.pickerStyle(.segmented)
                PracticeButton(chat ? "Start the chat" : "Start the call", action: start)
            }.padding(AlphonsoDS.Space.gutter)
        }.background(ds.surface).foregroundStyle(ds.ink)
    }
}

/// One call card: a scenario picked for the learner, or the campaign scene they were in the middle of.
struct PracticeHeroCard: Identifiable {
    let id: String
    let kicker: String
    let title: String
    let subtitle: String
    let reason: String
    let room: String
    let stars: Int
    let target: PracticeTarget
}

/// The swipeable call cards with page dots. The dots are buttons, so the carousel works without a swipe (VoiceOver,
/// Switch Control); every card stays in the accessibility tree. It never advances by itself.
struct PracticeHeroCarousel: View {
    let cards: [PracticeHeroCard]
    let call: (PracticeHeroCard) -> Void
    let chat: (PracticeHeroCard) -> Void
    @State private var current: String?
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var index: Int { cards.firstIndex { $0.id == current } ?? 0 }
    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            ScrollView(.horizontal) {
                HStack(spacing: AlphonsoDS.Space.s3) {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        PracticeHeroCardView(card: card, position: i + 1, count: cards.count, call: { call(card) }, chat: { chat(card) })
                            .containerRelativeFrame(.horizontal) { width, _ in cards.count > 1 ? width * 0.86 : width }
                            .id(card.id)
                    }
                }.scrollTargetLayout()
            }
            .scrollIndicators(.hidden)
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $current)
            .accessibilityIdentifier("practiceHeroCarousel")
            if cards.count > 1 {
                HStack(spacing: CGFloat.zero) {
                    ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                        Button {
                            if reduceMotion { current = card.id } else { withAnimation { current = card.id } }
                        } label: {
                            Capsule().fill(i == index ? ds.choice : ds.line)
                                .frame(width: i == index ? AlphonsoDS.Space.s5 : AlphonsoDS.Space.s2 - AlphonsoDS.Space.s1 / 2, height: AlphonsoDS.Space.s2 - AlphonsoDS.Space.s1 / 2)
                                .frame(minWidth: AlphonsoDS.Space.s6, minHeight: AlphonsoDS.Space.s6)
                        }.buttonStyle(.plain)
                            .accessibilityLabel("Show call \(i + 1) of \(cards.count)")
                            .accessibilityAddTraits(i == index ? .isSelected : [])
                    }
                }.frame(maxWidth: .infinity)
            }
        }
    }
}

/// The incoming-call treatment: the scene behind, the full Alphonso, a "ready" cue and the round Call / Chat answers.
/// The pre-call sheet (opened by either button) still carries the star rules and the call-or-chat choice.
struct PracticeHeroCardView: View {
    let card: PracticeHeroCard
    let position: Int
    let count: Int
    let call: () -> Void
    let chat: () -> Void
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            VStack(spacing: AlphonsoDS.Space.s1) {
                Text("\(card.kicker) · \(position) of \(count)").dsText(.overline).foregroundStyle(ds.onHeroKick)
                Text(card.title).dsText(.questionSmall)
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Text(card.subtitle).dsText(.caption).foregroundStyle(ds.onHeroSoft)
                    PracticeStarsView(n: card.stars)
                }
                Text(card.reason).dsText(.caption).padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s1)
                    .background(ds.onHero.opacity(0.15), in: Capsule())
            }.multilineTextAlignment(.center).accessibilityElement(children: .combine)
            Spacer(minLength: AlphonsoDS.Space.s2)
            if !dynamicTypeSize.isAccessibilitySize {
                Image("Alphonso-waving").resizable().scaledToFit().frame(height: AlphonsoDS.Space.s12 * 3)
                    .shadow(radius: AlphonsoDS.Space.s2).accessibilityHidden(true)
            }
            Text("Alphonso is ready").dsText(.caption).foregroundStyle(ds.callMint).accessibilityHidden(true)
            HStack(alignment: .top, spacing: AlphonsoDS.Space.s8) {
                answer("Call", icon: "mic.fill", gold: true, label: "Call Alphonso: \(card.title)", run: call)
                answer("Chat", icon: "text.bubble.fill", gold: false, label: "Chat with Alphonso: \(card.title)", run: chat)
            }
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 * 7)
        .foregroundStyle(ds.onHero)
        .background {
            ZStack {
                ds.hero
                if let art = LessonArt.room(card.room) { Image(uiImage: art).resizable().scaledToFill() }
                LinearGradient(stops: [.init(color: ds.heroB.opacity(0.6), location: 0), .init(color: ds.heroB.opacity(0.1), location: 0.3), .init(color: ds.heroB.opacity(0.15), location: 0.5), .init(color: ds.heroB.opacity(0.85), location: 0.8), .init(color: ds.heroB, location: 1)], startPoint: .top, endPoint: .bottom)
            }.allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.sheet))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(position) of \(count): \(card.title)")
    }
    private func answer(_ title: String, icon: String, gold: Bool, label: String, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            VStack(spacing: AlphonsoDS.Space.s1) {
                Image(systemName: icon).dsText(.title)
                    .frame(width: AlphonsoDS.Space.s12 + (gold ? AlphonsoDS.Space.s3 : AlphonsoDS.Space.s1), height: AlphonsoDS.Space.s12 + (gold ? AlphonsoDS.Space.s3 : AlphonsoDS.Space.s1))
                    .foregroundStyle(gold ? ds.onAction : ds.onHero)
                    .background(gold ? ds.action : ds.onHero.opacity(0.2), in: Circle())
                Text(title).dsText(.caption)
            }
        }.buttonStyle(.plain).accessibilityElement(children: .ignore).accessibilityLabel(label).accessibilityAddTraits(.isButton)
    }
}

/// A scenario or campaign in its painted room: level, title, stars (or progress dots) and a gold Mastered badge at three stars.
struct PracticeTile: View {
    let room: String
    let overline: String
    let title: String
    let stars: Int?
    let mastered: Bool
    var progress: PracticeCampaignProgress?
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            HStack(alignment: .top) {
                Spacer(minLength: CGFloat.zero)
                if mastered {
                    Label("Mastered", systemImage: "checkmark").dsText(.overline).foregroundStyle(ds.onAction)
                        .padding(.horizontal, AlphonsoDS.Space.s2).padding(.vertical, AlphonsoDS.Space.s1 / 2).background(ds.action, in: Capsule())
                }
            }
            Spacer(minLength: AlphonsoDS.Space.s12)
            Text(overline).dsText(.overline).foregroundStyle(ds.onHeroKick)
            Text(title).dsText(.footnote).fixedSize(horizontal: false, vertical: true)
            if let stars { PracticeStarsView(n: stars) }
            if let progress {
                HStack(spacing: AlphonsoDS.Space.s2) {
                    HStack(spacing: AlphonsoDS.Space.s1 / 2) {
                        ForEach(Array(progress.scenes.enumerated()), id: \.offset) { _, done in
                            Capsule().fill(done ? ds.action : ds.onHero.opacity(0.35)).frame(width: AlphonsoDS.Space.s3, height: AlphonsoDS.Space.s1)
                        }
                    }
                    Text(PracticeHub.progressLabel(progress)).dsText(.overline).foregroundStyle(ds.onHeroSoft)
                }.accessibilityElement(children: .ignore).accessibilityLabel("\(progress.done) of \(progress.total) scenes done")
            }
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 * 3, alignment: .topLeading)
        .foregroundStyle(ds.onHero)
        .background {
            ZStack {
                ds.hero
                if let art = LessonArt.room(room) { Image(uiImage: art).resizable().scaledToFill() }
                LinearGradient(stops: [.init(color: ds.heroB.opacity(0), location: 0.3), .init(color: ds.heroB.opacity(0.78), location: 0.62), .init(color: ds.heroB.opacity(0.92), location: 1)], startPoint: .top, endPoint: .bottom)
            }.allowsHitTesting(false)
        }
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
    }
}

/// A featured drill: its own thumbnail, title, line and a Start button. The whole card is one button.
struct PracticeDrillCard<Thumb: View>: View {
    let title: String
    let detail: String
    let identifier: String
    let action: () -> Void
    @ViewBuilder let thumb: () -> Thumb
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: CGFloat.zero) {
                thumb().frame(width: AlphonsoDS.Space.s12 * 2).frame(maxHeight: .infinity).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Text(title).dsText(.headline)
                    Text(detail).dsText(.caption).foregroundStyle(ds.inkSoft).fixedSize(horizontal: false, vertical: true)
                    Text("Start").dsText(.caption).foregroundStyle(ds.onChoice)
                        .padding(.horizontal, AlphonsoDS.Space.s3).padding(.vertical, AlphonsoDS.Space.s2).background(ds.choice, in: Capsule())
                        .padding(.top, AlphonsoDS.Space.s1)
                }.padding(AlphonsoDS.Space.s3).frame(maxWidth: .infinity, alignment: .leading)
            }.background(ds.card).clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control).strokeBorder(ds.line, lineWidth: AlphonsoDS.Space.s1 / 2))
        }.buttonStyle(.plain).accessibilityIdentifier(identifier)
    }
}

struct PracticeStarsView: View {
    let n: Int
    var prominent = false
    /// A result with no stars draws the three still to earn as dashed gold outlines, not dead grey ones.
    var emptyOutlined = false
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s1) {
            ForEach(0..<3) { i in
                if emptyOutlined && i >= n {
                    PracticeStarOutline()
                        .stroke(ds.actionEdge.opacity(0.75), style: StrokeStyle(lineWidth: AlphonsoDS.Space.s1 / 2, lineJoin: .round, dash: [AlphonsoDS.Space.s1 / 2, AlphonsoDS.Space.s1 / 2]))
                        .frame(width: AlphonsoDS.Space.s12, height: AlphonsoDS.Space.s12)
                } else {
                    Image(systemName: i < n ? "star.fill" : "star").foregroundStyle(i < n ? ds.xp : ds.inkFaint)
                }
            }
        }.dsText(prominent ? .displayXL : .footnote).accessibilityElement(children: .ignore).accessibilityLabel(PracticeHub.starLabel(n))
    }
}
/// The star outline, on the design system's 24-point icon grid.
struct PracticeStarOutline: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        let points: [(CGFloat, CGFloat)] = [(12, 2.8), (14.8, 8.7), (21.2, 9.6), (16.5, 14.1), (17.7, 20.5), (12, 17.4), (6.3, 20.5), (7.5, 14.1), (2.8, 9.6), (9.2, 8.7)]
        var path = Path()
        for (index, point) in points.enumerated() {
            let p = CGPoint(x: rect.minX + point.0 * s, y: rect.minY + point.1 * s)
            if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
        }
        path.closeSubpath()
        return path
    }
}
struct PracticeButton: View {
    let title: String
    let action: () -> Void
    var secondary = false
    @Environment(\.alphonsoDS) private var ds
    init(_ title: String, secondary: Bool = false, action: @escaping () -> Void) { self.title = title; self.secondary = secondary; self.action = action }
    var body: some View {
        Button(action: action) {
            Text(title).dsText(.answer).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                .padding(AlphonsoDS.Space.s3).foregroundStyle(secondary ? ds.brand : ds.onAction)
                .background(secondary ? ds.card : ds.action, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
        }.buttonStyle(.plain)
    }
}
@MainActor func practiceClient(_ session: Session) -> AIConversationClient {
    let token = session.accessToken ?? ""
    return AIConversationClient(baseURL: AppConfig.apiBaseURL, accessToken: { token },
                         refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
}
struct PracticeResultView: View {
    let result: PracticeResult
    let room: String
    let course: String
    let seconds: Int
    let slip: (said: String, reply: String)?
    /// A scenario talk or one scene of a campaign: it decides which buttons the screen shows (`PracticeResultButtons`).
    let context: PracticeResultContext
    let retry: () -> Void
    /// The forward button: Next scene, Finish campaign or Done.
    let forward: () -> Void
    /// The call recap. It takes the slip's slot while it is pending or ready; with none (a short call, offline, an AI
    /// error) the slip shows exactly as before.
    var recap: CallRecapModel?
    var session: Session?
    var callId: String = ""
    var onOpenMemory: () -> Void = {}
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// Follows Royal light and night; Meadow is always light (`AlphonsoThemeManager.isNight`).
    private var ds: AlphonsoDS.Colors { AlphonsoDS.current }
    private var night: Bool { AlphonsoThemeManager.shared.isNight }
    private var buttons: PracticeResultButtons { result.buttons(for: context) }
    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s3) {
                alphonso
                PracticeStarsView(n: result.displayedStars, prominent: true, emptyOutlined: result.displayedStars == 0)
                Text(result.headline(course: course)).dsText(.title).multilineTextAlignment(.center)
                hint
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: AlphonsoDS.Space.s2) { stats }
                    VStack(spacing: AlphonsoDS.Space.s2) { stats }
                }
                if let recap, let session, recap.status != .off {
                    RecapCardView(model: recap, session: session, callId: callId, courseCode: course, onOpenMemory: onOpenMemory)
                } else if let slip = result.slipToShow(slip) {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        Text("Your slip").dsText(.caption)
                        Text(slip.said).strikethrough().foregroundStyle(ds.wrongInk)
                        Text("Alphonso: " + slip.reply).foregroundStyle(ds.rightInk)
                    }
                    .dsText(.footnote)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(AlphonsoDS.Space.s3)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                    .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
                }
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: AlphonsoDS.Space.s2) { resultActions }
                } else {
                    HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) { resultActions }
                }
            }
            .padding(AlphonsoDS.Space.gutter)
            .environment(\.alphonsoDS, ds)
        }
        // The room runs full-bleed under a scrim that fades into the surface; at night it is dimmed the way the call dims it.
        .background(alignment: .top) { roomBackdrop }
        .background(ds.surface)
        .foregroundStyle(ds.ink)
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
    }
    private var roomBackdrop: some View {
        Color.clear
            .frame(height: AlphonsoDS.Space.s12 * 9)
            .overlay { if let art = LessonArt.room(room) { Image(uiImage: art).resizable().scaledToFill() } }
            .overlay { ds.callGlass.opacity(night ? 0.4 : 0) }
            .overlay {
                LinearGradient(
                    stops: [.init(color: ds.surface.opacity(0), location: 0), .init(color: ds.surface.opacity(0), location: 0.55), .init(color: ds.surface, location: 1)],
                    startPoint: .top, endPoint: .bottom)
            }
            .clipped()
            .ignoresSafeArea(edges: .top)
            .accessibilityHidden(true)
    }
    private var alphonso: some View {
        Color.clear.frame(height: AlphonsoDS.Space.s12 * 5)
            .overlay {
                if let art = LessonArt.expression(result.stars >= 2 ? .happy : .neutral) { Image(uiImage: art).resizable().scaledToFit() }
            }
            .accessibilityHidden(true)
    }
    /// With no stars the hint sits in a gold-tint card with the replies meter; otherwise it is a plain line.
    @ViewBuilder private var hint: some View {
        let text = result.hint + (result.bestBefore > 0 && result.bestAfter > result.bestBefore ? " A new best for this room." : "")
        if result.displayedStars == 0 {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text(text).dsText(.footnote).fontWeight(.bold)
                if let meter = result.repliesMeter {
                    HStack(spacing: AlphonsoDS.Space.s1 + AlphonsoDS.Space.s1 / 2) {
                        ForEach(0..<meter.needed, id: \.self) { i in
                            Capsule().fill(i < meter.given ? ds.action : ds.sunk)
                                .overlay(Capsule().strokeBorder(ds.line, lineWidth: i < meter.given ? 0 : 1.5))
                                .frame(height: AlphonsoDS.Space.s2)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(meter.given) of \(meter.needed) replies")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AlphonsoDS.Space.s3)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.actionTint))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
        } else {
            Text(text).dsText(.footnote).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center)
        }
    }
    @ViewBuilder private var resultActions: some View {
        if let retryButton = buttons.retry {
            Button(retryButton.label, action: retry).buttonStyle(.dsButton(retryButton.gold ? .primary : .secondary))
        }
        Button(buttons.forward.label, action: forward).buttonStyle(.dsButton(buttons.forward.gold ? .primary : .secondary))
    }
    @ViewBuilder private var stats: some View {
        resultStat("\(result.rightReplies)/\(result.replies)", "replies right")
        resultStat(CallClock.format(seconds: seconds), "on the call")
        resultStat("\(result.replies - result.shortReplies)/\(result.replies)", "full sentences")
    }
    private func resultStat(_ value: String, _ label: String) -> some View {
        VStack(spacing: AlphonsoDS.Space.s1) { Text(value).dsText(.numeral); Text(label).dsText(.caption).foregroundStyle(ds.inkSoft) }
            .padding(AlphonsoDS.Space.s2)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
    }
}

/// A call that came back without a score (offline): the learner stays on the scene, is told why, and can try it again.
struct PracticeUnscoredView: View {
    let retry: () -> Void
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s4) {
            Spacer()
            Text(PracticeHub.unscoredNotice).dsText(.headline).multilineTextAlignment(.center).foregroundStyle(ds.ink)
            Button("Try again", action: retry).buttonStyle(.dsButton(.primary))
            Spacer()
        }
        .padding(AlphonsoDS.Space.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ds.surface)
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
    }
}

struct PracticeRoomThumbnail: View {
    let room: String
    var body: some View {
        Color.clear.frame(width: AlphonsoDS.Space.s12, height: AlphonsoDS.Space.s12)
            .overlay { if let art = LessonArt.room(room) { Image(uiImage: art).resizable().scaledToFill() } }
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key)).accessibilityHidden(true)
    }
}
