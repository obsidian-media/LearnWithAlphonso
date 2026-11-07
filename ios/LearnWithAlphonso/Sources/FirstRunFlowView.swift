import SwiftUI
import AuthenticationServices
import LearnWithAlphonsoKit

/// The first run (visual round 6, part 3), the web's src/components/firstrun/FirstRunFlow.tsx on iOS: the counted
/// questions, the two-question first taste, the plan from the real first units, then sign-in (new learners only).
/// Every answer stays on this device (Kit FirstRunStore) until the account exists. "Complete your profile" is the same
/// flow without the course and sign-in, saving to the account at the plan.
///
/// Under 13 (Kit FirstRun.chooseAge): the answers are wiped, the device is blocked in the Keychain, and the kind stop
/// screen replaces the flow. `onBlocked` lets the caller silence everything that could send (crash reporting).
struct FirstRunFlowView: View {
    enum Stage: Hashable {
        case question(FirstRun.QuestionStep)
        case taste, plan, signIn
    }

    let mode: FirstRun.Mode
    let store: FirstRunStore
    let contentStore: ContentStore
    /// Complete your profile: the answers already on the account, and the course being studied.
    var prefill: LearnerAnswers = LearnerAnswers()
    var course: String?
    /// Leaving from the first screen (new: to sign in; complete: Not now).
    let onExit: () -> Void
    let onBlocked: () -> Void
    let onUnder13Ok: () -> Void
    /// New learners: the sign-in screen.
    var session: Session?
    var onEmail: () -> Void = {}
    var onHaveAccount: () -> Void = {}
    /// Complete your profile: "Save my plan". Throws a message to show.
    var onSave: (LearnerAnswers) async throws -> Void = { _ in }
    /// The step to open on (a DEBUG screenshot harness); 0 everywhere else.
    var startIndex = 0

    @State private var blocked = false
    @State private var draft = LearnerAnswers()
    @State private var index = 0
    @State private var started = false
    @State private var picker: PickerKind?
    @State private var agePicked: AgeChoice?
    @State private var tasteIndex = 0
    @State private var tastePicked: Int?
    @State private var tasteChecked = false
    @State private var saving = false
    @State private var saveError: String?

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum PickerKind: String, Identifiable {
        case language, country
        var id: String { rawValue }
    }

    private var questions: [FirstRun.QuestionStep] { FirstRun.questionSteps(mode) }
    private var stages: [Stage] { questions.map(Stage.question) + [.taste, .plan] + (mode == .new ? [.signIn] : []) }
    private var stage: Stage { stages[min(index, stages.count - 1)] }
    private var currentCourse: String { draft.course ?? course ?? "en" }
    private var courseName: String { FirstRun.courseName(currentCourse) }
    private var name: String { draft.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "" }
    private var room: String { FirstRun.room(course: draft.course, goal: draft.goal) }

