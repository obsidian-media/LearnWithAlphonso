import SwiftUI
import LearnWithAlphonsoKit

// Rehearsals on iPhone: the Learn entry, the four-step intake, the plan, the call, the debrief, "How did it go?" and the
// Pro sheet. Every word and every decision lives in the Kit (Rehearsals.swift, tested against the shared fixture); this
// file lays it out with the existing design tokens and buttons. No score, no star and no readiness number anywhere.
// The tutor is always labelled AI. Compiled by CI's ios-app-build; not run on a device by the change that added it.

// MARK: - The model

/// One course's rehearsal state, as the server last said it, and the actions that change it.
@MainActor
@Observable
final class RehearsalModel {
    private(set) var state: RehearsalState?
    private(set) var error: RehearsalError?
    private(set) var busy = false

    private let session: Session
    let courseCode: String

    init(session: Session, courseCode: String) {
        self.session = session
        self.courseCode = courseCode
    }

    private func client() async -> RehearsalClient? {
        guard let token = await session.freshAccessToken() else { return nil }
        let session = self.session
        return RehearsalClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { token },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
    }

    func refresh() async {
        guard let client = await client() else { error = .failed; return }
        switch await client.state(course: courseCode) {
        case .success(let value):
            state = value; error = nil
            // Kept so the phrasebook still opens with no connection.
            RehearsalPhraseStore().save(active: value.active, progress: value.progress)
        case .failure(let e): error = e
        }
    }

    /// Runs one change, then reads the state again. nil on success, else what went wrong.
    private func change(_ body: (RehearsalClient) async -> RehearsalError?) async -> RehearsalError? {
        busy = true
        defer { busy = false }
        guard let client = await client() else { return .failed }
        if let e = await body(client) { error = e; return e }
        await refresh()
        return nil
    }

    func create(_ intake: RehearsalIntake) async -> RehearsalError? {
        await change { if case .failure(let e) = await $0.create(intake) { return e } else { return nil } }
    }

    /// A quick-start create: the server builds the brief from the preset, then the state is read again.
    func create(preset: String, eventDate: String?) async -> RehearsalError? {
        let course = courseCode
        return await change { if case .failure(let e) = await $0.create(course: course, preset: preset, eventDate: eventDate) { return e } else { return nil } }
    }

    /// The quick-start cards for this course, in server order. nil error and an empty list never happen together.
    private(set) var presets: [RehearsalPreset] = []
    private(set) var presetsError: RehearsalError?
    private(set) var presetsLoading = false

    func loadPresets() async {
        presetsLoading = true
        defer { presetsLoading = false }
        guard let client = await client() else { presetsError = .failed; return }
        switch await client.presets(course: courseCode) {
        case .success(let list): presets = list; presetsError = nil
        case .failure(let e): presetsError = e  // keep the last good list, if any
        }
    }

    func adjust(id: String, _ intake: RehearsalIntake) async -> RehearsalError? {
        await change { if case .failure(let e) = await $0.adjust(id: id, intake) { return e } else { return nil } }
    }

    func delete(id: String) async -> RehearsalError? {
        await change { if case .failure(let e) = await $0.delete(id: id) { return e } else { return nil } }
    }

    func cancel(id: String) async -> RehearsalError? {
        await change { if case .failure(let e) = await $0.cancel(id: id) { return e } else { return nil } }
    }

    func outcome(id: String, choice: RehearsalOutcomeChoice, newDate: String? = nil) async -> RehearsalError? {
        await change { if case .failure(let e) = await $0.outcome(id: id, choice: choice, newDate: newDate) { return e } else { return nil } }
    }
}

// MARK: - Small shared pieces

private struct RehearsalCard<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) { content }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
            .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))
    }
}

private struct RehearsalErrorLine: View {
    let error: RehearsalError?
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        if let error {
            Text(error.userMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
                .accessibilityAddTraits(.updatesFrequently)
        }
    }
}

/// The call header: the event as the title with an AI label, "Alphonso . Stage N of 3: <label>" and a
/// three-segment bar.
struct RehearsalCallHeaderInfo: Equatable {
    let title: String
    let subline: String
    let filled: Int
}

struct RehearsalCallHeaderView: View {
    let info: RehearsalCallHeaderInfo
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: AlphonsoDS.Space.s2) {
                Text(info.title).dsText(.questionSmall).lineLimit(1)
                AILabelView()
            }
            Text(info.subline).dsText(.footnote).lineLimit(1)
            HStack(spacing: 4) {
                ForEach(1...RehearsalStage.allCases.count, id: \.self) { n in
                    Capsule().fill(n <= info.filled ? ds.callMint : ds.onHero.opacity(0.25)).frame(width: 28, height: 4)
                }
            }
            .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(info.title), AI. \(info.subline)")
    }
}

/// The stage whose partner sheet is open (`.sheet(item:)` needs an identifier).
struct RehearsalStageChoice: Identifiable, Equatable {
    let stage: RehearsalStage
    var id: String { stage.rawValue }
}

// MARK: - The flow

/// What opens the flow: the plan or the intake (decided from the state), a stage straight away (a pinned item), or
/// "How did it go?".
enum RehearsalStart: Equatable {
    case auto
    case run(RehearsalStage)
    case outcome
}

/// The whole Rehearsals experience, presented full screen from Learn.
struct RehearsalFlowView: View {
    let model: RehearsalModel
    let course: Course
    let session: Session
    let entitlementStore: EntitlementStore?
    let start: RehearsalStart
    let onClose: () -> Void

    private enum Screen: Equatable {
        case loading
        case picker
        case preview(RehearsalPreset)
        case intake(adjusting: Bool)
        case plan
        case phrases
        case run(RehearsalStage)
        case outcome
    }

