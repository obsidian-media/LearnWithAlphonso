import SwiftUI
import LearnWithAlphonsoKit

/// After sign-in, never before (the web's AfterSignIn.tsx): the profile picture, "how did you hear about me"
/// (skippable), then Meet Hector with a trial line read from the store's introductory offer and a clear Not now.
struct AfterSignInView: View {
    enum Step { case avatar, heard, hector }

    let session: Session
    let entitlementStore: EntitlementStore
    let name: String
    let course: String
    let interests: [String]
    /// The account's current avatar seed.
    let avatarSeed: String
    let onFinish: (FirstRun.FinishTarget) -> Void

    @State private var step: Step = .avatar
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            switch step {
            case .avatar:
                FirstRunAvatarStep(session: session, name: name, seed: avatarSeed) { step = .heard }
            case .heard:
                FirstRunHeardStep(session: session, course: course) { step = .hector }
            case .hector:
                MeetHectorView(entitlementStore: entitlementStore, name: name, course: course, interests: interests,
                               onFinish: onFinish)
            }
        }
        .transition(.opacity)
        .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select), value: step)
    }
}

// MARK: - Picture

struct FirstRunAvatarStep: View {
    let session: Session
    let name: String
    let seed: String
    let onDone: () -> Void

    @State private var value: String
    @State private var busy = false
    @State private var error: String?
    @Environment(\.alphonsoDS) private var ds

    init(session: Session, name: String, seed: String, onDone: @escaping () -> Void) {
        self.session = session
        self.name = name
        self.seed = seed
        self.onDone = onDone
        _value = State(initialValue: seed)
    }

    private var title: String { name.isEmpty ? "Pick your picture." : "Pick your picture, \(name)." }

    var body: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: "room-light", figure: LessonArt.expression(.happy), figureLabel: "Alphonso, smiling") { EmptyView() }
            FirstRunBubble(title: title, sub: "Your friends and leaderboards show it. Change it any time in Profile.") {
                FirstRunVoice.speak(title)
            }
        } content: {
            VStack(spacing: AlphonsoDS.Space.s3) {
                AvatarPickerGrid(value: value, name: name, initialsSeed: ProfileAvatars.initialsSeed(current: seed)) { value = $0 }
                if let error {
                    Text(error).dsText(.footnote).foregroundStyle(ds.wrongInk).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.s5)
            .padding(.top, AlphonsoDS.Space.s5)
        } footer: {
            FirstRunFooter(label: busy ? "Saving\u{2026}" : "Continue", disabled: busy,
                           secondary: (label: "Keep my initial", action: onDone)) {
                Task { await save() }
            }
        }
    }

    private func save() async {
        if value == seed { return onDone() }
        guard ProfileAvatars.isAllowedSeed(value), let token = await session.freshAccessToken(), let userID = session.userID else {
            error = "Couldn't save your picture. Try again, or keep your initial for now."
            return
        }
        busy = true
        error = nil
        defer { busy = false }
        let client = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        do {
            try await client.updateProfileAvatarSeed(value, userID: userID)
            onDone()
        } catch {
            self.error = "Couldn't save your picture. Try again, or keep your initial for now."
        }
    }
}

// MARK: - How did you hear

struct FirstRunHeardStep: View {
    let session: Session
    let course: String
    let onDone: () -> Void

    @State private var picked: String?
    @State private var busy = false
    private let title = "One last thing: how did you hear about me?"

    var body: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: FirstRun.room(course: course, goal: nil), figure: LessonArt.expression(.neutral),
                         figureLabel: "Alphonso, listening") {
                FirstRunHUD(showCounter: false, onSkip: onDone)
            }
            FirstRunBubble(title: title) { FirstRunVoice.speak(title) }
        } content: {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(FirstRun.heardChoices, id: \.id) { choice in
                    FirstRunChoiceTile(icon: choice.icon, label: choice.label, selected: picked == choice.id) { picked = choice.id }
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: picked == nil || busy) {
                guard let picked else { return }
                busy = true
                Task {
                    // Optional and only for us: never hold the learner up over it.
                    try? await learnerProfileClient(session)?.save(LearnerAnswers(heardFrom: picked))
                    onDone()
                }
            }
        }
    }
}

