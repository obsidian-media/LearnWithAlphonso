import SwiftUI
import LearnWithAlphonsoKit

/// The approved web hub, with native navigation and scrolling at large text sizes.
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
    private var scenarios: [Scenario] { contentStore.scenarios(for: course) }
    private var campaigns: [Campaign] { contentStore.campaigns(for: course) }
    private var rows: [PracticeStarRow] { data?.stars ?? [] }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                    PracticePortrait(room: "coffee", expression: .talk)
                        .overlay(alignment: .topLeading) {
                            HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                                Text("Practice").dsText(.display).foregroundStyle(ds.onHero)
                                Spacer(minLength: CGFloat.zero)
                                if let data {
                                    let tally = PracticeHub.tally(data.stars, scenarios: scenarios, campaigns: campaigns)
                                    Label("\(tally.earned) / \(tally.total)", systemImage: "star.fill").dsText(.caption)
                                        .foregroundStyle(ds.xpText).padding(AlphonsoDS.Space.s2).background(ds.card, in: Capsule())
                                        .accessibilityLabel("\(tally.earned) of \(tally.total) stars earned")
                                }
                            }.padding(AlphonsoDS.Space.gutter)
                        }
                        .overlay(alignment: .topTrailing) {
                            if !dynamicTypeSize.isAccessibilitySize {
                                Text(greeting).dsText(.caption).foregroundStyle(ds.ink).padding(AlphonsoDS.Space.s3)
                                    .frame(maxWidth: AlphonsoDS.Space.s12 * 3)
                                    .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
                                    .padding(.top, AlphonsoDS.Space.s12 + AlphonsoDS.Space.s3).padding(.trailing, AlphonsoDS.Space.s2)
                            }
                        }
                    if dynamicTypeSize.isAccessibilitySize { Text(greeting).dsText(.headline) }
                    if let data {
                        if let pick = PracticeHub.today(data, scenarios: scenarios), let s = scenarios.first(where: { $0.id == pick.scenarioID }) {
                            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                                Text("Today's pick").dsText(.overline).foregroundStyle(ds.onHeroKick)
                                Text(s.title).dsText(.questionSmall)
                                PracticeStarsView(n: PracticeHub.stars(rows, kind: "scenario", key: s.id))
                                Text(pick.weakSpot.map { "A \(s.level.lowercased()) scene that makes you use \(PracticeHub.weakSpotName($0)), your top weak spot." } ?? "A \(s.level.lowercased()) scene to put what you know into words.").dsText(.footnote)
                                PracticeButton("Call Alphonso") { target = .scenario(s) }
                            }.padding(AlphonsoDS.Space.s4).foregroundStyle(ds.onHero)
                                .background(ds.hero, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
                        }
                        if let resume = PracticeHub.resume(rows, campaigns: campaigns), let c = campaigns.first(where: { $0.id == resume.campaignID }) {
                            practiceSectionLabel("Continue")
                            Button { target = .campaign(c, resume.sceneIndex) } label: {
                                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                                    Text(c.title).dsText(.title)
                                    Text("Scene \(resume.sceneIndex + 1) of \(c.scenes.count) · \(c.scenes[resume.sceneIndex].title)").dsText(.footnote)
                                    sceneStars(c)
                                }.padding(AlphonsoDS.Space.s4).frame(maxWidth: .infinity, alignment: .leading)
                                    .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                            }.buttonStyle(.plain)
                        }
                    } else if error {
                        Text("Could not load Practice.").dsText(.body)
                        Button("Try again") { Task { await load() } }
                    } else { ProgressView("Loading Practice…") }
                    practiceSectionLabel("Campaigns · \(campaigns.count) stories")
                    ForEach(campaigns) { c in
                        Button { target = .campaign(c, PracticeHub.nextScene(c, rows: rows)) } label: {
                            PracticePictureCard(room: PracticeHub.room(campaignID: c.id, sceneID: c.scenes[0].id), title: c.title, detail: "\(c.level) · Campaign · \(c.scenes.count) scenes", blurb: "") { sceneStars(c) }
                        }.buttonStyle(.plain)
                    }
                    // Hector keeps the same entitlement and paywall source rules as the previous Practice card.
                    if !entitlementStore.isPro {
                        Button { paywall = true } label: {
                            HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                                if let art = FirstRunArt.hector("hector-happy") {
                                    Image(uiImage: art).resizable().scaledToFit().frame(width: AlphonsoDS.Space.s12).accessibilityHidden(true)
                                }
                                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                                    Text(PaywallCopy.practiceCardTitle + " · Pro").dsText(.headline)
                                    Text(PaywallCopy.practiceCardSubtitle).dsText(.caption).foregroundStyle(ds.onHeroSoft)
                                }
                            }.padding(AlphonsoDS.Space.s4).frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(ds.onHero)
                                .background(ds.hero, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                        }.buttonStyle(.plain).accessibilityIdentifier("practiceHectorCard")
                    }
                    practiceSectionLabel("Scenarios")
                    ScrollView(.horizontal) {
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            ForEach(PracticeHub.levels, id: \.self) { l in
                                Button { level = l } label: {
                                    Text(l).dsText(.footnote).padding(AlphonsoDS.Space.s3)
                                        .background(level == l ? ds.choiceTint : ds.card, in: Capsule())
                                }.accessibilityAddTraits(level == l ? .isSelected : [])
                            }
                        }
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: AlphonsoDS.Space.s3), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2), alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                        ForEach(PracticeHub.filtered(scenarios, level: level)) { scenario in
                            Button { target = .scenario(scenario) } label: {
                                PracticePictureCard(room: scenario.id, title: scenario.title, detail: scenario.level, blurb: "", compact: true) {
                                    if data != nil { PracticeStarsView(n: PracticeHub.stars(rows, kind: "scenario", key: scenario.id)) }
                                }
                            }.buttonStyle(.plain)
                        }
                    }
                }.padding(AlphonsoDS.Space.gutter).environment(\.alphonsoDS, ds)
            }.background(ds.surface).foregroundStyle(ds.ink)
                .task { if !modeInitialized { chat = !(UserDefaults.standard.object(forKey: AvatarPreference.key) as? Bool ?? AvatarPreference.defaultValue); modeInitialized = true }; await load() }.refreshable { await load() }
                .sheet(item: $target) { t in
                    PracticePreCall(target: t, chat: $chat) { target = nil; playing = t }.environment(\.alphonsoDS, ds).environment(\.colorScheme, .light)
                }
                .sheet(isPresented: $paywall) { PaywallView(entitlementStore: entitlementStore, source: .practiceCard, onClose: { paywall = false }) }
                .navigationDestination(item: $playing) { t in
                    switch t {
                    case let .scenario(s): ConversationSessionView(scenario: s, course: course, session: session, conversationStore: conversationStore, chatMode: chat)
                    case let .campaign(c, i): CampaignSessionView(campaign: c, course: course, session: session, conversationStore: conversationStore, startScene: i, chatMode: chat)
                    }
                }
        }.onChange(of: playing == nil) { if playing == nil { Task { await load() } } }
    }
    @ViewBuilder private func sceneStars(_ c: Campaign) -> some View {
        if data != nil {
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                    ForEach(Array(c.scenes.enumerated()), id: \.element.id) { i, scene in
                        VStack(spacing: AlphonsoDS.Space.s1) {
                            PracticeRoomThumbnail(room: PracticeHub.room(campaignID: c.id, sceneID: scene.id))
                            PracticeStarsView(n: PracticeHub.stars(rows, kind: "scene", key: c.id + "/" + scene.id))
                        }.accessibilityElement(children: .combine).accessibilityLabel("Scene \(i + 1), \(scene.title), \(PracticeHub.starLabel(PracticeHub.stars(rows, kind: "scene", key: c.id + "/" + scene.id)))")
                    }
                }
            }
        }
    }
    private var greeting: String {
        switch course.wireCode {
        case "fr": return "On pratique un peu aujourd'hui ?\nShall we practise a bit today?"
        case "es": return "¿Practicamos un poco hoy?\nShall we practise a bit today?"
        default: return "Shall we practise a bit today?"
        }
    }
    private func load() async {
        do { data = try await practiceClient(session).practiceHub(course: course.wireCode); error = false }
        catch { error = true }
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
                Text("How to earn stars").dsText(.overline)
                ForEach(Array(PracticeHub.starRules.enumerated()), id: \.offset) { i, line in
                    HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                        PracticeStarsView(n: i + 1)
                        Text(line).dsText(.caption).fixedSize(horizontal: false, vertical: true)
                    }
                }
                Picker("How to practise", selection: $chat) {
                    Text("Call (speak)").tag(false)
                    Text("Chat (type)").tag(true)
                }.pickerStyle(.inline)
                PracticeButton(chat ? "Start the chat" : "Start the call", action: start)
            }.padding(AlphonsoDS.Space.gutter)
        }.background(ds.surface).foregroundStyle(ds.ink)
    }
}