    @State private var screen: Screen = .loading
    @State private var showPaywall = false
    /// Back from the phrasebook: the plan puts VoiceOver focus on its entry row.
    @State private var returnedFromPhrases = false
    /// Hector or hard mode was refused on the first turn of a call (402 pro_required): the plain Pro paywall.
    @State private var showHectorPaywall = false
    /// The stage whose partner is being chosen: every start asks "Alphonso or Hector?" first.
    @State private var choosing: RehearsalStageChoice?
    /// The partner chosen for the run on screen, fixed for the whole call.
    @State private var runPersona: RehearsalPersona = .alphonso
    @State private var runHardMode = false
    /// A new value for every run, so "Run this stage again" starts a fresh call instead of reusing the finished one.
    @State private var runToken = UUID()
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        NavigationStack {
            Group {
                switch screen {
                case .loading:
                    VStack(spacing: AlphonsoDS.Space.s3) {
                        if let error = model.error {
                            Text(error.userMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
                                .multilineTextAlignment(.center)
                            Button("Try again") { Task { await open() } }.buttonStyle(.alphonsoSecondary)
                            if RehearsalPhraseStore().load(course: course.wireCode)?.isOffered == true {
                                Button(RehearsalPhrasebook.entryTitle) { screen = .phrases }.buttonStyle(.alphonsoSecondary)
                            }
                        } else {
                            ProgressView("Loading\u{2026}").tint(ds.choice)
                        }
                    }
                    .padding(AlphonsoDS.Space.gutter)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .picker:
                    RehearsalPresetPickerView(model: model, onPick: { screen = .preview($0) },
                                              onSomethingElse: { screen = .intake(adjusting: false) }, onCancel: { onClose() })
                case .preview(let preset):
                    RehearsalPresetPreviewView(model: model, preset: preset, onPaywall: { showPaywall = true },
                                               onStarted: { screen = .plan },
                                               onPersonalise: { screen = .intake(adjusting: true) },
                                               onBack: { screen = .picker })
                case .intake(let adjusting):
                    RehearsalIntakeView(model: model, course: course, adjusting: adjusting ? model.state?.active : nil,
                                        onPaywall: { showPaywall = true }, onDone: { screen = .plan },
                                        onCancel: {
                                            if adjusting { screen = .plan } else { screen = .picker }
                                        })
                case .plan:
                    if let active = model.state?.active {
                        RehearsalPlanView(model: model, rehearsal: active,
                                          onStart: { choosing = RehearsalStageChoice(stage: $0) }, onAdjust: { screen = .intake(adjusting: true) },
                                          onDeleted: { Task { await open() } },
                                          onOpenPhrases: { screen = .phrases }, focusPhrases: returnedFromPhrases,
                                          onFocusedPhrases: { returnedFromPhrases = false })
                    } else { Color.clear.task { await open() } }
                case .phrases:
                    // Live phrases when the state is loaded, else the copy kept on the device (offline).
                    if let snapshot = phrasesSnapshot {
                        RehearsalPhrasebookView(snapshot: snapshot, course: course, session: session,
                                                onBack: { returnedFromPhrases = true; screen = model.state?.active != nil ? .plan : .loading })
                    } else { Color.clear.task { await open() } }
                case .run(let stage):
                    if let active = model.state?.active {
                        RehearsalRunView(model: model, rehearsal: active, stage: stage, course: course, session: session,
                                         persona: runPersona, hardMode: runHardMode,
                                         onPaywall: { showPaywall = true }, onProRequired: { showHectorPaywall = true },
                                         onRunStage: { choosing = RehearsalStageChoice(stage: $0) }, onPlan: { screen = .plan })
                            .id(runToken)
                    } else { Color.clear.task { await open() } }
                case .outcome:
                    if let active = model.state?.active {
                        RehearsalOutcomeView(model: model, rehearsal: active, onDone: { Task { await open() } })
                    } else { Color.clear.task { await open() } }
                }
            }
            .background(ds.surface)
            .sheet(item: $choosing) { pick in
                RehearsalPartnerSheet(
                    stage: pick.stage, stateHectorAvailable: model.state?.hectorAvailable, entitlementStore: entitlementStore,
                    onChoose: { persona, hard in
                        runPersona = persona
                        runHardMode = hard
                        runToken = UUID()
                        choosing = nil
                        screen = .run(pick.stage)
                    },
                    onClose: { choosing = nil },
                    onPaywallClosed: { Task { await model.refresh() } })
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { onClose() }.tint(ds.choice)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { await open() }
        .sheet(isPresented: $showPaywall) {
            RehearsalPaywallSheet(
                copy: RehearsalPaywallCopy.make(history: model.state?.history ?? []),
                entitlementStore: entitlementStore, onClose: { showPaywall = false })
        }
        .sheet(isPresented: $showHectorPaywall) {
            if let entitlementStore {
                PaywallView(entitlementStore: entitlementStore, source: .rehearsalEntry, onClose: {
                    showHectorPaywall = false
                    Task { await model.refresh() }
                })
            }
        }
    }

    /// The phrasebook's phrases: live from the loaded state, else the copy kept on the device (offline).
    private var phrasesSnapshot: RehearsalPhraseSnapshot? {
        let progress = model.state?.progress
        let live = model.state?.active.flatMap({ RehearsalPhraseSnapshot(rehearsal: $0, progress: progress) })
        return live ?? RehearsalPhraseStore().load(course: course.wireCode)
    }

    /// Reads the state and picks the screen: what the launcher asked for when it can be done, else the plan, else the intake.
    private func open() async {
        await model.refresh()
        guard let state = model.state else { screen = .loading; return }
        guard state.active != nil else { screen = .picker; return }
        switch (screen == .loading ? start : .auto) {
        case .run(let stage):
            screen = .plan
            choosing = RehearsalStageChoice(stage: stage)
        case .outcome: screen = .outcome
        case .auto: screen = .plan
        }
    }
}

// MARK: - Quick-starts

/// The first screen when there is no active rehearsal: the server's quick-start cards, then "Something else", which
/// opens the four-step intake. A list that will not load leaves "Something else" and a retry, never a dead end.
struct RehearsalPresetPickerView: View {
    let model: RehearsalModel
    let onPick: (RehearsalPreset) -> Void
    let onSomethingElse: () -> Void
    let onCancel: () -> Void

    @State private var asked = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                Text(RehearsalPresetCopy.title).dsText(.title).foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(RehearsalPresetCopy.subtitle).dsText(.footnote).foregroundStyle(ds.inkSoft)
                if model.presetsLoading && model.presets.isEmpty {
                    ProgressView("Loading\u{2026}").tint(ds.choice).frame(maxWidth: .infinity)
                        .padding(.vertical, AlphonsoDS.Space.s3)
                }
                ForEach(model.presets) { preset in
                    Button { onPick(preset) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(preset.title).dsText(.headline).foregroundStyle(ds.ink)
                            if !preset.blurb.isEmpty {
                                Text(preset.blurb).dsText(.footnote).foregroundStyle(ds.inkSoft)
                                    .multilineTextAlignment(.leading)
                            }
                        }
                        .cardRow(ds)
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Opens a preview")
                }
                if !model.presetsLoading, model.presets.isEmpty, model.presetsError == .notEnabled {
                    Text(RehearsalError.notEnabled.userMessage).dsText(.footnote).foregroundStyle(ds.wrongInk)
                        .accessibilityAddTraits(.updatesFrequently)
                } else if !model.presetsLoading, model.presets.isEmpty, model.presetsError != nil {
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                        Text(RehearsalPresetCopy.loadFailed).dsText(.footnote).foregroundStyle(ds.wrongInk)
                            .accessibilityAddTraits(.updatesFrequently)
                        if let e = model.presetsError, e != .failed { RehearsalErrorLine(error: e) }
                        Button(RehearsalPresetCopy.retry) { Task { await model.loadPresets() } }
                            .buttonStyle(.alphonsoSecondary)
                    }
                }
                if model.presetsError != .notEnabled {
                    Button { onSomethingElse() } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(RehearsalPresetCopy.somethingElse).dsText(.headline).foregroundStyle(ds.actionText)
                            Text(RehearsalPresetCopy.somethingElseHint).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        }
                        .cardRow(ds)
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                    .accessibilityHint("Opens four short questions about your own conversation")
                }
                Button { onCancel() } label: {
                    Text("Not now").dsText(.footnote).foregroundStyle(ds.inkSoft)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .task {
            guard !asked else { return }
            asked = true
            await model.loadPresets()
        }
    }
}