/// The checked server save for this account, or nil when signed out.
@MainActor
func learnerProfileClient(_ session: Session) async -> LearnerProfileClient? {
    guard let token = await session.freshAccessToken() else { return nil }
    return LearnerProfileClient(
        baseURL: AppConfig.apiBaseURL, accessToken: { token },
        refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
}

// MARK: - Meet Hector

/// Hector, his three promises, and the trial line only when the store offers THIS learner a free trial.
struct MeetHectorView: View {
    let entitlementStore: EntitlementStore
    let name: String
    let course: String
    let interests: [String]
    /// DEBUG harness only (a stand-in offer for a screenshot); nil everywhere else.
    var trialDaysOverride: Int?
    let onFinish: (FirstRun.FinishTarget) -> Void

    @Environment(\.alphonsoDS) private var ds

    private var title: String { "\(FirstRun.greeting(course: course, name: name)) I'm Hector." }
    /// From StoreKit's introductory offer through RevenueCat (eligibility checked); nil hides the line.
    private var trialDays: Int? { trialDaysOverride ?? FirstRun.trialDays(from: entitlementStore.state.load) }

    var body: some View {
        let trial = FirstRun.trialLine(days: trialDays)
        FirstRunScreen {
            FirstRunRoom(roomID: "hotel", figure: FirstRunArt.hector("hector-talk"),
                         figureLabel: "Hector, Alphonso's friend and tutor", size: .hero) {
                Text("Meet your tutor")
                    .dsText(.overline)
                    .foregroundStyle(ds.onAction)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.vertical, AlphonsoDS.Space.s1)
                    .background(Capsule().fill(ds.action))
                    .frame(maxWidth: .infinity)
            }
            FirstRunBubble(title: title, sub: "When you want to really talk, call me. I remember what you find hard.",
                           playLabel: "Hear Hector") { FirstRunVoice.speak(title) }
        } content: {
            VStack(spacing: 10) {
                benefit("chat", "Real conversations", FirstRun.hectorTopics(interests))
                benefit("brain", "He remembers you", "Your level and your weak spots")
                benefit("heartc", "Kind corrections", "One fix at a time, never a lecture")
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: FirstRun.hectorButton(hasTrial: trial != nil), note: trial,
                           secondary: (label: "Not now", action: { onFinish(.lesson) })) {
                onFinish(.hector)
            }
        }
        .task { await entitlementStore.loadOffering() }
    }

    private func benefit(_ icon: String, _ title: String, _ sub: String) -> some View {
        HStack(spacing: AlphonsoDS.Space.s3) {
            FirstRunSymbol(name: icon, size: 22)
                .foregroundStyle(ds.xpText)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(ds.xpTint))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).dsText(.headline).foregroundStyle(ds.brand)
                Text(sub).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Right after sign-in

/// Right after sign-in from the first run (the web's /hello): the answers kept on this device are saved to the
/// account once, then the picture, how you heard about us, and Meet Hector.
struct FirstRunHelloView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    let answers: LearnerAnswers
    let store: FirstRunStore
    let onFinish: (FirstRun.Destination) -> Void
    let placementTaken: () async -> Bool

    private enum Phase { case saving, failed, ready(String) }
    @State private var phase: Phase = .saving
    @State private var started = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Group {
            switch phase {
            case .ready(let seed):
                AfterSignInView(session: session, entitlementStore: entitlementStore, name: answers.name ?? "",
                                course: answers.course ?? "en", interests: answers.interests ?? [], avatarSeed: seed) { target in
                    Task { onFinish(FirstRun.destination(target, level: answers.level, placementTaken: await placementTaken())) }
                }
            case .saving, .failed:
                FirstRunScreen {
                    Color.clear.frame(height: AlphonsoDS.Space.s12 * 3)
                } content: {
                    VStack(spacing: AlphonsoDS.Space.s2) {
                        Text(isFailed ? "Your plan didn't save" : "Saving your plan\u{2026}")
                            .dsText(.title).foregroundStyle(ds.brand)
                        if isFailed {
                            Text("Your answers are still on this device. Check your connection and try again.")
                                .dsText(.body).foregroundStyle(ds.inkSoft)
                        }
                    }
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, AlphonsoDS.Space.s6)
                } footer: {
                    if isFailed { FirstRunFooter(label: "Try again") { Task { await save() } } }
                }
            }
        }
        .task {
            guard !started else { return }
            started = true
            await save()
        }
    }

    private var isFailed: Bool { if case .failed = phase { return true } else { return false } }

    private func save() async {
        phase = .saving
        do {
            guard let client = await learnerProfileClient(session) else { throw LearnerProfileError.notSignedIn }
            try await client.save(answers, mark: .completed)
            store.clearDraft()
            var seed = "a"
            if let token = session.accessToken, let userID = session.userID {
                let profiles = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
                seed = (try? await profiles.fetchProfileIdentity(userID: userID))?.avatarSeed ?? "a"
            }
            phase = .ready(seed)
        } catch {
            phase = .failed
        }
    }
}