    var body: some View {
        Group {
            if blocked {
                Under13StopView(onOk: onUnder13Ok)
            } else {
                stageView
                    .id(stage)
                    .transition(reduceMotion ? .opacity : .asymmetric(insertion: .move(edge: .trailing), removal: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: AlphonsoDS.Motion.select), value: index)
        .onAppear {
            guard !started else { return }
            started = true
            blocked = store.isBlocked()
            var start = prefill
            if let course { start.course = course }
            draft = merge(start, store.readDraft())
            index = min(startIndex, stages.count - 1)
        }
        .onChange(of: index) {
            // Another path may have hit the block: check again on every step.
            if store.isBlocked() { blocked = true }
            FirstRunVoice.stop()
        }
        .sheet(item: $picker) { kind in pickerSheet(kind) }
    }

    // MARK: Steps

    @ViewBuilder private var stageView: some View {
        switch stage {
        case .question(.name): nameStep
        case .question(.course): courseStep
        case .question(.about): aboutStep
        case .question(.goal): goalStep
        case .question(.level): levelStep
        case .question(.time): timeStep
        case .question(.age): ageStep
        case .question(.interests): interestsStep
        case .taste: tasteStep
        case .plan: planStep
        case .signIn: signInStep
        }
    }

    private var nameStep: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: "room-light", figure: LessonArt.expression(.talk), figureLabel: "Alphonso, waving hello", size: .tall) {
                hud(skip: { update { $0.name = nil }; next() })
            }
            bubble("Hi, I'm Alphonso! What should I call you?", sub: "Just your first name.")
        } content: {
            FirstRunNameField(text: Binding(
                get: { draft.name ?? "" },
                set: { value in update { $0.name = String(value.prefix(40)) } }))
                .padding(.horizontal, AlphonsoDS.Space.gutter)
                .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Nice to meet you", disabled: name.isEmpty, action: next)
        }
    }

    private var courseStep: some View {
        let picked = draft.course
        let title = picked.map { "\(FirstRun.greeting(course: $0, name: name)) \(FirstRun.courseName($0)) it is." }
            ?? "What do you want to learn?"
        return FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(picked == nil ? .talk : .happy), figureLabel: "Alphonso",
                         chip: picked.map { "Now in \(FirstRun.courseName($0))" }) { hud() }
            bubble(title, sub: "Pick the language you want to learn.")
        } content: {
            VStack(spacing: 10) {
                ForEach(FirstRun.courseOrder, id: \.self) { c in
                    FirstRunChoiceRow(label: FirstRun.courseName(c), selected: picked == c, action: { update { $0.course = c } }) {
                        FirstRunCourseFlag(course: c)
                    }
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: picked == nil, action: next)
        }
    }

    private var aboutStep: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(.neutral), figureLabel: "Alphonso, listening") { hud() }
            bubble("Tell me a bit about you.", sub: "I'll use your language to explain things later.")
        } content: {
            VStack(spacing: 10) {
                FirstRunPickerRow(overline: "I speak", value: draft.nativeLanguage.map(Self.languageName) ?? "Choose a language",
                                  action: { picker = .language }) {
                    FirstRunIconBadge(icon: "globe")
                }
                FirstRunPickerRow(overline: "I'm joining from", value: draft.country.map(Self.countryName) ?? "Choose a country",
                                  action: { picker = .country }) {
                    if let country = draft.country { FirstRunCountryChip(code: country) } else { FirstRunIconBadge(icon: "pin") }
                }
                FirstRunSwitchRow(
                    label: "Show my flag on leaderboards",
                    sub: "Off unless you turn it on. You can change it in Profile.",
                    isOn: Binding(get: { draft.showFlag == true }, set: { v in update { $0.showFlag = v } }))
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: draft.nativeLanguage == nil || draft.country == nil, action: next)
        }
        .onAppear(perform: suggestFromDevice)
    }

    private var goalStep: some View {
        let mode = FirstRun.goalChoices.first { $0.id == draft.goal }?.sub
        return FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(.talk), figureLabel: "Alphonso", chip: mode) { hud() }
            bubble("Why are you learning \(courseName)?")
        } content: {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                ForEach(FirstRun.goalChoices, id: \.id) { choice in
                    FirstRunChoiceTile(icon: choice.icon, label: choice.label, selected: draft.goal == choice.id) {
                        update { $0.goal = choice.id }
                    }
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: draft.goal == nil, action: next)
        }
    }

    private var levelStep: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(.neutral), figureLabel: "Alphonso, listening") { hud() }
            bubble("How much \(courseName) do you know?")
        } content: {
            VStack(spacing: 10) {
                ForEach(FirstRun.levelChoices, id: \.id) { choice in
                    FirstRunChoiceRow(label: choice.label, sub: choice.sub, selected: draft.level == choice.id,
                                      action: { update { $0.level = choice.id } }) {
                        FirstRunIconBadge(icon: choice.icon, on: draft.level == choice.id)
                    }
                }
                if let hint = FirstRun.levelHint(level: draft.level, mode: mode) { FirstRunHint(text: hint) }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: draft.level == nil, action: next)
        }
    }

    private var timeStep: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(.talk), figureLabel: "Alphonso") { hud() }
            bubble("How much time a day feels right?", sub: "You can change it any time.")
        } content: {
            VStack(spacing: 10) {
                ForEach(FirstRun.timeChoices, id: \.minutes) { choice in
                    FirstRunChoiceRow(label: "\(choice.minutes) minutes", sub: choice.sub, selected: draft.dailyMinutes == choice.minutes,
                                      action: { update { $0.dailyMinutes = choice.minutes } }) {
                        FirstRunIconBadge(icon: "clock", on: draft.dailyMinutes == choice.minutes)
                    }
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: draft.dailyMinutes == nil, action: next)
        }
    }

    /// Neutral: never pre-picked, never remembered from an earlier visit.
    private var ageStep: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(.neutral), figureLabel: "Alphonso, listening") { hud() }
            bubble("How old are you?", sub: "So we keep the app right for you.")
        } content: {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(AgeChoice.allCases, id: \.self) { choice in
                    FirstRunAgeCard(choice: choice, selected: agePicked == choice) { agePicked = choice }
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", disabled: agePicked == nil) {
                guard let agePicked else { return }
                if FirstRun.chooseAge(store, agePicked) == .blocked {
                    FirstRunVoice.stop()
                    draft = LearnerAnswers()
                    onBlocked()
                    blocked = true
                    return
                }
                draft = merge(draft, store.readDraft())
                next()
            }
        }
    }

    private var interestsStep: some View {
        let chosen = draft.interests ?? []
        return FirstRunScreen {
            FirstRunRoom(roomID: room, figure: LessonArt.expression(.happy), figureLabel: "Alphonso, smiling") {
                hud(skip: { update { $0.interests = [] }; next() })
            }
            bubble("What do you love talking about?", sub: "Pick as many as you like.")
        } content: {
            LessonFlowLayout(spacing: AlphonsoDS.Space.s2) {
                ForEach(FirstRun.interestChoices, id: \.id) { choice in
                    FirstRunInterestChip(icon: choice.icon, label: choice.label, selected: chosen.contains(choice.id)) {
                        update { d in
                            var list = d.interests ?? []
                            if let i = list.firstIndex(of: choice.id) { list.remove(at: i) } else { list.append(choice.id) }
                            d.interests = list
                        }
                    }
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: "Continue", action: next)
        }
    }

    // MARK: First taste

    private var tasteStep: some View {
        let items = FirstRun.miniLessons[currentCourse] ?? FirstRun.miniLessons["en"]!
        let q = items[min(tasteIndex, items.count - 1)]
        let right = tastePicked == q.answer
        let expression: LessonExpression = tasteChecked ? (right ? .happy : .hmm) : (tastePicked == nil ? .talk : .neutral)
        return FirstRunScreen {
            FirstRunRoom(roomID: FirstRun.room(course: currentCourse, goal: nil), figure: LessonArt.expression(expression),
                         figureLabel: expression.accessibilityLabel) {
                FirstRunHUD(showCounter: false, onBack: back)
            }
            FirstRunBubble(title: q.prompt, sub: "First taste \u{B7} \(tasteIndex + 1) of \(items.count)", playLabel: "Hear it") {
                FirstRunVoice.speak(q.say, course: Course(wireCode: currentCourse) ?? .english)
            }
        } content: {
            VStack(spacing: AlphonsoDS.Space.s2) {
                ForEach(Array(q.choices.enumerated()), id: \.offset) { n, choice in
                    LessonAnswerButton(index: n, label: choice, state: answerState(n, q: q)) {
                        if !tasteChecked { tastePicked = n }
                    }
                    .disabled(tasteChecked)
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            if tasteChecked {
                LessonVerdictSheet(
                    correct: right,
                    title: right ? FirstRun.praise(course: currentCourse, name: name) : "Not quite",
                    xp: nil, correctAnswer: q.choices[q.answer], continueTitle: "Next",
                    onContinue: {
                        if tasteIndex + 1 < items.count {
                            tasteIndex += 1
                            tastePicked = nil
                            tasteChecked = false
                        } else {
                            next()
                        }
                    }) {
                    Text(q.why).dsText(.body).foregroundStyle(ds.ink).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, -AlphonsoDS.Space.gutter)
                .padding(.bottom, -AlphonsoDS.Space.s2)
            } else {
                FirstRunFooter(label: "Check", disabled: tastePicked == nil) { tasteChecked = true }
            }
        }
    }

    private func answerState(_ n: Int, q: FirstRun.MiniQuestion) -> LessonAnswerState {
        if !tasteChecked { return tastePicked == n ? .selected : .idle }
        if n == q.answer { return .correct }
        if n == tastePicked { return .incorrect }
        return .dimmed
    }

    // MARK: Plan

    private var planStep: some View {
        FirstRunPlanStep(
            draft: draft, course: currentCourse, name: name, contentStore: contentStore, onBack: back,
            busy: saving, error: saveError
        ) {
            if mode == .complete {
                saving = true
                saveError = nil
                Task {
                    do { try await onSave(draft) } catch { saveError = (error as? FirstRunSaveError)?.message ?? "Couldn't save. Try again." }
                    saving = false
                }
            } else {
                next()
            }
        }
    }

    // MARK: Sign in

    private var signInStep: some View {
        FirstRunSignInStep(draft: draft, course: currentCourse, name: name, session: session, onBack: back,
                           onEmail: onEmail, onHaveAccount: onHaveAccount)
    }

    // MARK: Helpers

    private func hud(skip: (() -> Void)? = nil) -> some View {
        let number: Int = {
            if case .question(let step) = stage, let i = questions.firstIndex(of: step) { return i + 1 }
            return 0
        }()
        return FirstRunHUD(
            step: number, total: questions.count,
            backLabel: index == 0 ? (mode == .complete ? "Not now" : "Back to sign in") : "Back",
            onBack: back, onSkip: skip)
    }

    private func bubble(_ title: String, sub: String? = nil) -> FirstRunBubble {
        FirstRunBubble(title: title, sub: sub) { FirstRunVoice.speak(title) }
    }

    private func update(_ change: (inout LearnerAnswers) -> Void) {
        var next = draft
        change(&next)
        draft = next
        store.writeDraft(next)
    }

    private func next() { index = min(index + 1, stages.count - 1) }

    private func back() {
        if index == 0 { onExit() } else { index -= 1 }
    }

    /// The device draft wins over the account's answers (it is newer); nil fields keep the earlier value.
    private func merge(_ base: LearnerAnswers, _ over: LearnerAnswers) -> LearnerAnswers {
        var out = base
        if let v = over.name { out.name = v }
        if let v = over.course { out.course = v }
        if let v = over.nativeLanguage { out.nativeLanguage = v }
        if let v = over.country { out.country = v }
        if let v = over.showFlag { out.showFlag = v }
        if let v = over.goal { out.goal = v }
        if let v = over.level { out.level = v }
        if let v = over.dailyMinutes { out.dailyMinutes = v }
        if let v = over.ageRange { out.ageRange = v }
        if let v = over.interests { out.interests = v }
        if let v = over.heardFrom { out.heardFrom = v }
        return out
    }

    /// The phone's own language and region, as a suggestion only (nothing is looked up over the network).
    private func suggestFromDevice() {
        guard draft.nativeLanguage == nil || draft.country == nil else { return }
        let lang = Locale.current.language.languageCode?.identifier
        let region = Locale.current.region?.identifier.uppercased()
        update { d in
            if d.nativeLanguage == nil, let lang, LearnerProfileLists.nativeLanguages.contains(lang) { d.nativeLanguage = lang }
            if d.country == nil, let region, LearnerProfileLists.countries.contains(region) { d.country = region }
        }
    }

    static func languageName(_ code: String) -> String {
        Locale(identifier: "en").localizedString(forLanguageCode: code) ?? code
    }

    static func countryName(_ code: String) -> String {
        Locale(identifier: "en").localizedString(forRegionCode: code) ?? code
    }

    @ViewBuilder private func pickerSheet(_ kind: PickerKind) -> some View {
        switch kind {
        case .language:
            FirstRunPickerSheet(
                title: "I speak", searchPrompt: "Search languages",
                items: LearnerProfileLists.nativeLanguages.map { .init(id: $0, label: Self.languageName($0)) }
                    .sorted { $0.label.localizedCompare($1.label) == .orderedAscending },
                selected: draft.nativeLanguage) { id in update { $0.nativeLanguage = id } }
        case .country:
            FirstRunPickerSheet(
                title: "I'm joining from", searchPrompt: "Search countries",
                items: LearnerProfileLists.countries.map { .init(id: $0, label: Self.countryName($0)) }
                    .sorted { $0.label.localizedCompare($1.label) == .orderedAscending },
                selected: draft.country, showsCode: true) { id in update { $0.country = id } }
        }
    }
}

struct FirstRunSaveError: Error {
    let message: String
}

/// The name field in the lesson's answer style, brand blue and large.
private struct FirstRunNameField: View {
    @Binding var text: String
    @Environment(\.alphonsoDS) private var ds
    @FocusState private var focused: Bool

    var body: some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        TextField("", text: $text, prompt: Text("Your first name").foregroundStyle(ds.inkFaint))
            .dsText(.title)
            .foregroundStyle(ds.brand)
            .textContentType(.givenName)
            .textInputAutocapitalization(.words)
            .autocorrectionDisabled()
            .submitLabel(.next)
            .focused($focused)
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .background { shape.fill(ds.card) }
            .overlay { shape.strokeBorder(ds.brand, lineWidth: 2) }
            .accessibilityLabel("Your first name")
    }
}

// MARK: - Plan step

struct FirstRunPlanStep: View {
    let draft: LearnerAnswers
    let course: String
    let name: String
    let contentStore: ContentStore
    let onBack: () -> Void
    var busy = false
    var error: String?
    let onSave: () -> Void

    @Environment(\.alphonsoDS) private var ds

    private var plan: FirstRun.Plan {
        let units = contentStore.bundle(for: Course(wireCode: course) ?? .english).units
        return FirstRun.plan(units: units, level: draft.level, dailyMinutes: draft.dailyMinutes, now: Date(),
                             timing: LessonData.timing, roomMap: LessonData.roomMap)
    }

    private var title: String {
        (name.isEmpty ? "Here's" : "\(name), here's") + " your \(FirstRun.courseName(course)) plan!"
    }

    var body: some View {
        let plan = plan
        FirstRunScreen(underStatusBar: false) {
            VStack(alignment: .leading, spacing: 0) {
                FirstRunHUD(showCounter: false, onBack: onBack)
                    .padding(.horizontal, AlphonsoDS.Space.gutter)
                    .padding(.top, AlphonsoDS.Space.s2)
                Color.clear.frame(height: AlphonsoDS.Space.s12)
                FirstRunBubble(title: title) { FirstRunVoice.speak(title) }
                    .padding(.top, AlphonsoDS.Space.s4)
            }
        } content: {
            VStack(spacing: AlphonsoDS.Space.s3) {
                FirstRunPlanPath(nodes: plan.nodes)
                HStack(spacing: AlphonsoDS.Space.s3) {
                    FirstRunSymbol(name: "cal", size: 24).foregroundStyle(ds.action)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(plan.goalUnitTitle) by \(FirstRun.formatDay(plan.goalDate))")
                            .dsText(.headline).foregroundStyle(ds.card)
                        Text("\(draft.dailyMinutes ?? 10) minutes a day").dsText(.caption).foregroundStyle(ds.onHeroSoft)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, AlphonsoDS.Space.s4)
                .padding(.vertical, AlphonsoDS.Space.s3)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.hero))
                .accessibilityElement(children: .combine)
                HStack(spacing: 10) {
                    teamMate(face: LessonArt.expression(.happy), name: "Alphonso", job: "Daily lessons", pro: false)
                    teamMate(face: FirstRunArt.hector("hector-happy"), name: "Hector", job: "Real conversations", pro: true)
                }
                if let error {
                    Text(error).dsText(.footnote).foregroundStyle(ds.wrongInk).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            FirstRunFooter(label: busy ? "Saving\u{2026}" : "Save my plan", disabled: busy, action: onSave)
        }
    }

    private func teamMate(face: UIImage?, name: String, job: String, pro: Bool) -> some View {
        HStack(spacing: 10) {
            Group {
                if let face {
                    Image(uiImage: face).resizable().scaledToFit().scaleEffect(1.75, anchor: UnitPoint(x: 0.5, y: 0.16))
                }
            }
            .frame(width: 44, height: 44)
            .background(ds.sunk)
            .clipShape(Circle())
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(name).dsText(.footnote).foregroundStyle(ds.brand)
                    if pro {
                        Text("PRO").dsText(.overline).foregroundStyle(ds.onAction)
                            .padding(.horizontal, 4).padding(.vertical, 1)
                            .background(RoundedRectangle(cornerRadius: 5, style: .continuous).fill(ds.action))
                    }
                }
                Text(job).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, AlphonsoDS.Space.s3)
        .padding(.vertical, AlphonsoDS.Space.s2)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
        .accessibilityElement(children: .combine)
    }
}