private extension View {
    /// One tappable row in the picker: the card look, a 44pt minimum height and a chevron.
    func cardRow(_ ds: AlphonsoDS.Colors) -> some View {
        HStack {
            self
            Spacer(minLength: 0)
            Image(systemName: "chevron.right").foregroundStyle(ds.inkSoft).accessibilityHidden(true)
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))
    }
}

/// What a quick-start holds, before the learner commits: the counterpart, the three stages with their goals, an optional
/// date, "Start now" and "Personalise". Both buttons create from the preset; Personalise then opens the adjust flow.
struct RehearsalPresetPreviewView: View {
    let model: RehearsalModel
    let preset: RehearsalPreset
    let onPaywall: () -> Void
    let onStarted: () -> Void
    let onPersonalise: () -> Void
    let onBack: () -> Void

    @State private var withDate = false
    @State private var pickedDate = Date().addingTimeInterval(86_400)
    @State private var error: RehearsalError?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                Text(preset.title).dsText(.title).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
                if !preset.blurb.isEmpty { Text(preset.blurb).dsText(.body).foregroundStyle(ds.inkSoft) }
                if !preset.counterpart.isEmpty {
                    Text(preset.counterpartLine).dsText(.headline).foregroundStyle(ds.ink)
                }
                if !preset.stages.isEmpty {
                    RehearsalCard {
                        ForEach(Array(preset.stages.enumerated()), id: \.offset) { index, stage in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Stage \(index + 1): \(stage.stage?.label ?? stage.key)").dsText(.headline).foregroundStyle(ds.ink)
                                Text(stage.goal).dsText(.footnote).foregroundStyle(ds.inkSoft)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
                dateRow
                RehearsalErrorLine(error: error)
                Button(RehearsalPresetCopy.startNow) { Task { await create(personalise: false) } }
                    .buttonStyle(.alphonsoPrimary(fullWidth: true))
                    .disabled(model.busy)
                Button(RehearsalPresetCopy.personalise) { Task { await create(personalise: true) } }
                    .buttonStyle(.alphonsoSecondary(fullWidth: true))
                    .disabled(model.busy)
                    .accessibilityHint(RehearsalPresetCopy.personaliseHint)
                Button { onBack() } label: {
                    Text("Back").dsText(.footnote).foregroundStyle(ds.inkSoft)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(AlphonsoDS.Space.gutter)
        }
    }

    @ViewBuilder
    private var dateRow: some View {
        if withDate {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                DatePicker("Date", selection: $pickedDate, in: Date()..., displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .tint(ds.action)
                Button { withDate = false } label: {
                    Text(RehearsalPresetCopy.removeDate).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        } else {
            Button { withDate = true } label: {
                Text(RehearsalPresetCopy.addDate).dsText(.headline).foregroundStyle(ds.actionText)
                    .frame(minHeight: AlphonsoDS.Space.minTouch)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func create(personalise: Bool) async {
        error = nil
        let date = withDate ? RehearsalDates.string(from: pickedDate) : nil
        if let failure = await model.create(preset: preset.id, eventDate: date) {
            if failure == .paywall { onPaywall() }
            error = failure
        } else if personalise {
            // The create worked but reading the state back may not have: try once more before opening the adjust flow.
            if model.state?.active == nil { await model.refresh() }
            // Still nothing: the plan screen reads the state itself and shows its error line with Try again, never a blank intake.
            if model.state?.active == nil { onStarted() } else { onPersonalise() }
        } else {
            onStarted()
        }
    }
}

// MARK: - Intake

struct RehearsalIntakeView: View {
    let model: RehearsalModel
    let course: Course
    /// The rehearsal being adjusted, or nil for a new one.
    let adjusting: Rehearsal?
    let onPaywall: () -> Void
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var step = 1
    @State private var draft = RehearsalIntakeDraft()
    @State private var pickedDate = Date().addingTimeInterval(86_400)
    @State private var loaded = false
    @State private var error: RehearsalError?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                Text(RehearsalIntakeCopy.stepLabel(step)).dsText(.overline).foregroundStyle(ds.actionText)
                ProgressView(value: Double(step), total: Double(RehearsalIntakeDraft.stepCount)).tint(ds.xp)
                    .accessibilityHidden(true)
                Text(RehearsalIntakeCopy.titles[step - 1]).dsText(.title).foregroundStyle(ds.ink)
                    .accessibilityAddTraits(.isHeader)
                stepBody
                RehearsalErrorLine(error: error)
                buttons
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            if let adjusting {
                draft = RehearsalIntakeDraft(
                    kind: adjusting.kind, eventDate: adjusting.eventDate, counterpart: adjusting.counterpart,
                    worries: adjusting.worries ?? "")
                if let d = adjusting.eventDate, let noon = RehearsalDates.noon(of: d) { pickedDate = noon }
            }
        }
    }

    @ViewBuilder
    private var stepBody: some View {
        switch step {
        case 1:
            VStack(spacing: AlphonsoDS.Space.s2) {
                ForEach(RehearsalEventKind.allCases, id: \.self) { kind in
                    Button { draft.kind = kind } label: {
                        HStack {
                            Text(kind.label).dsText(.headline)
                            Spacer()
                            if draft.kind == kind { Image(systemName: "checkmark").accessibilityHidden(true) }
                        }
                        .foregroundStyle(draft.kind == kind ? ds.actionText : ds.ink)
                        .padding(AlphonsoDS.Space.s3)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                            .fill(draft.kind == kind ? ds.actionTint : ds.card))
                        .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                            .strokeBorder(draft.kind == kind ? ds.action : ds.line, lineWidth: draft.kind == kind ? 2 : 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(draft.kind == kind ? .isSelected : [])
                }
            }
        case 2:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                DatePicker("When is it?", selection: $pickedDate, in: Date()..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .labelsHidden()
                    .tint(ds.action)
                    .onChange(of: pickedDate) { _, new in draft.eventDate = RehearsalDates.string(from: new) }
                Button {
                    draft.eventDate = nil
                } label: {
                    HStack {
                        Image(systemName: draft.eventDate == nil ? "checkmark.circle.fill" : "circle").accessibilityHidden(true)
                        Text(RehearsalIntakeCopy.notSureYet).dsText(.headline)
                    }
                    .foregroundStyle(draft.eventDate == nil ? ds.actionText : ds.ink)
                    .frame(minHeight: AlphonsoDS.Space.minTouch)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(draft.eventDate == nil ? .isSelected : [])
                Text(RehearsalIntakeCopy.notSureNote).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        case 3:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                TextField(draft.counterpartPlaceholder, text: $draft.counterpart, axis: .vertical)
                    .dsText(.body)
                    .padding(AlphonsoDS.Space.s3)
                    .alphonsoInputBackground()
                    .onChange(of: draft.counterpart) { _, new in
                        if new.count > rehearsalIntakeTextMax { draft.counterpart = String(new.prefix(rehearsalIntakeTextMax)) }
                    }
                Text("\(draft.counterpart.count)/\(rehearsalIntakeTextMax)").dsText(.caption).foregroundStyle(ds.inkSoft)
                Text(RehearsalIntakeCopy.noNames).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        default:
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                TextField("Questions about salary, and my English when I am nervous", text: $draft.worries, axis: .vertical)
                    .dsText(.body)
                    .lineLimit(2...4)
                    .padding(AlphonsoDS.Space.s3)
                    .alphonsoInputBackground()
                    .onChange(of: draft.worries) { _, new in
                        if new.count > rehearsalIntakeTextMax { draft.worries = String(new.prefix(rehearsalIntakeTextMax)) }
                    }
                Text("\(RehearsalIntakeCopy.worriesNote) \(draft.worries.count)/\(rehearsalIntakeTextMax)")
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
                Text(RehearsalIntakeCopy.worriesExample).dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        }
    }

    private var buttons: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            if step < RehearsalIntakeDraft.stepCount {
                Button("Next") { step += 1 }
                    .buttonStyle(.alphonsoPrimary(fullWidth: true))
                    .disabled(!draft.canContinue(step: step))
            } else {
                Button(RehearsalIntakeCopy.makePlan) { Task { await submit() } }
                    .buttonStyle(.alphonsoPrimary(fullWidth: true))
                    .disabled(!draft.canContinue(step: step) || model.busy)
                // Optional and skippable: the learner is never forced to say what worries them.
                Button("Skip") { draft.worries = ""; Task { await submit() } }
                    .buttonStyle(.alphonsoSecondary(fullWidth: true))
                    .disabled(model.busy)
            }
            Button(step == 1 ? "Not now" : "Back") { if step == 1 { onCancel() } else { step -= 1 } }
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
                .frame(minHeight: AlphonsoDS.Space.minTouch)
        }
    }

    private func submit() async {
        error = nil
        switch draft.validate(course: course.wireCode) {
        case .failure: error = .invalid
        case .success(let intake):
            let failure: RehearsalError?
            if let adjusting { failure = await model.adjust(id: adjusting.id, intake) } else { failure = await model.create(intake) }
            if let failure {
                if failure == .paywall { onPaywall() }
                error = failure
            } else {
                onDone()
            }
        }
    }
}

// MARK: - Plan

struct RehearsalPlanView: View {
    let model: RehearsalModel
    let rehearsal: Rehearsal
    let onStart: (RehearsalStage) -> Void
    let onAdjust: () -> Void
    let onDeleted: () -> Void
    var onOpenPhrases: () -> Void = {}
    /// Back from the phrasebook: VoiceOver focus goes to the entry row.
    var focusPhrases = false
    /// Called once the focus was moved, so a later return to the plan does not steal it again.
    var onFocusedPhrases: () -> Void = {}

    @AccessibilityFocusState private var phrasesFocused: Bool
    @State private var confirmingDelete = false
    @State private var error: RehearsalError?
    @Environment(\.alphonsoDS) private var ds

    private var rows: [(stage: RehearsalStage, row: RehearsalPlan.StageRow)] {
        RehearsalPlan.rows(progress: model.state?.progress, nextStage: model.state?.nextStage)
    }

    var body: some View {
        let today = RehearsalDates.string(from: Date())
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Text(RehearsalPlan.title).dsText(.overline).foregroundStyle(ds.onHeroKick)
                    Text(rehearsal.eventLabel).dsText(.title).foregroundStyle(ds.onHero)
                    Text(RehearsalDates.line(eventDate: rehearsal.eventDate, today: today)).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                    Text("With \(rehearsal.counterpart)").dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                }
                .padding(AlphonsoDS.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
                .accessibilityElement(children: .combine)

                ForEach(Array(rows.enumerated()), id: \.offset) { _, item in stageRow(item.stage, item.row) }

                let phraseRows = RehearsalPhrasebook.rows(brief: rehearsal.brief)
                if RehearsalPhrasebook.isOffered(progress: model.state?.progress, rows: phraseRows) {
                    RehearsalPhrasebookEntry(count: phraseRows.count, onOpen: onOpenPhrases)
                        .accessibilityFocused($phrasesFocused)
                }

                if let next = model.state?.nextStage {
                    Button(RehearsalPlan.nextButton(next)) { onStart(next) }
                        .buttonStyle(.alphonsoPrimary(fullWidth: true))
                }
                RehearsalErrorLine(error: error)
                HStack {
                    Button(RehearsalPlan.adjustLabel) { onAdjust() }
                    Spacer()
                    Button(RehearsalPlan.deleteLabel, role: .destructive) { confirmingDelete = true }
                }
                .dsText(.footnote)
                .foregroundStyle(ds.inkSoft)
                HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) {
                    AILabelView()
                    Text(RehearsalPlan.footer).dsText(.caption).foregroundStyle(ds.inkSoft)
                }
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .task {
            guard focusPhrases else { return }
            // The entry row is not in the accessibility tree on the first frame, so focus it after a short hop.
            try? await Task.sleep(nanoseconds: 350_000_000)
            phrasesFocused = true
            onFocusedPhrases()
        }
        .alphonsoChoiceDialog("Delete this rehearsal?", isPresented: $confirmingDelete) {
            Button("Yes, delete it", role: .destructive) {
                Task {
                    if let failure = await model.delete(id: rehearsal.id) { error = failure } else { onDeleted() }
                }
            }
            Button("Keep it", role: .cancel) {}
        }
    }

    private func stageRow(_ stage: RehearsalStage, _ row: RehearsalPlan.StageRow) -> some View {
        RehearsalCard {
            HStack(spacing: AlphonsoDS.Space.s3) {
                ZStack {
                    Circle().fill(row == .done ? ds.rightTint : ds.sunk).frame(width: 32, height: 32)
                    if row == .done {
                        Image(systemName: "checkmark").foregroundStyle(ds.rightInk)
                    } else {
                        Text("\(stage.number)").dsText(.footnote).foregroundStyle(ds.ink)
                    }
                }
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(stage.label).dsText(.headline).foregroundStyle(ds.ink)
                    Text(row == .done ? "Done \u{00B7} you can repeat it" : "\(stage.blurb) \u{00B7} about \(stage.minutes) min")
                        .dsText(.caption).foregroundStyle(row == .done ? ds.rightInk : ds.inkSoft)
                    if RehearsalPlan.showsHardModeDone(stage: stage, state: model.state) {
                        Text(RehearsalPlan.hardModeDoneLabel).dsText(.caption).foregroundStyle(ds.rightInk)
                    }
                }
                Spacer(minLength: AlphonsoDS.Space.s2)
                if row == .next {
                    Button("Next") { onStart(stage) }.buttonStyle(.alphonsoPrimary)
                } else {
                    Button(row == .done ? "Repeat" : "Start") { onStart(stage) }.buttonStyle(.alphonsoSecondary)
                }
            }
        }
        .accessibilityElement(children: .contain)
    }
}

// MARK: - The run: the call and its debrief

struct RehearsalRunView: View {
    let model: RehearsalModel
    let rehearsal: Rehearsal
    let stage: RehearsalStage
    let course: Course
    let session: Session
    /// Who plays the partner, and whether it is hard mode: chosen before the call, sent on every turn of it.
    var persona: RehearsalPersona = .alphonso
    var hardMode = false
    let onPaywall: () -> Void
    /// 402 `pro_required` on the call's first turn: the learner is not Pro, so the plain Pro paywall opens.
    var onProRequired: () -> Void = {}
    let onRunStage: (RehearsalStage) -> Void
    let onPlan: () -> Void

    private enum Phase { case calling, finishing, debrief(RehearsalDebrief.Outcome), notSaved }

    @State private var phase: Phase = .calling
    @State private var callId = UUID().uuidString
    @State private var startedAt = Date()
    @State private var elapsed = 0
    @State private var conversation = ConversationSnapshot()
    @State private var voice = VoiceSessionController(handsFreeTuning: .practice)
    @State private var replyVerdict = AvatarReplyVerdict()
    @State private var notice: String?
    @State private var cefrLevel: String?
    @State private var pendingTurns = 0
    @State private var ending = false
    @State private var openerCue = 0
    @State private var initialized = false
    @State private var recapModel = CallRecapModel()
    /// How long the learner took to start each reply, sent with the recap so the debrief can note long pauses.
    @State private var replyLatency = ReplyLatencyTracker()
    @State private var rehearsalSpeaking: RehearsalSpeaking?
    /// The stage's latest finished run before this call, so a debrief is only built from a run this call made.
    @State private var previousFinishedAt: String?
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.alphonsoDS) private var ds

    private var source: CallSource {
        RehearsalPartner.source(rehearsalId: rehearsal.id, stage: stage, persona: persona, hardMode: hardMode)
    }

    var body: some View {
        Group {
            switch phase {
            case .calling: callScreen
            case .finishing:
                VStack(spacing: AlphonsoDS.Space.s3) {
                    ProgressView("Writing your debrief\u{2026}").tint(ds.choice)
                    Text("\(persona.displayName) (AI) is going over the conversation.").dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .debrief(let outcome): RehearsalDebriefView(outcome: outcome, stage: stage, persona: persona,
                                                              speaking: rehearsalSpeaking,
                                                              language: RehearsalSpeaking.languageName(courseCode: course.wireCode),
                                                              courseCode: course.wireCode,
                                                              onRunStage: onRunStage, onPlan: onPlan)
            case .notSaved:
                VStack(spacing: AlphonsoDS.Space.s3) {
                    Text("We could not save that run. Check your connection and try again.")
                        .dsText(.footnote).foregroundStyle(ds.wrongInk).multilineTextAlignment(.center)
                    Button("Run this stage again") { onRunStage(stage) }.buttonStyle(.alphonsoPrimary)
                    Button("Back to the plan") { onPlan() }.buttonStyle(.alphonsoSecondary)
                }
                .padding(AlphonsoDS.Space.gutter)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .aiDisclosureGate()
        .task(id: openerCue) {
            guard openerCue > 0, !ending else { return }
            await voice.speakOpener(
                conversation.pendingOpener, session: session, course: course, speaker: persona.voiceCharacter)
            voice.applyStoredHandsFreePreference(sceneActive: scenePhase == .active)
        }
        .onAppear {
            guard !initialized else { return }
            initialized = true
            previousFinishedAt = RehearsalPlan.latestRun(model.state?.runs ?? [], stage: stage, hardMode: hardMode)?.finishedAt
            // The stage's fixed opening line, spoken by Alphonso; it is never sent to the server as his words.
            conversation.appendOpener(stage.opener(course: course.wireCode))
            voice.onCapture = { capture in await handle(capture) }
            voice.appeared()
            openerCue += 1
        }
        .onDisappear {
            voice.disappeared()
            voice.onCapture = nil
        }
        .task { cefrLevel = await loadCefrLevel() }
    }

    private var callScreen: some View {
        PracticeCallView(
            title: stage.label, kit: persona == .hector ? .hector : .alphonso,
            talkLabel: persona == .hector ? "Hold to talk to Hector" : "Hold to talk",
            scenarioID: "rehearsal", voice: voice, course: course,
            turns: conversation.turns, replyVerdict: replyVerdict, notice: notice,
            onPress: {
                if ending { return }
                var partnerWasSpeaking = false
                if case .speaking = voice.phase { partnerWasSpeaking = true }
                if voice.pressBegan() {
                    notice = nil
                    // Hold to talk: the press is when the learner starts (a press over the partner's voice measures
                    // nothing). In hands-free the first voice activity is (below).
                    replyLatency.pressBegan(atMs: MonotonicClock.nowMs(), partnerWasSpeaking: partnerWasSpeaking,
                                            handsFree: voice.isHandsFreeOn)
                }
            },
            onEnd: { Task { await finishCall() } },
            rehearsalHeader: RehearsalCallHeaderInfo(
                title: rehearsal.kind?.callTitle ?? RehearsalEventKind.other.callTitle,
                subline: RehearsalCallHeader.subline(stage: stage, persona: persona, hardMode: hardMode), filled: RehearsalCallHeader.filledSegments(stage: stage)),
            sheet: {
                VStack(spacing: CGFloat.zero) {
                    HandsFreeSwitch(voice: voice, partner: persona.displayName)
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                            ForEach(Array(conversation.turns.enumerated()), id: \.offset) { index, turn in
                                Text(turn.content)
                                    .dsText(.body)
                                    .foregroundStyle(turn.role == "user" ? ds.onChoice : ds.ink)
                                    .padding(.horizontal, AlphonsoDS.Space.s4)
                                    .padding(.vertical, AlphonsoDS.Space.s3)
                                    .background(turn.role == "user" ? ds.choice : ds.card,
                                                in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))
                                    // Alphonso's replies can be reported; the fixed opening line and the learner's turns cannot.
                                    .reportableAIMessage(
                                        turn.content, enabled: turn.role == "assistant" && !conversation.openerIndices.contains(index),
                                        surface: .conversation, course: course.wireCode, scenarioID: "rehearsal", session: session)
                                    .frame(maxWidth: .infinity, alignment: turn.role == "user" ? .trailing : .leading)
                            }
                        }
                        .padding(AlphonsoDS.Space.gutter)
                    }
                }
            }
        )
        .toolbar(.hidden, for: .tabBar)
        .onChange(of: voice.handsFreeStatus) { _, new in
            if new == .listening { notice = nil }
            // Hands-free presses for the learner the moment listening opens; speech detected is when they start.
            if new == .hearing { replyLatency.voiceHeard(atMs: MonotonicClock.nowMs()) }
            // Paused or switched off: what was being heard will not become a reply.
            if new == .off { replyLatency.listeningStopped() }
            if case .paused = new { replyLatency.listeningStopped() }
        }
        // The partner's voice finishing on its own starts the learner's thinking time; a press that never produces a
        // capture (mic refused, recorder failed, a cancelled turn) throws its start away. The rules live in the Kit.
        .onChange(of: voice.phase) { old, new in
            replyLatency.phaseChanged(from: old, to: new, atMs: MonotonicClock.nowMs())
        }
    }

    // MARK: Turns

    private func handle(_ capture: VoiceCapture) async {
        switch capture {
        case .tooShort:
            replyLatency.attemptFailed()   // nothing was sent: the retry measures its own start
            notice = voice.isHandsFreeOn ? nil : "Didn't catch that. Hold the button while you speak."
        case let .audio(audio, generation, debugTiming):
            await runTurn(audio: audio, generation: generation, debugTiming: debugTiming)
        }
    }

    private func runTurn(audio: Data, generation: Int, debugTiming: String) async {
        guard !ending else { return }
        pendingTurns += 1
        defer { pendingTurns -= 1 }
        guard let accessToken = await session.freshAccessToken() else {
            replyLatency.attemptFailed()
            voice.fail(generation, session.accessToken == nil ? .signedOut : .network)
            return
        }
        let client = AIConversationClient(
            baseURL: AppConfig.apiBaseURL, accessToken: { accessToken },
            refreshAccessToken: { await session.freshAccessToken(forceRefresh: true) })
        do {
            let result = try await client.transcribe(
                audio: audio, mimeType: "audio/m4a", course: course.wireCode, debugTiming: debugTiming)
            guard !result.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                replyLatency.attemptFailed()
                if voice.isHandsFreeOn { voice.handsFreeHeardNoWords() } else { notice = "Didn't catch that \u{2014} try again." }
                return
            }
            await sendReply(result.text, confidence: result.confidence, generation: generation, client: client)
        } catch {
            replyLatency.attemptFailed()
            voice.fail(generation, TutorError.from(error))
        }
    }

    private func sendReply(_ text: String, confidence: Double?, generation: Int, client: AIConversationClient) async {
        do {
            conversation.turns.append(ChatMessage(role: "user", content: text))
            voice.transcribed(generation)
            // The rehearsal's id and stage, and the same partner and hard mode on every turn (the server binds them to the
            // call on its first turn): the server builds the prompt from the stored rehearsal.
            let chat = try await client.chatReply(
                source: source, messages: source.sendableTurns(conversation), systemPrompt: nil, cefrLevel: cefrLevel,
                course: nil, callId: callId)
            // Transcribed and answered: only now does this reply's gap count (a failed chat drops it, below).
            replyLatency.replySent()
            conversation.turns.append(ChatMessage(role: "assistant", content: chat.content))
            replyVerdict = AvatarReplyVerdict(serial: replyVerdict.serial + 1, verdict: chat.verdict)
            do {
                // Hector speaks with his own voice (Settings > Voices) and `character: "hector"`; Alphonso is unchanged.
                let speech = try await client.synthesizeSpeech(
                    text: chat.content, voice: VoicePrefsCache().voice(persona.voiceCharacter, course: course.wireCode),
                    course: course.wireCode, character: persona.voiceCharacter)
                if !voice.play(speech, generation: generation) {
                    replyLatency.clearPartnerClock()   // no partner voice to wait for
                    notice = "Got a reply, but couldn't play it back."
                }
            } catch {
                replyLatency.clearPartnerClock()
                voice.replyWithoutAudio(generation)
                notice = "Got a reply, but couldn't play it back."
            }
        } catch {
            replyLatency.clearPartnerClock()   // the chat failed: this reply's entry is dropped, and no partner voice follows
            let failure = TutorError.from(error)
            // The turn did not reach the partner: take it out, so a retry (503 retry included) never sends two user
            // messages in a row. The learner simply says it again.
            if conversation.turns.last == ChatMessage(role: "user", content: text) { conversation.turns.removeLast() }
            // The free rehearsal's runs are used up: the Pro sheet, with the learner's turn left where it was. Hector or hard
            // mode without Pro (pro_required) is a different refusal: the plain Pro paywall, and its own words.
            if failure == .notEntitled { onPaywall() }
            if failure == .proRequired { onProRequired() }
            voice.fail(generation, failure)
            notice = failure == .notEntitled ? RehearsalError.paywall.userMessage : failure.userMessage()
        }
    }

    private func loadCefrLevel() async -> String? {
        guard let accessToken = session.accessToken else { return nil }
        let client = ProgressSyncClient(
            supabaseURL: AppConfig.supabaseURL, anonKey: AppConfig.supabasePublishableKey, accessToken: accessToken)
        return (try? await client.fetchCefrLevel(course: course.wireCode)) ?? nil
    }

    // MARK: Finish

    private func finishCall() async {
        guard !ending else { return }
        ending = true
        voice.disappeared()
        while pendingTurns > 0 { try? await Task.sleep(for: .milliseconds(50)) }
        elapsed = Int(Date().timeIntervalSince(startedAt))
        let learnerReplies = conversation.turns.filter { $0.role == "user" }.count
        // Nothing said: nothing to keep, straight back to the plan.
        if learnerReplies == 0 { onPlan(); return }
        phase = .finishing
        do {
            // Finishing the call is what lets the server count it as a run; a rehearsal has no stars to show.
            _ = try await practiceClient(session).finishPractice(callId: callId)
        } catch {
            phase = .notSaved
            return
        }
        recapModel = CallRecapModel()
        recapModel.start(session: session, callId: callId, transcript: source.sendableTurns(conversation),
                         cefrLevel: cefrLevel, scene: nil, replyLatenciesMs: replyLatency.values)
        // The server writes the run's memory when the recap finishes; wait for it, then read the state again.
        while recapModel.status == .pending { try? await Task.sleep(for: .milliseconds(300)) }
        await model.refresh()
        let added = (recapModel.status == .ready && recapModel.recap?.saved == true) ? (recapModel.recap?.reviewCount ?? 0) : 0
        rehearsalSpeaking = recapModel.rehearsalSpeaking
        phase = .debrief(RehearsalDebrief.make(
            stage: stage, kind: rehearsal.kind, runs: model.state?.runs ?? [], previousFinishedAt: previousFinishedAt,
            seconds: elapsed, turns: conversation.turns.count - conversation.openerIndices.count, addedToFix: added,
            hardMode: hardMode))
    }
}

// MARK: - Debrief

struct RehearsalDebriefView: View {
    let outcome: RehearsalDebrief.Outcome
    let stage: RehearsalStage
    var persona: RehearsalPersona = .alphonso
    var speaking: RehearsalSpeaking?
    var language: String = "English"
    /// The course's wire code: the pause note's filler ("Let me think…") comes in the course's own language.
    var courseCode: String = "en"
    let onRunStage: (RehearsalStage) -> Void
    let onPlan: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
                switch outcome {
                case .noRun:
                    Text("That one was too short to count").dsText(.title).foregroundStyle(ds.ink)
                    Text("Say a few more things next time and \(persona.displayName) (AI) can write you a debrief. Nothing was lost.")
                        .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    Button(RehearsalDebrief.againLabel) { onRunStage(stage) }.buttonStyle(.alphonsoPrimary(fullWidth: true))
                    Button("Back to the plan") { onPlan() }.buttonStyle(.alphonsoSecondary(fullWidth: true))
                case .debrief(let d):
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        Text(d.heading).dsText(.overline).foregroundStyle(ds.actionText)
                        Text(d.headline).dsText(.title).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
                        Text(d.stats).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    }
                    if let speaking, !speaking.notes.isEmpty { speakingCard(speaking) }
                    if !d.wentWell.isEmpty { listCard("What went well", d.wentWell, tint: ds.rightInk) }
                    if !d.tryAgain.isEmpty { listCard("Try again next time", d.tryAgain, tint: ds.heartText) }
                    if let fix = d.fixLine {
                        RehearsalCard {
                            Text(RehearsalDebrief.fixTitle).dsText(.headline).foregroundStyle(ds.heartText)
                            Text(fix).dsText(.footnote).foregroundStyle(ds.inkSoft)
                        }
                    }
                    Button(RehearsalPlan.nextButton(d.nextStage)) { onRunStage(d.nextStage) }
                        .buttonStyle(.alphonsoPrimary(fullWidth: true))
                    Button(RehearsalDebrief.againLabel) { onRunStage(stage) }
                        .buttonStyle(.alphonsoSecondary(fullWidth: true))
                    Button("Back to the plan") { onPlan() }
                        .dsText(.footnote).foregroundStyle(ds.inkSoft).frame(minHeight: AlphonsoDS.Space.minTouch)
                    HStack(alignment: .top, spacing: AlphonsoDS.Space.s2) {
                        AILabelView()
                        Text(RehearsalDebrief.footer(persona: persona)).dsText(.caption).foregroundStyle(ds.inkSoft)
                    }
                }
            }
            .padding(AlphonsoDS.Space.gutter)
        }
    }

    /// "How you spoke": up to three plain sentences, each with a small decorative arrow against last time. Neutral ink
    /// throughout, no score, no percentage, never red.
    private func speakingCard(_ speaking: RehearsalSpeaking) -> some View {
        RehearsalCard {
            Text("How you spoke").dsText(.headline).foregroundStyle(ds.choice).accessibilityAddTraits(.isHeader)
            ForEach(speaking.notes) { note in
                HStack(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s2) {
                    Image(systemName: note.arrowSymbol ?? "circle.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(ds.inkSoft)
                        .opacity(note.arrowSymbol == nil ? 0.35 : 1)
                        .frame(width: 18)
                        .accessibilityHidden(true)
                    Text(note.sentence(language: language, courseCode: courseCode)).dsText(.footnote).foregroundStyle(ds.ink)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(note.sentence(language: language, courseCode: courseCode))
            }
        }
    }

    private func listCard(_ title: String, _ lines: [String], tint: Color) -> some View {
        RehearsalCard {
            Text(title).dsText(.headline).foregroundStyle(tint)
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line).dsText(.footnote).foregroundStyle(ds.ink)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - How did it go?

struct RehearsalOutcomeView: View {
    let model: RehearsalModel
    let rehearsal: Rehearsal
    let onDone: () -> Void

    @State private var moving = false
    @State private var newDate = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var error: RehearsalError?
    @Environment(\.alphonsoDS) private var ds

    private var newDay: String { RehearsalDates.string(from: newDate) }

    var body: some View {
        let today = RehearsalDates.string(from: Date())
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                Text("How did it go?").dsText(.title).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
                Text("\(RehearsalDates.long(today) ?? "") \u{00B7} \(rehearsal.eventLabel)").dsText(.footnote).foregroundStyle(ds.inkSoft)
                if moving { movedBody } else { tapsBody }
                RehearsalErrorLine(error: error)
                Text(RehearsalOutcomeChoice.footer).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .padding(AlphonsoDS.Space.gutter)
        }
    }

    private var tapsBody: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text("How did your \((rehearsal.kind?.label ?? "event").lowercased()) go?").dsText(.headline).foregroundStyle(ds.ink)
            HStack(spacing: AlphonsoDS.Space.s2) {
                AILabelView()
                Text("One tap is enough. Alphonso (AI) will remember it.").dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            ForEach(RehearsalOutcomeChoice.allCases, id: \.self) { choice in
                Button { tap(choice) } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(choice.title).dsText(.headline).foregroundStyle(ds.ink)
                        if let hint = choice.hint { Text(hint).dsText(.caption).foregroundStyle(ds.inkSoft) }
                    }
                    .padding(AlphonsoDS.Space.s3)
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                    .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .disabled(model.busy)
            }
        }
    }

    private var movedBody: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            Text(RehearsalOutcomeChoice.movedTitle).dsText(.headline).foregroundStyle(ds.ink)
            Text("Your rehearsal continues. Stage 2 comes back before the new date.").dsText(.footnote).foregroundStyle(ds.inkSoft)
            DatePicker("New date", selection: $newDate, in: (Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date())..., displayedComponents: .date)
                .datePickerStyle(.graphical).labelsHidden().tint(ds.action)
            Button(RehearsalOutcomeChoice.moveButton(newDay)) { Task { await finish { await model.outcome(id: rehearsal.id, choice: .moved, newDate: newDay) } } }
                .buttonStyle(.alphonsoPrimary(fullWidth: true))
                .disabled(model.busy)
            Button(RehearsalOutcomeChoice.closeButton) { Task { await finish { await model.cancel(id: rehearsal.id) } } }
                .dsText(.footnote).foregroundStyle(ds.inkSoft).frame(minHeight: AlphonsoDS.Space.minTouch)
                .disabled(model.busy)
        }
    }

    private func tap(_ choice: RehearsalOutcomeChoice) {
        if choice == .moved { moving = true; return }
        Task { await finish { await model.outcome(id: rehearsal.id, choice: choice) } }
    }

    private func finish(_ run: () async -> RehearsalError?) async {
        error = nil
        if let failure = await run() { error = failure } else { onDone() }
    }
}

