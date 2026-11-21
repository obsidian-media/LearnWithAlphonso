import SwiftUI
import LearnWithAlphonsoKit

/// Learn's climbing map ("Path B", PARITY-SPEC-6): one unit as a climb up a night hill. The unit strip sits on top, the
/// lessons wind up the trail from the foot (done green, the next one gold and bobbing, the rest locked), the unit's
/// reward chest crowns the summit, and Alphonso waits at the trailhead. Once a unit is finished its earned chest sits at
/// the foot of the next climb. Tapping the next lesson lifts a start sheet.
///
/// Every position comes from the shared model (`LearnMap.climb` in the Kit), which web and Android draw from too. This
/// file only draws it. It replaces the old hero (LearnHeroStage); the unit list below it stays as the long-form way in.
/// Matches src/components/LearnMap.tsx.
struct LearnClimbMap: View {
    let climb: LearnMap.Climb
    let greeting: String
    /// The course-wide Continue lesson (the learner's first lesson not done in the whole course), or nil. The map is one
    /// level's climb: when its next lesson is not that one, the sheet says "Start lesson", never "Continue".
    let continueLessonID: String?
    let onOpenLesson: (String) -> Void

    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var sheetOpen = false
    /// A lesson chosen in the sheet; opened once the sheet has finished closing, so the push is not lost to the dismissal.
    @State private var pendingStart: String?
    @State private var hint: String?

    /// Room above the summit (for the chest) and below the foot (for the trailhead chest and the Start pill).
    private static let topRoom: CGFloat = 44
    private static let footRoom: CGFloat = 52
    /// Where a finished unit's chest sits at the foot of the next climb: left of the first lesson, at the very bottom.
    private static let trailheadX: CGFloat = 0.15
    private static let trailheadY: CGFloat = 1
    private static let hintSeconds: UInt64 = 6

    /// Tall enough per slot that nodes never touch, and never shorter than a phone's first screen of map.
    private var climbHeight: CGFloat {
        let slots = CGFloat(climb.nodes.count + 1)
        return max(360, slots * 88 + Self.topRoom + Self.footRoom)
    }