/// The first three units as rooms on a dotted path, the second lower in the middle.
private struct FirstRunPlanPath: View {
    let nodes: [FirstRun.Plan.Node]
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = geo.size.height
            let spots = [CGPoint(x: w * 0.2, y: h * 0.32), CGPoint(x: w * 0.5, y: h * 0.62), CGPoint(x: w * 0.8, y: h * 0.32)]
            ZStack {
                Path { p in
                    p.move(to: CGPoint(x: w * 0.16, y: h * 0.3))
                    p.addCurve(to: CGPoint(x: w * 0.5, y: h * 0.7), control1: CGPoint(x: w * 0.41, y: h * 0.3),
                               control2: CGPoint(x: w * 0.37, y: h * 0.7))
                    p.addCurve(to: CGPoint(x: w * 0.84, y: h * 0.3), control1: CGPoint(x: w * 0.63, y: h * 0.7),
                               control2: CGPoint(x: w * 0.75, y: h * 0.3))
                }
                .stroke(ds.action, style: StrokeStyle(lineWidth: 4, lineCap: .round, dash: [2, 9]))
                .accessibilityHidden(true)
                ForEach(Array(nodes.enumerated()), id: \.offset) { k, node in
                    VStack(spacing: 4) {
                        Group {
                            if let art = LessonArt.room(node.room) { Image(uiImage: art).resizable().scaledToFill() }
                        }
                        .frame(width: 72, height: 72)
                        .clipShape(Circle())
                        .saturation(k == 2 ? 0.4 : 1)
                        .overlay(Circle().strokeBorder(ds.card, lineWidth: 3))
                        .padding(3)
                        .overlay(Circle().strokeBorder(k == 0 ? ds.brand : k == 1 ? ds.action : ds.line, lineWidth: 3))
                        .accessibilityHidden(true)
                        Text("\(k + 1) \u{B7} \(node.title)")
                            .dsText(.caption)
                            .foregroundStyle(ds.brand)
                            .multilineTextAlignment(.center)
                            .frame(width: 100)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .position(x: spots[k].x, y: spots[k].y + 20)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Unit \(k + 1), \(node.title)")
                }
            }
        }
        .frame(height: 224)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).strokeBorder(ds.line, lineWidth: 2))
        .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Your first units")
    }
}

