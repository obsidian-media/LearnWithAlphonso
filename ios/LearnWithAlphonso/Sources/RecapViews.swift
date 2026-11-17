import AVFoundation
import LearnWithAlphonsoKit
import SwiftUI

// The after-call recap (the result screen's "From this call") and What Alphonso remembers. Approved mock: r15-recap.
// The server decides who is Pro and what is kept; these views only show what it answered.

/// The result screen's recap. Starts when the result appears and never holds the screen up: while it is pending the
/// screen shows a placeholder, and when it is over (done, empty, failed, offline, timed out) the slip block takes the
/// slot back. A call too short for a recap is `.off` from the start.
@MainActor @Observable
final class CallRecapModel {
    enum Status { case off, pending, ready }
    enum Review { case idle, adding, added, failed }

    private(set) var status: Status = .off
    private(set) var recap: CallRecap?
    private(set) var review: Review = .idle
    private(set) var speaking: String?
    private var started = false
    /// True once a recap was asked for (even if it failed): the separate weakness analysis then stays quiet.
    var attempted: Bool { started }
    private var player: AVAudioPlayer?

    /// One attempt per call; calling again for the same model does nothing.
    func start(session: Session, callId: String, transcript: [ChatMessage], cefrLevel: String?, scene: String?) {
        guard !started, CallRecap.qualifies(transcript) else { return }
        started = true
        status = .pending
        Task {
            let client = practiceClient(session)
            let result = await client.callRecap(callId: callId, transcript: transcript, cefrLevel: cefrLevel, scene: scene)
            recap = result
            status = result == nil ? .off : .ready
        }
    }

    func addToReview(session: Session, callId: String) {
        guard let token = recap?.reviewToken, review == .idle || review == .failed else { return }
        review = .adding
        Task {
            let ok = await practiceClient(session).addRecapToReview(callId: callId, reviewToken: token)
            review = ok ? .added : .failed
        }
    }

    /// Plays just that phrase, in Alphonso's voice for the course (the same path and cost as any spoken line).
    func speak(_ text: String, session: Session, courseCode code: String) {
        player?.stop()
        speaking = text
        Task {
            defer { if speaking == text { speaking = nil } }
            let voice = VoicePrefsCache().voice(.alphonso, course: code)
            guard let data = try? await practiceClient(session).synthesizeSpeech(text: text, voice: voice, course: code, character: .alphonso),
                  let audio = try? AVAudioPlayer(data: data) else { return }
            player = audio
            audio.play()
            while audio.isPlaying { try? await Task.sleep(for: .milliseconds(150)) }
        }
    }

    func stop() { player?.stop(); speaking = nil }
}

private struct SpeakButton: View {
    let text: String
    let model: CallRecapModel
    let session: Session
    let courseCode: String
    var plain = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let on = model.speaking == text
        Button { model.speak(text, session: session, courseCode: courseCode) } label: {
            Image(systemName: "speaker.wave.2.fill").dsText(.headline)
                .foregroundStyle(on ? ds.onChoice : ds.choice)
                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                    .fill(on ? ds.choice : (plain ? ds.card : ds.choiceTint)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Hear: \(text)")
    }
}

/// "From this call": up to three corrections, one new phrase, Review these. Text only.
struct RecapCardView: View {
    let model: CallRecapModel
    let session: Session
    let callId: String
    let courseCode: String
    let onOpenMemory: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        switch model.status {
        case .off: EmptyView()
        case .pending: skeleton
        case .ready: if let recap = model.recap { card(recap) }
        }
    }