    private var total: Int { climb.nodes.count }
    private var showsAlphonso: Bool { !dynamicTypeSize.isAccessibilitySize }

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            VStack(spacing: 0) {
                strip
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.top, AlphonsoDS.Space.s3)
                if !showsAlphonso {
                    greetingBubble
                        .padding(.horizontal, AlphonsoDS.Space.s3)
                        .padding(.top, AlphonsoDS.Space.s2)
                }
                climbArea
                    .frame(height: climbHeight)
            }
            .background { scene }
            .clipShape(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))

            Text(hint ?? "")
                .dsText(.footnote)
                .foregroundStyle(ds.inkSoft)
                .frame(maxWidth: .infinity, minHeight: 20, alignment: .leading)
                .padding(.horizontal, AlphonsoDS.Space.s1)
                .accessibilityHidden(hint == nil)
        }
        .padding(.horizontal, AlphonsoDS.Space.gutter)
        .padding(.vertical, AlphonsoDS.Space.s2)
        // The "finish X first" hint is about this moment: it clears after a few seconds, and at once when the next
        // lesson changes, so the status line never holds a stale instruction.
        .onChange(of: climb.next?.lessonID) { _, _ in hint = nil }
        .task(id: hint) {
            guard hint != nil else { return }
            try? await Task.sleep(nanoseconds: Self.hintSeconds * 1_000_000_000)
            if !Task.isCancelled { hint = nil }
        }
        .sheet(isPresented: $sheetOpen, onDismiss: {
            if let id = pendingStart {
                pendingStart = nil
                onOpenLesson(id)
            }
        }) {
            if let next = climb.next {
                ClimbStartSheet(
                    overline: "Unit \(climb.strip.number) \u{00B7} Lesson \(lessonNumber(of: next.lessonID))",
                    sheet: next,
                    ctaLabel: next.lessonID == continueLessonID ? "Continue lesson" : "Start lesson",
                    onStart: {
                        pendingStart = next.lessonID
                        sheetOpen = false
                    },
                    onClose: { sheetOpen = false }
                )
            }
        }
    }

    private func lessonNumber(of lessonID: String) -> Int {
        (climb.nodes.firstIndex { $0.id == lessonID } ?? 0) + 1
    }

    /// Shows the hint and says it aloud, so VoiceOver users hear why the tap did nothing.
    private func showHint(_ message: String) {
        hint = message
        AccessibilityNotification.Announcement(message).post()
    }

    // MARK: Strip

    private var strip: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AlphonsoDS.Space.s1))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s3))
        return VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            layout {
                Text("Unit \(climb.strip.number) of \(climb.strip.count) \u{00B7} \(climb.strip.name)")
                    .dsText(.headline)
                    .foregroundStyle(ds.onHero)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
                Text("\(climb.strip.done) / \(climb.strip.total)")
                    .dsText(.caption)
                    .monospacedDigit()
                    .foregroundStyle(ds.onHeroSoft)
                    .accessibilityHidden(true)
            }
            progressBar
        }
        .padding(.horizontal, AlphonsoDS.Space.s3)
        .padding(.vertical, AlphonsoDS.Space.s2 + 2)
        .background(ds.onHero.opacity(0.1), in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                .strokeBorder(ds.onHero.opacity(0.15), lineWidth: 1)
        )
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(ds.heroB.opacity(0.6))
                Capsule()
                    .fill(LinearGradient(colors: [ds.onHeroKick, ds.action], startPoint: .leading, endPoint: .trailing))
                    .frame(width: geo.size.width * CGFloat(min(max(climb.strip.progress, 0), 1)))
            }
        }
        .frame(height: 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Unit progress")
        .accessibilityValue("\(climb.strip.done) of \(climb.strip.total) lessons done")
    }

    // MARK: Scene (decoration only)

    private static let stars: [(x: CGFloat, y: CGFloat)] = [(0.18, 0.08), (0.72, 0.05), (0.54, 0.12), (0.33, 0.04), (0.86, 0.14)]

    private var scene: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .top, endPoint: .bottom)
                // A gold glow over the summit.
                RadialGradient(colors: [ds.onHeroKick.opacity(0.4), Color.clear], center: .center, startRadius: 0, endRadius: geo.size.width * 0.5)
                    .frame(width: geo.size.width, height: 190)
                    .offset(y: -40)
                // Layered hills at the foot.
                Ellipse().fill(ds.heroB.opacity(0.7))
                    .frame(width: geo.size.width * 1.2, height: 190)
                    .offset(x: -geo.size.width * 0.1, y: geo.size.height - 110)
                Ellipse().fill(ds.heroB.opacity(0.5))
                    .frame(width: geo.size.width, height: 140)
                    .offset(x: -geo.size.width * 0.3, y: geo.size.height - 150)
                Ellipse().fill(ds.heroB.opacity(0.45))
                    .frame(width: geo.size.width * 0.9, height: 140)
                    .offset(x: geo.size.width * 0.4, y: geo.size.height - 100)
                ForEach(0..<Self.stars.count, id: \.self) { i in
                    Circle().fill(ds.onHero.opacity(0.7))
                        .frame(width: 3, height: 3)
                        .offset(x: geo.size.width * Self.stars[i].x, y: geo.size.height * Self.stars[i].y)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
        .accessibilityHidden(true)
    }

    // MARK: The climb

    private var climbArea: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let boxHeight = max(geo.size.height - Self.topRoom - Self.footRoom, 1)
            let spot: (Double, Double) -> CGPoint = { x, y in
                CGPoint(x: CGFloat(x) * width, y: Self.topRoom + CGFloat(y) * boxHeight)
            }
            let trailheadSpot = spot(Double(Self.trailheadX), Double(Self.trailheadY))
            let points = trailPoints(spot: spot, includeTrailhead: hasTrailheadChest, trailheadSpot: trailheadSpot)

            ZStack {
                // Decoration: the wide soft trail and the dotted line along it.
                trail(points)
                    .stroke(ds.onHero.opacity(0.15), style: StrokeStyle(lineWidth: 18, lineCap: .round, lineJoin: .round))
                    .accessibilityHidden(true)
                trail(points)
                    .stroke(ds.onHeroKick.opacity(0.6), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round, dash: [1, 12]))
                    .accessibilityHidden(true)

                // The climb, read from the foot to the summit: highest sort priority first, the foot being at the bottom.
                ZStack {
                    if hasTrailheadChest {
                        earnedChestBadge(size: 48, iconSize: 24)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("Unit \(climb.strip.number - 1) reward, earned")
                            .accessibilityAddTraits(.isImage)
                            .accessibilitySortPriority(Double(total + 3))
                            .position(trailheadSpot)
                    }
                    ForEach(Array(climb.nodes.enumerated()), id: \.element.id) { index, node in
                        lessonNode(node, index: index)
                            .accessibilitySortPriority(Double(total + 2 - index))
                            .position(spot(node.point.x, node.point.y))
                    }
                    summitChest
                        .accessibilitySortPriority(2)
                        .position(spot(climb.chest.point.x, climb.chest.point.y))
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Unit \(climb.strip.number) climb, from the foot to the summit")

                if showsAlphonso {
                    alphonso(width: width)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                        .accessibilitySortPriority(1)
                }
            }
            .frame(width: width, height: geo.size.height)
        }
    }

    private var hasTrailheadChest: Bool {
        if case .earnedChest = climb.trailhead { return true }
        return false
    }

    /// The trail runs from the trailhead chest (when there is one) through every lesson to the summit chest.
    private func trailPoints(spot: (Double, Double) -> CGPoint, includeTrailhead: Bool, trailheadSpot: CGPoint) -> [CGPoint] {
        var points: [CGPoint] = includeTrailhead ? [trailheadSpot] : []
        for node in climb.nodes { points.append(spot(node.point.x, node.point.y)) }
        points.append(spot(climb.chest.point.x, climb.chest.point.y))
        return points
    }

    private func trail(_ points: [CGPoint]) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            for point in points.dropFirst() { path.addLine(to: point) }
        }
    }

    // MARK: Nodes

    private func stateWord(_ state: UnitPathState) -> String {
        switch state {
        case .done: return "done"
        case .next: return "next"
        case .locked: return "locked"
        }
    }

    @ViewBuilder
    private func lessonNode(_ node: LearnMap.Node, index: Int) -> some View {
        let label = "Lesson \(index + 1) of \(total), \(node.title), \(stateWord(node.state))"
        switch node.state {
        case .next:
            Button {
                hint = nil
                sheetOpen = true
            } label: {
                // The face bobs inside a still button: the tap target never moves under a finger.
                ClimbNextFace(title: node.title)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
        case .done:
            // A done lesson can be played again, as from the unit list.
            Button { onOpenLesson(node.id) } label: { doneFace }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isButton)
        case .locked:
            Button {
                if let upNext = climb.nodes.first(where: { $0.state == .next }) {
                    showHint("Finish \(upNext.title) first, then this one opens.")
                } else {
                    showHint("Finish the lessons before it first.")
                }
            } label: { lockedFace }
                .buttonStyle(.plain)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isButton)
        }
    }

    private var doneFace: some View {
        DSIconView(icon: .check, size: 24)
            .foregroundStyle(ds.onRight)
            .frame(width: 56, height: 56)
            .background(Circle().fill(ds.right))
            .shadow(color: ds.rightEdge, radius: 0, x: 0, y: 6)
    }

    private var lockedFace: some View {
        DSIconView(icon: .lock, size: 24)
            .foregroundStyle(ds.inkFaint)
            .frame(width: 52, height: 52)
            .background(Circle().fill(ds.onHero.opacity(0.85)))
            .shadow(color: ds.onHero.opacity(0.4), radius: 0, x: 0, y: 5)
    }

    // MARK: Chests

    private func earnedChestBadge(size: CGFloat, iconSize: CGFloat) -> some View {
        DSIconView(icon: .chest, size: iconSize)
            .foregroundStyle(ds.onAction)
            .frame(width: size, height: size)
            .background(Circle().fill(RadialGradient(colors: [ds.actionHi, ds.action], center: UnitPoint(x: 0.36, y: 0.28), startRadius: 0, endRadius: size)))
            .shadow(color: ds.actionEdge, radius: 0, x: 0, y: 5)
            .overlay(alignment: .topTrailing) {
                DSIconView(icon: .check, size: 12)
                    .foregroundStyle(ds.onRight)
                    .frame(width: 20, height: 20)
                    .background(Circle().fill(ds.right))
                    .offset(x: 4, y: -4)
            }
    }

    @ViewBuilder
    private var summitChest: some View {
        if climb.chest.earned {
            earnedChestBadge(size: 56, iconSize: 28)
                .overlay(alignment: .top) { unitRewardLabel }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Unit \(climb.strip.number) reward, earned")
                .accessibilityAddTraits(.isImage)
        } else {
            Button {
                showHint("Finish this unit to open the chest.")
            } label: {
                DSIconView(icon: .chest, size: 28)
                    .foregroundStyle(ds.onHeroSoft)
                    .frame(width: 56, height: 56)
                    .background(Circle().fill(ds.onHero.opacity(0.25)))
                    .shadow(color: ds.heroB, radius: 0, x: 0, y: 6)
                    .overlay(alignment: .topTrailing) {
                        DSIconView(icon: .lock, size: 12)
                            .foregroundStyle(ds.onHeroSoft)
                            .frame(width: 20, height: 20)
                            .background(Circle().fill(ds.heroB))
                            .offset(x: 4, y: -4)
                    }
                    .overlay(alignment: .top) { unitRewardLabel }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Unit \(climb.strip.number) reward, locked until you finish the unit")
            .accessibilityAddTraits(.isButton)
        }
    }

    private var unitRewardLabel: some View {
        Text("Unit reward")
            .dsText(.overline)
            .foregroundStyle(ds.onHeroKick)
            .fixedSize()
            .alignmentGuide(.top) { d in d[.bottom] + 6 }
            .accessibilityHidden(true)
    }

    // MARK: Alphonso at the trailhead

    private var greetingBubble: some View {
        Text(greeting)
            .dsText(.caption)
            .foregroundStyle(ds.ink)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, AlphonsoDS.Space.s2 + 2)
            .padding(.vertical, AlphonsoDS.Space.s2)
            .background(ds.surface, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            .frame(maxWidth: .infinity, alignment: .trailing)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Alphonso: \(greeting)")
    }

    @MainActor
    private func alphonso(width: CGFloat) -> some View {
        let figure = min(width * 0.34, 144)
        return VStack(alignment: .trailing, spacing: AlphonsoDS.Space.s1) {
            greetingBubble
                .frame(width: figure)
            if let face = LessonArt.expression(.happy) {
                Image(uiImage: face)
                    .resizable()
                    .scaledToFit()
                    .frame(width: figure, height: figure)
                    .accessibilityHidden(true)
            }
        }
        .allowsHitTesting(false)
    }
}