// MARK: - Sign-in step

/// "Let's save your plan": the plan card, then Apple, Google and email exactly as the sign-in screen has them.
struct FirstRunSignInStep: View {
    let draft: LearnerAnswers
    let course: String
    let name: String
    let session: Session?
    let onBack: () -> Void
    let onEmail: () -> Void
    let onHaveAccount: () -> Void

    @Environment(\.alphonsoDS) private var ds

    private var title: String { name.isEmpty ? "Let's save your plan." : "Let's save your plan, \(name)." }

    var body: some View {
        let lines = FirstRun.planSummary(draft, course: course)
        let icons = ["target", "clock", "food"]
        FirstRunScreen {
            FirstRunRoom(roomID: FirstRun.room(course: course, goal: nil), figure: LessonArt.expression(.talk), figureLabel: "Alphonso") {
                FirstRunHUD(showCounter: false, onBack: onBack)
            }
            FirstRunBubble(title: title, sub: "So it follows you to any device.") { FirstRunVoice.speak(title) }
        } content: {
            VStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Your plan").dsText(.overline).foregroundStyle(ds.actionText)
                    ForEach(Array(lines.enumerated()), id: \.offset) { k, line in
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            FirstRunSymbol(name: icons[min(k, icons.count - 1)], size: 18).foregroundStyle(ds.actionText)
                            Text(line).dsText(.footnote).foregroundStyle(ds.brand).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, AlphonsoDS.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    .strokeBorder(ds.action, style: StrokeStyle(lineWidth: 2, dash: [6, 4])))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Your plan. " + lines.joined(separator: ". "))
                .padding(.bottom, AlphonsoDS.Space.s2)

                if let session {
                    SignInWithAppleButton(.continue) { request in
                        session.prepareAppleRequest(request)
                    } onCompletion: { result in
                        Task { await session.completeAppleSignIn(result) }
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: AuthButtonMetrics.height)
                    .clipShape(RoundedRectangle(cornerRadius: AuthButtonMetrics.cornerRadius, style: .continuous))
                    .disabled(session.isBusy)
                    .opacity(session.isBusy ? 0.5 : 1)

                    GoogleSignInButton(isBusy: session.isBusy) {
                        Task { await session.signInWithGoogle() }
                    }
                }

                Button(action: onEmail) {
                    HStack(spacing: 10) {
                        FirstRunSymbol(name: "mail", size: 20)
                        Text("Continue with email")
                    }
                }
                .buttonStyle(LessonEdgeButtonStyle(variant: .secondary))

                Button("I already have an account", action: onHaveAccount)
                    .dsText(.headline)
                    .foregroundStyle(ds.choice)
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)

                if let message = session?.errorMessage {
                    Text(message).dsText(.footnote).foregroundStyle(ds.wrongInk).multilineTextAlignment(.center)
                }

                Text(AuthView.footer)
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                    .tint(ds.brand)
                    .multilineTextAlignment(.center)
                    .padding(.top, AlphonsoDS.Space.s1)
            }
            .padding(.horizontal, AlphonsoDS.Space.gutter)
            .padding(.top, AlphonsoDS.Space.s4)
        } footer: {
            EmptyView()
        }
    }
}

// MARK: - Under 13

/// The kind stop for a learner who said they are under 13 (the owner-approved wording). No account, nothing stored
/// but the device's own note that keeps this screen up, and nothing sent. There is no way back into the questions.
struct Under13StopView: View {
    var onOk: () -> Void = {}
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        FirstRunScreen {
            FirstRunRoom(roomID: "room-light", figure: LessonArt.expression(.neutral), figureLabel: "Alphonso", size: .tall) {
                EmptyView()
            }
        } content: {
            VStack(spacing: 10) {
                Text(FirstRun.under13Title)
                    .dsText(.display)
                    .foregroundStyle(ds.brand)
                    .accessibilityAddTraits(.isHeader)
                Text(FirstRun.under13Body)
                    .dsText(.body)
                    .foregroundStyle(ds.inkSoft)
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, AlphonsoDS.Space.s6)
            .padding(.top, AlphonsoDS.Space.s8)
            .accessibilityIdentifier("firstRun.under13")
        } footer: {
            FirstRunFooter(label: "OK", action: onOk)
        }
    }
}