struct PracticeStarsView: View {
    let n: Int
    var prominent = false
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        HStack(spacing: AlphonsoDS.Space.s1) {
            ForEach(0..<3) { i in Image(systemName: i < n ? "star.fill" : "star").foregroundStyle(i < n ? ds.xp : ds.inkFaint) }
        }.dsText(prominent ? .displayXL : .footnote).accessibilityElement(children: .ignore).accessibilityLabel(PracticeHub.starLabel(n))
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
struct PracticePortrait: View {
    let room: String
    let expression: LessonExpression
    var body: some View {
        Color.clear.frame(height: CGFloat(LessonStage.layout(viewportHeight: 0, prompt: "").roomHeight))
            .overlay {
                if let art = LessonArt.room(room) { Image(uiImage: art).resizable().scaledToFill() }
            }
            .overlay(alignment: .bottom) {
                if let art = LessonArt.expression(expression) { Image(uiImage: art).resizable().scaledToFit() }
            }.clipped().accessibilityHidden(true)
    }
}
struct PracticePictureCard<Footer: View>: View {
    let room: String
    let title: String
    let detail: String
    let blurb: String
    var compact = false
    @ViewBuilder let footer: () -> Footer
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Spacer(minLength: AlphonsoDS.Space.s12)
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text(detail).dsText(.overline).foregroundStyle(ds.onHeroKick)
                Text(title).dsText(compact ? .footnote : .questionSmall)
                if !blurb.isEmpty { Text(blurb).dsText(.footnote).foregroundStyle(ds.onHeroSoft) }
                footer()
            }.padding(AlphonsoDS.Space.s4).frame(maxWidth: .infinity, alignment: .leading).background(ds.hero)
        }.frame(maxWidth: .infinity, alignment: .leading).foregroundStyle(ds.onHero)
            .background {
                if let art = LessonArt.room(room) { Image(uiImage: art).resizable().scaledToFill() }
            }.clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble))
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
    let retry: () -> Void
    let nextLabel: String
    let done: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var ds: AlphonsoDS.Colors { AlphonsoDS.colors(AlphonsoThemeManager.shared.paletteID, night: false) }
    var body: some View {
        ScrollView {
            VStack(spacing: AlphonsoDS.Space.s4) {
                PracticePortrait(room: room, expression: result.stars >= 2 ? .happy : .neutral)
                PracticeStarsView(n: result.displayedStars, prominent: true)
                Text(result.headline(course: course)).dsText(.title)
                Text(result.hint + (result.bestBefore > 0 && result.bestAfter > result.bestBefore ? " A new best for this room." : "")).dsText(.footnote)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: AlphonsoDS.Space.s3) { stats }
                    VStack(spacing: AlphonsoDS.Space.s3) { stats }
                }
                if let slip = result.slipToShow(slip) {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        Text("Your slip").dsText(.caption)
                        Text(slip.said).strikethrough().foregroundStyle(ds.wrongInk)
                        Text("Alphonso: " + slip.reply).foregroundStyle(ds.rightInk)
                    }.dsText(.footnote).padding(AlphonsoDS.Space.s4).background(ds.card)
                }
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(spacing: AlphonsoDS.Space.s2) { resultActions }
                } else {
                    HStack(spacing: AlphonsoDS.Space.s2) { resultActions }
                }
            }.padding(AlphonsoDS.Space.gutter).environment(\.alphonsoDS, ds)
        }.background(ds.surface).foregroundStyle(ds.ink).toolbar(.hidden, for: .navigationBar).toolbar(.hidden, for: .tabBar)
    }
    @ViewBuilder private var resultActions: some View {
        PracticeButton(result.retryLabel, secondary: true, action: retry)
        PracticeButton(nextLabel, action: done)
    }
    @ViewBuilder private var stats: some View {
        stat("\(result.rightReplies)/\(result.replies)", "replies right")
        stat(CallClock.format(seconds: seconds), "on the call")
        stat("\(result.replies - result.shortReplies)/\(result.replies)", "full sentences")
    }
    private func stat(_ value: String, _ label: String) -> some View {
        VStack { Text(value).dsText(.numeral); Text(label).dsText(.caption) }.padding(AlphonsoDS.Space.s2).frame(maxWidth: .infinity).background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
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