/// The next lesson's gold face. Its bob lives here, on the face, and never on the button that wraps it. The bob is off
/// when Reduce Motion is on.
private struct ClimbNextFace: View {
    let title: String
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var bobbing = false

    var body: some View {
        face
            .offset(y: (bobbing && !reduceMotion) ? -6 : 0)
            .animation(reduceMotion ? nil : .easeInOut(duration: 1.8).repeatForever(autoreverses: true), value: bobbing)
            .onAppear { bobbing = true }
    }

    private var face: some View {
        DSIconView(icon: .play, size: 36)
            .foregroundStyle(ds.onAction)
            .frame(width: 80, height: 80)
            .background {
                ZStack {
                    Circle().fill(ds.onHero.opacity(0.3)).padding(-9)
                    Circle().fill(RadialGradient(colors: [ds.actionHi, ds.action], center: UnitPoint(x: 0.36, y: 0.28), startRadius: 0, endRadius: 80))
                }
            }
            .shadow(color: ds.actionEdge, radius: 0, x: 0, y: 8)
            .shadow(color: ds.action.opacity(0.55), radius: 18, x: 0, y: 0)
            .overlay(alignment: .top) {
                Text(title)
                    .dsText(.caption)
                    .foregroundStyle(ds.ink)
                    .lineLimit(1)
                    .frame(maxWidth: 176)
                    .padding(.horizontal, AlphonsoDS.Space.s2 + 2)
                    .padding(.vertical, AlphonsoDS.Space.s1)
                    .background(ds.surface, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key + 2, style: .continuous))
                    .fixedSize()
                    .alignmentGuide(.top) { d in d[.bottom] + 8 }
                    .accessibilityHidden(true)
            }
            .overlay(alignment: .bottom) {
                Text("Start")
                    .dsText(.overline)
                    .foregroundStyle(ds.actionText)
                    .padding(.horizontal, AlphonsoDS.Space.s3)
                    .padding(.vertical, AlphonsoDS.Space.s1)
                    .background(ds.surface, in: Capsule())
                    .fixedSize()
                    .alignmentGuide(.bottom) { d in d[.top] - 8 }
                    .accessibilityHidden(true)
            }
    }
}