    private var skeleton: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            HStack {
                Text("From this call").dsText(.overline).foregroundStyle(ds.actionText)
                Spacer()
                Text("Alphonso is writing it up").dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            ForEach([0.72, 0.64, 0.58], id: \.self) { w in
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                    Capsule().fill(ds.sunk).frame(height: AlphonsoDS.Space.s2).scaleEffect(x: w, anchor: .leading)
                    Capsule().fill(ds.sunk).frame(height: AlphonsoDS.Space.s2)
                }
            }
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("From this call. Alphonso is writing it up.")
    }

    private func card(_ recap: CallRecap) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            VStack(spacing: 0) {
                HStack {
                    Text("From this call").dsText(.overline).foregroundStyle(ds.actionText)
                    Spacer()
                    Text("Tap the speaker to hear it").dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                .padding(AlphonsoDS.Space.s3)
                ForEach(recap.corrections) { c in
                    Divider().overlay(ds.line)
                    HStack(spacing: AlphonsoDS.Space.s3) {
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                            Text(c.said).strikethrough().dsText(.footnote).foregroundStyle(ds.wrongInk)
                            Text(c.fixed).dsText(.headline).foregroundStyle(ds.rightInk)
                            Text(c.why).dsText(.caption).foregroundStyle(ds.inkSoft)
                        }
                        Spacer(minLength: 0)
                        SpeakButton(text: c.fixed, model: model, session: session, courseCode: courseCode)
                    }
                    .padding(AlphonsoDS.Space.s3)
                    .accessibilityElement(children: .contain)
                }
                if let phrase = recap.phrase {
                    Divider().overlay(ds.line)
                    HStack(spacing: AlphonsoDS.Space.s3) {
                        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                            Text("New phrase").dsText(.overline).foregroundStyle(ds.actionText)
                            Text(phrase.text).dsText(.headline).foregroundStyle(ds.ink)
                            Text(phrase.meaning).dsText(.caption).foregroundStyle(ds.inkSoft)
                        }
                        Spacer(minLength: 0)
                        SpeakButton(text: phrase.text, model: model, session: session, courseCode: courseCode, plain: true)
                    }
                    .padding(AlphonsoDS.Space.s3)
                    .background(ds.actionTint)
                }
                if recap.reviewToken != nil {
                    Divider().overlay(ds.line)
                    reviewRow(recap)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
            if recap.saved {
                Button(action: onOpenMemory) {
                    Label { Text("Saved in What Alphonso remembers").underline() } icon: { Image(systemName: "lock.fill") }
                        .dsText(.caption).foregroundStyle(ds.choice)
                }
                .frame(minHeight: AlphonsoDS.Space.minTouch)
            }
        }
    }

    @ViewBuilder private func reviewRow(_ recap: CallRecap) -> some View {
        switch model.review {
        case .added:
            Label("Added to your review", systemImage: "checkmark").dsText(.headline).foregroundStyle(ds.rightInk)
                .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                .accessibilityAddTraits(.isStaticText)
        default:
            VStack(spacing: 0) {
                Button { model.addToReview(session: session, callId: callId) } label: {
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        Image(systemName: "plus")
                        Text("Review these")
                        Text("\(recap.reviewCount)").dsText(.caption).foregroundStyle(ds.choice)
                            .padding(.horizontal, AlphonsoDS.Space.s2)
                            .background(Capsule().fill(ds.choiceTint))
                    }
                    .dsText(.headline).foregroundStyle(ds.choice)
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                }
                .disabled(model.review == .adding)
                if model.review == .failed {
                    Text("Could not add these. Try again.").dsText(.caption).foregroundStyle(ds.wrongInk)
                        .padding(.bottom, AlphonsoDS.Space.s2)
                }
            }
        }
    }
}

// MARK: What Alphonso remembers

@MainActor @Observable
final class TutorMemoryModel {
    enum Phase { case loading, ready(TutorMemory), locked, failed }
    private(set) var phase: Phase = .loading
    private(set) var busy = false
    private(set) var speaking: String?
    private var player: AVAudioPlayer?

    func load(session: Session) async {
        let client = practiceClient(session)
        switch await client.tutorMemory() {
        case .ready(let memory): phase = .ready(memory)
        case .failed: phase = .failed
        case .locked: phase = .locked
        }
    }

    func removeLine(_ id: String, session: Session) async {
        await run(session) { await $0.removeMemoryLine(id: id) }
    }

    func removeGoal(_ key: TutorMemory.GoalLine.Key, session: Session) async {
        await run(session) { await $0.saveGoalPatch(["clear": [key.rawValue]]) }
    }

    func addGoal(_ patch: [String: Any], session: Session) async {
        await run(session) { await $0.saveGoalPatch(patch) }
    }

    func forgetAll(session: Session) async {
        await run(session) { await $0.forgetEverything() }
    }

    func speak(_ text: String, session: Session, courseCode code: String) {
        player?.stop()
        speaking = text
        Task {
            defer { if speaking == text { speaking = nil } }
            let voice = VoicePrefsCache().voice(.alphonso, course: code)
            guard let data = try? await practiceClient(session).synthesizeSpeech(text: text, voice: voice, course: code, character: .alphonso),
                  let audio = try? AVAudioPlayer(data: data) else { return }
            player = audio
            audio.play()
            while audio.isPlaying { try? await Task.sleep(for: .milliseconds(150)) }
        }
    }