// MARK: - Complete your profile

/// "Complete your profile": the first run once more for learners who signed up before it existed (or from Settings,
/// to change the answers), skipping the course and sign-in. Not now ends it for good.
struct CompleteProfileView: View {
    let session: Session
    let entitlementStore: EntitlementStore
    let contentStore: ContentStore
    let course: Course
    /// Opened from Settings to change the answers: Not now writes nothing, and the end returns to Settings.
    var edit = false
    let store: FirstRunStore
    let onFinish: (FirstRun.Destination?) -> Void
    let onBlocked: () -> Void
    let onUnder13Ok: () -> Void
    let placementTaken: () async -> Bool

    private struct Loaded { let prefill: LearnerAnswers; let avatarSeed: String }
    @State private var loaded: Loaded?
    @State private var saved: LearnerAnswers?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Group {
            if let saved, let loaded {
                AfterSignInView(session: session, entitlementStore: entitlementStore, name: saved.name ?? "",
                                course: course.wireCode, interests: saved.interests ?? [], avatarSeed: loaded.avatarSeed) { target in
                    Task {
                        if edit && target == .lesson { return onFinish(nil) }
                        onFinish(FirstRun.destination(target, level: saved.level, placementTaken: await placementTaken()))
                    }
                }
            } else if let loaded {
                FirstRunFlowView(
                    mode: .complete, store: store, contentStore: contentStore, prefill: loaded.prefill, course: course.wireCode,
                    onExit: { Task { await notNow() } },
                    onBlocked: onBlocked,
                    onUnder13Ok: onUnder13Ok,
                    onSave: { draft in try await save(draft) })
            } else {
                ds.surface.ignoresSafeArea()
                    .overlay { ProgressView().accessibilityLabel("Loading your answers") }
            }
        }
        .task { await load() }
    }

    private func load() async {
        guard loaded == nil, let token = await session.freshAccessToken(), let userID = session.userID else { return }
        let profiles = ProgressSyncClient(supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: token)
        async let profile = (try? await learnerProfileClient(session)?.fetch()) ?? LearnerProfile()
        async let identity = try? profiles.fetchProfileIdentity(userID: userID)
        async let country = try? profiles.fetchProfileCountry(userID: userID)
        let (p, i, c) = await (profile, identity, country)
        loaded = Loaded(
            prefill: FirstRun.completeProfilePrefill(profile: p, displayName: i?.displayName, leaderboardCountry: c),
            avatarSeed: i?.avatarSeed ?? "a")
    }

    private func notNow() async {
        if !edit {
            // Skipped for this launch even if the save below fails, so the gate cannot loop back here.
            CompleteProfileSkip.skipThisLaunch()
            _ = try? await learnerProfileClient(session)?.save(LearnerAnswers(), mark: .dismissed)
        }
        onFinish(nil)
    }

    private func save(_ draft: LearnerAnswers) async throws {
        var withCourse = draft
        withCourse.course = course.wireCode
        let patch = FirstRun.cleanAnswers(withCourse) ?? LearnerAnswers()
        guard let client = await learnerProfileClient(session) else { throw FirstRunSaveError(message: "Couldn't save. Try again.") }
        do {
            try await client.save(patch, mark: .completed)
        } catch LearnerProfileError.failed(let message?) {
            throw FirstRunSaveError(message: message)
        } catch {
            throw FirstRunSaveError(message: "Couldn't save. Try again.")
        }
        store.clearDraft()
        saved = draft
    }
}