/// The start sheet for the next lesson: its place, name, coverage, the time / XP / words chips, and the way in.
private struct ClimbStartSheet: View {
    let overline: String
    let sheet: LearnMap.StartSheet
    let ctaLabel: String
    let onStart: () -> Void
    let onClose: () -> Void

    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                Text(overline)
                    .dsText(.overline)
                    .foregroundStyle(ds.actionText)
                Text(sheet.title)
                    .dsText(.title)
                    .foregroundStyle(ds.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                if !sheet.coverage.isEmpty {
                    Text(sheet.coverage)
                        .dsText(.footnote)
                        .foregroundStyle(ds.inkSoft)
                        .fixedSize(horizontal: false, vertical: true)
                }
                // The chips wrap onto more rows as the text grows.
                LessonFlowLayout(spacing: AlphonsoDS.Space.s2) {
                    chip(icon: .clock, value: "\(sheet.minutes) min", label: "Time")
                    chip(icon: .bolt, value: "+\(sheet.xp)", label: "XP")
                    chip(icon: .words, value: "\(sheet.words)", label: "Words")
                }
                .padding(.top, AlphonsoDS.Space.s2)

                VStack(spacing: AlphonsoDS.Space.s2) {
                    Button(action: onStart) {
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            DSIconView(icon: .play, size: 20)
                            Text(ctaLabel).dsText(.headline)
                        }
                        .foregroundStyle(ds.onAction)
                        .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                        .background(ds.action, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
                        .background(
                            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                                .fill(ds.actionEdge)
                                .offset(y: 4)
                        )
                        .padding(.bottom, 4)
                    }
                    .buttonStyle(.plain)

                    Button(action: onClose) {
                        Text("Not now")
                            .dsText(.headline)
                            .foregroundStyle(ds.ink)
                            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
                            .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
                                    .strokeBorder(ds.line, lineWidth: 2)
                            )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.top, AlphonsoDS.Space.s3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(AlphonsoDS.Space.s5)
        }
        .background(ds.surface.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(ds.surface)
    }

    private func chip(icon: AlphonsoDS.Icon, value: String, label: String) -> some View {
        VStack(spacing: AlphonsoDS.Space.s1) {
            HStack(spacing: AlphonsoDS.Space.s1) {
                DSIconView(icon: icon, size: 16)
                    .foregroundStyle(ds.actionText)
                Text(value)
                    .dsText(.headline)
                    .foregroundStyle(ds.ink)
            }
            Text(label)
                .dsText(.caption)
                .foregroundStyle(ds.inkFaint)
        }
        .padding(.horizontal, AlphonsoDS.Space.s4)
        .padding(.vertical, AlphonsoDS.Space.s2 + 2)
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label), \(value)")
    }
}