    private func run(_ session: Session, _ action: (AIConversationClient) async -> Bool) async {
        busy = true
        _ = await action(practiceClient(session))
        await load(session: session)
        busy = false
    }
}

struct TutorMemoryView: View {
    let session: Session
    let course: Course
    /// The locked page is built only from the learner's own data: their weak spots and first-run answers.
    @State private var weakSpots: [String] = []
    @State private var goalsNoteLoaded: String?
    /// Opens the subscription screen from the locked page's "Try Alphonso Pro".
    let onUpgrade: () -> Void
    @State private var model = TutorMemoryModel()
    @State private var confirmForget = false
    @State private var adding = false
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                switch model.phase {
                case .loading:
                    ProgressView().frame(maxWidth: .infinity).padding(.top, AlphonsoDS.Space.s12)
                case .failed:
                    VStack(spacing: AlphonsoDS.Space.s3) {
                        Text("This did not load.").dsText(.headline).foregroundStyle(ds.ink)
                        Button("Try again") { Task { await model.load(session: session) } }.buttonStyle(.dsButton(.primary))
                    }.frame(maxWidth: .infinity).padding(.top, AlphonsoDS.Space.s12)
                case .locked:
                    lockedBody
                case .ready(let memory):
                    readyBody(memory)
                }
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .background(ds.surface)
        .navigationTitle("What Alphonso remembers")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(session: session) }
        .task {
            goalsNoteLoaded = await practiceClient(session).goalsNote()
            guard let token = await session.freshAccessToken(), let userID = session.userID,
                  let data = try? await ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
                    .fetchProfileOverview(userID: userID, course: course.wireCode) else { return }
            weakSpots = Array(ProfileMath.weakSpots(data.weakItems).top.prefix(2).map(\.display))
        }
        .sheet(isPresented: $adding) {
            if case .ready(let memory) = model.phase { addGoalSheet(memory) }
        }
        .alert("Forget everything?", isPresented: $confirmForget) {
            Button("Forget everything", role: .destructive) { Task { await model.forgetAll(session: session) } }
            Button("Keep them", role: .cancel) {}
        } message: {
            Text("Alphonso will forget everything on this page. Phrases also leave your review. This cannot be undone.")
        }
    }

    private func hero(_ line: String) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text("What Alphonso remembers").dsText(.title).foregroundStyle(ds.onHero)
            Text(line).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
        }
        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 * 3, alignment: .topLeading)
        .padding(AlphonsoDS.Space.s4)
        .padding(.trailing, AlphonsoDS.Space.s12 * 2)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
        .overlay(alignment: .bottomTrailing) {
            if let art = LessonArt.expression(.happy) {
                Image(uiImage: art).resizable().scaledToFit().frame(width: AlphonsoDS.Space.s12 * 2.5).accessibilityHidden(true)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))
    }

    private func row(icon: String, tint: Color, ink: Color, title: String, note: String, trailing: some View) -> some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            Image(systemName: icon).dsText(.headline).foregroundStyle(ink)
                .frame(width: AlphonsoDS.Space.s8, height: AlphonsoDS.Space.s8)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).fill(tint))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                Text(title).dsText(.footnote).fontWeight(.bold).foregroundStyle(ds.ink)
                Text(note).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            Spacer(minLength: 0)
            trailing
        }
        .padding(AlphonsoDS.Space.s2)
        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
    }

    private func removeButton(_ label: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "xmark").dsText(.headline).foregroundStyle(ds.inkSoft)
                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
        }
        .buttonStyle(.plain)
        .disabled(model.busy)
        .accessibilityLabel(label)
    }

    private func sectionHead(_ title: String, _ count: Int) -> some View {
        HStack {
            Text(title).dsText(.headline).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
            Spacer()
            Text("\(count)").dsText(.caption).foregroundStyle(ds.choice)
        }.padding(.top, AlphonsoDS.Space.s2)
    }

    @ViewBuilder private func readyBody(_ memory: TutorMemory) -> some View {
        hero(memory.isEmpty
            ? "Alphonso keeps short notes from your calls here."
            : "\(memory.summary) Alphonso uses these notes to plan your next calls. Remove a line and it is gone.")
        if !memory.mistakes.isEmpty {
            sectionHead("Mistakes he keeps seeing", memory.mistakes.count)
            ForEach(memory.mistakes) { m in
                row(icon: "xmark.circle", tint: ds.wrongTint, ink: ds.wrongInk, title: m.label, note: m.note(),
                    trailing: removeButton("Remove \(m.label)") { Task { await model.removeLine(m.id, session: session) } })
            }
        }
        if !memory.phrases.isEmpty {
            sectionHead("Phrases you are learning", memory.phrases.count)
            ForEach(memory.phrases) { p in
                row(icon: "text.book.closed", tint: ds.actionTint, ink: ds.actionText, title: p.text, note: p.meaning,
                    trailing: HStack(spacing: 0) {
                        Button { model.speak(p.text, session: session, courseCode: course.wireCode) } label: {
                            Image(systemName: "speaker.wave.2.fill").dsText(.headline).foregroundStyle(ds.choice)
                                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.choiceTint))
                        }.buttonStyle(.plain).accessibilityLabel("Hear: \(p.text)")
                        removeButton("Remove \(p.text)") { Task { await model.removeLine(p.id, session: session) } }
                    })
            }
        }
        let lines = memory.goalLines
        if !lines.isEmpty {
            sectionHead("Goals you told him", lines.count)
            ForEach(lines) { g in
                row(icon: "scope", tint: ds.choiceTint, ink: ds.choice, title: g.title, note: g.note,
                    trailing: removeButton("Remove \(g.title)") { Task { await model.removeGoal(g.key, session: session) } })
            }
        }
        if memory.isEmpty {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text("Nothing here yet.").dsText(.headline).foregroundStyle(ds.ink)
                Text("After a few calls, Alphonso will list the mistakes he keeps seeing and the phrases you are learning. Your goals from when you started show here too.")
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            .padding(AlphonsoDS.Space.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                .strokeBorder(ds.line, style: StrokeStyle(lineWidth: 2, dash: [6, 4])))
        }
        if memory.goals.goal == nil || memory.goals.dailyMinutes == nil || memory.goals.interests.count < TutorMemory.interestChoices.count {
            Button { adding = true } label: { Label("Add a goal", systemImage: "plus").dsText(.headline).foregroundStyle(ds.choice) }
                .frame(minHeight: AlphonsoDS.Space.minTouch)
        }
        if !memory.isEmpty {
            Button("Forget everything") { confirmForget = true }
                .buttonStyle(.dsButton(.danger)).disabled(model.busy)
            Text("Removes everything on this page from your account. Your lessons, stars, streak and XP stay.")
                .dsText(.caption).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center).frame(maxWidth: .infinity)
        }
    }

    @ViewBuilder private var lockedBody: some View {
        hero("With Pro, Alphonso keeps notes between calls and you can read, fix and delete every line.")
        Text("He could remember").dsText(.headline).foregroundStyle(ds.ink).padding(.top, AlphonsoDS.Space.s2)
        ForEach(weakSpots, id: \.self) { w in
            row(icon: "xmark.circle", tint: ds.wrongTint, ink: ds.wrongInk, title: w, note: "From your weak spots",
                trailing: Image(systemName: "lock").dsText(.headline).foregroundStyle(ds.inkFaint).padding(.trailing, AlphonsoDS.Space.s2))
        }
        row(icon: "text.book.closed", tint: ds.actionTint, ink: ds.actionText, title: "Phrases from your calls", note: "Tap one to hear it again",
            trailing: Image(systemName: "lock").dsText(.headline).foregroundStyle(ds.inkFaint).padding(.trailing, AlphonsoDS.Space.s2))
        if let note = goalsNoteLoaded {
            row(icon: "scope", tint: ds.choiceTint, ink: ds.choice, title: "Goals you told him", note: note,
                trailing: Image(systemName: "lock").dsText(.headline).foregroundStyle(ds.inkFaint).padding(.trailing, AlphonsoDS.Space.s2))
        }
        Button("Try Alphonso Pro", action: onUpgrade).buttonStyle(.dsButton(.primary)).padding(.top, AlphonsoDS.Space.s2)
        Button("Not now") { dismiss() }.dsText(.headline).foregroundStyle(ds.choice)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
        Text("Your call recap stays free. You can download or delete your data any time in Settings.")
            .dsText(.caption).foregroundStyle(ds.inkSoft).multilineTextAlignment(.center).frame(maxWidth: .infinity)
    }

    private func addGoalSheet(_ memory: TutorMemory) -> some View {
        NavigationStack {
            List {
                if memory.goals.goal == nil {
                    Section("Why you are learning") {
                        ForEach(TutorMemory.goalChoices, id: \.self) { id in
                            Button(TutorMemory.goalLabels[id] ?? id) { add(["goal": id]) }
                        }
                    }
                }
                if memory.goals.dailyMinutes == nil {
                    Section("Time each day") {
                        ForEach(TutorMemory.dailyMinuteChoices, id: \.self) { m in
                            Button("\(m) minutes a day") { add(["dailyMinutes": m]) }
                        }
                    }
                }
                let more = TutorMemory.interestChoices.filter { !memory.goals.interests.contains($0) }
                if !more.isEmpty {
                    Section("Topics you like") {
                        ForEach(more, id: \.self) { id in
                            Button(TutorMemory.interestLabels[id] ?? id) { add(["interests": memory.goals.interests + [id]]) }
                        }
                    }
                }
            }
            .navigationTitle("Add a goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { adding = false } } }
        }
    }

    private func add(_ patch: [String: Any]) {
        adding = false
        Task { await model.addGoal(patch, session: session) }
    }
}

