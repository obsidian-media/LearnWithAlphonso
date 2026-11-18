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
                    PracticePortrait(room: "coffee", expression: .talk)
                        .overlay(alignment: .topLeading) {
                            HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                                Text("Practice").dsText(.display).foregroundStyle(ds.onHero).lineLimit(1).minimumScaleFactor(0.5)
                                Spacer(minLength: CGFloat.zero)
                                if let data {
                                    let tally = PracticeHub.tally(data.stars, scenarios: scenarios, campaigns: campaigns)
                                    Label("\(tally.earned) / \(tally.total)", systemImage: "star.fill").dsText(.caption).lineLimit(1).minimumScaleFactor(0.6)
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
                    practiceSectionLabel("Say the picture")
                    Button { sayPicture = true } label: {
                        HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                            Image(systemName: "photo").dsText(.title).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                                Text("Say the picture").dsText(.headline)
                                Text("See a picture and say the word. A miss shows you the word and how it sounds.").dsText(.caption).foregroundStyle(ds.inkSoft)
                            }
                        }.padding(AlphonsoDS.Space.s4).frame(maxWidth: .infinity, alignment: .leading)
                            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                    }.buttonStyle(.plain).accessibilityIdentifier("practiceSayPictureCard")
                    practiceSectionLabel("Say it right")
                    Button { sayItRight = true } label: {
                        HStack(alignment: .top, spacing: AlphonsoDS.Space.s3) {
                            Image(systemName: "waveform").dsText(.title).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                                Text("Say it right").dsText(.headline)
                                Text("Hear a word you have learned, say it, and find out how clearly you were understood. A miss teaches, it never punishes.").dsText(.caption).foregroundStyle(ds.inkSoft)
                            }
                        }.padding(AlphonsoDS.Space.s4).frame(maxWidth: .infinity, alignment: .leading)
                            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control))
                    }.buttonStyle(.plain).accessibilityIdentifier("practiceSayItRightCard")
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
                // The picture is taller than the card and spills over its neighbours: it must not take their taps
                // (it covered Today's pick, so "Call Alphonso" did nothing).
                if let art = LessonArt.room(room) { Image(uiImage: art).resizable().scaledToFill().allowsHitTesting(false) }
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