// MARK: - The Pro sheet

/// "Rehearsals are part of Pro": what the learner already did, what stays free, and two equal ways out. "See Pro" opens
/// the existing Pro paywall with the source `rehearsal_entry`.
struct RehearsalPaywallSheet: View {
    let copy: RehearsalPaywallCopy
    let entitlementStore: EntitlementStore?
    let onClose: () -> Void

    @State private var showingPro = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        if showingPro, let entitlementStore {
            PaywallView(entitlementStore: entitlementStore, source: .rehearsalEntry, onClose: onClose)
        } else {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                Text(copy.title).dsText(.title).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
                Text(copy.subtitle).dsText(.headline).foregroundStyle(ds.ink)
                Text(copy.body).dsText(.footnote).foregroundStyle(ds.inkSoft)
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    ForEach(copy.stays, id: \.self) { line in Text(line).dsText(.footnote).foregroundStyle(ds.ink) }
                }
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Button(copy.primary) { showingPro = true }.buttonStyle(.alphonsoPrimary(fullWidth: true))
                        .disabled(entitlementStore == nil)
                    Button(copy.secondary) { onClose() }.buttonStyle(.alphonsoSecondary(fullWidth: true))
                }
                Text(copy.note).dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .padding(AlphonsoDS.Space.gutter)
            .frame(maxHeight: .infinity, alignment: .top)
            .background(ds.surface)
            .presentationDetents([.medium, .large])
        }
    }
}