// MARK: Settings

/// The "What Alphonso remembers" row in Settings: Pro learners open their notes, everyone else the locked page.
struct MemorySettingsRow: View {
    let session: Session
    let course: Course
    let onUpgrade: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard(spacing: AlphonsoDS.Space.s1) {
            SettingsNavLabel(title: "What Alphonso remembers", subtitle: "Pro. Read, fix and delete his notes.")
                .background(NavigationLink("What Alphonso remembers") {
                    TutorMemoryView(session: session, course: course, onUpgrade: onUpgrade)
                }.opacity(0).accessibilityHidden(true))
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
        }
    }
}

/// For every learner, free or Pro: delete the topic labels recorded after calls (no sentences). Plain copy, two steps.
struct TopicNotesSettingsCard: View {
    let session: Session
    private enum Phase { case idle, asking, busy, done, failed }
    @State private var phase: Phase = .idle
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        DSCard(spacing: AlphonsoDS.Space.s2) {
            Text("Mistake topics").dsText(.headline).foregroundStyle(ds.ink)
            Text("After a call, Alphonso notes the kind of mistake you made, for example \"past tense\". No sentences are kept in these notes. You can delete them any time. Your lessons, stars, streak and XP stay.")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
            if phase == .asking || phase == .busy {
                Text("Delete all your mistake topics? This cannot be undone.").dsText(.footnote).fontWeight(.bold).foregroundStyle(ds.ink)
                Button("Delete mistake topics") {
                    phase = .busy
                    Task { phase = await practiceClient(session).forgetTopicNotes() ? .done : .failed }
                }
                .buttonStyle(.dsButton(.danger)).disabled(phase == .busy)
                Button("Keep them") { phase = .idle }.buttonStyle(.dsButton(.secondary))
            } else {
                Button("Delete mistake topics") { phase = .asking }.buttonStyle(.dsButton(.secondary))
            }
            if phase == .done { Text("Deleted.").dsText(.footnote).foregroundStyle(ds.rightInk) }
            if phase == .failed { Text("Could not delete them. Try again.").dsText(.footnote).foregroundStyle(ds.wrongInk) }
        }
    }
}

/// Builds the subscription screen for a sheet; the Practice hub supplies it, so the call screens never touch Pro rules.
typealias UpgradeViewBuilder = (_ close: @escaping () -> Void) -> AnyView

/// What Alphonso remembers as a sheet over a result screen: its "Try Alphonso Pro" opens the subscription screen.
struct MemorySheetHost: View {
    let session: Session
    let course: Course
    let upgradeView: UpgradeViewBuilder?
    let close: () -> Void
    @State private var showUpgrade = false

    var body: some View {
        NavigationStack {
            TutorMemoryView(session: session, course: course, onUpgrade: { if upgradeView != nil { showUpgrade = true } else { close() } })
        }
        .sheet(isPresented: $showUpgrade) {
            if let upgradeView { upgradeView { showUpgrade = false } }
        }
    }
}