// MARK: - Learn: the hero and the Today row

/// On the event day the 2-minute warm-up takes the Learn hero, for that day only.
struct RehearsalHeroCard: View {
    let item: PathPinned
    let onStart: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            Text(RehearsalLearnEntry.heroTitle(kind: item.rehearsalKind)).dsText(.overline).foregroundStyle(ds.onHeroKick)
            Text(RehearsalLearnEntry.heroSubtitle).dsText(.title).foregroundStyle(ds.onHero)
            Text(RehearsalLearnEntry.heroLine).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
            Button(RehearsalLearnEntry.heroButton) { onStart() }
                .buttonStyle(.alphonsoPrimary)
                .padding(.top, AlphonsoDS.Space.s2)
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
        .padding(.horizontal, AlphonsoDS.Space.gutter)
        .padding(.vertical, AlphonsoDS.Space.s2)
        .accessibilityElement(children: .contain)
    }
}

/// The pinned rehearsal item, first in Today and highlighted so it is the first thing seen. The server's words.
struct RehearsalPinnedRow: View {
    let item: PathPinned
    let onOpen: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 0) {
                Text(item.title).dsText(.headline).foregroundStyle(ds.ink)
                Text(item.minutes > 0 ? "\(item.subtitle) \u{00B7} \(item.minutes) min" : item.subtitle)
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.flameTint))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(item.title). \(item.subtitle)")
    }
}
