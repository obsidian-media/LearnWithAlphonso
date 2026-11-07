import SwiftUI
import LearnWithAlphonsoKit

/// The Profile redesign (visual round 6, part 4; the web's ProfileSections.tsx). Every number comes from
/// `ProfileOverviewData` (one batched read) through `ProfileMath`; no figure is typed into a view.
struct ProfileOverviewModel {
    let data: ProfileOverviewData
    let big: ProfileMath.BigNumbers
    let week: ProfileMath.Week
    let heat: ProfileMath.HeatMap
    let records: ProfileMath.Records
    let level: ProfileMath.LevelProgress
    let weak: (top: [ProfileWeakItem], total: Int)
    let hector: ProfileMath.HectorCard?
    let next: (achievement: Achievement, value: Int)?
    let unlockedCount: Int
    let league: ProfileMath.LeagueStatus
    let friends: [ProfileMath.FriendWeekRow]
    let flag: String?
    let name: String

    init(data: ProfileOverviewData, contentStore: ContentStore, course: Course, isPro: Bool) {
        self.data = data
        big = ProfileMath.bigNumbers(data) { id in
            contentStore.findLesson(id: id, course: course)
                .map { deriveVocab(lesson: $0.lesson, images: [:]).map(\.term) } ?? []
        }
        week = ProfileMath.weekRings(today: data.today, activity: data.activity, speech: data.speech)
        heat = ProfileMath.heatMap(today: data.today, rows: data.activity)
        records = ProfileMath.personalRecords(data)
        let mine = data.courses.first { $0.course == data.course }
        let completed = Set(data.completions.filter { $0.language == data.course }.map(\.lessonID))
        let cefr = mine?.cefrLevel ?? "A1"
        level = ProfileMath.levelProgress(
            cefr: cefr, units: contentStore.bundle(for: course).units.filter { $0.level == cefr }.map { $0.lessons.map(\.id) },
            completed: completed)
        weak = ProfileMath.weakSpots(data.weakItems)
        hector = ProfileMath.hectorCard(pro: isPro, weakItems: data.weakItems, weaknessEvents: data.weaknessEvents)
        let unlocked = Set(data.achievements.filter { $0.unlockedAt != nil }.map(\.id))
        unlockedCount = unlocked.count
        next = ProfileMath.nextAchievement(stats: ProfileMath.achievementStats(data), unlocked: unlocked, catalog: contentStore.achievements)
        league = ProfileMath.leagueStatus(tier: mine?.leagueTier ?? "bronze", courseXP: big.courseXP)
        name = (data.displayName?.isEmpty == false ? data.displayName : nil) ?? "Learner"
        flag = ProfileMath.flagEmoji(country: data.country)
        friends = ProfileMath.friendsWeek(
            data.friends, meName: name, meSeed: data.avatarSeed ?? "0",
            meWeekXP: ProfileMath.rollingWeekXP(today: data.today, activity: data.activity))
    }

    var hasAnyActivity: Bool { big.lessonsDone > 0 || big.courseXP > 0 }
}

private extension Course {
    var label: String {
        switch self {
        case .english: return "English"
        case .french: return "French"
        case .spanish: return "Spanish"
        }
    }
}

private func plural(_ n: Int, _ one: String, _ many: String) -> String { n == 1 ? one : many }

// MARK: Card shell

private struct ProfileCard<Content: View>: View {
    let title: String?
    @ViewBuilder var content: Content
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
            if let title {
                Text(title).dsText(.overline).foregroundStyle(ds.inkSoft).accessibilityAddTraits(.isHeader)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(AlphonsoDS.Space.s4)
        .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.card.opacity(0.92)))
        .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
    }
}

// MARK: Hero

struct ProfileHeroSection: View {
    let model: ProfileOverviewModel
    let course: Course
    let onCourse: (Course) -> Void
    let onPicture: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            HStack(spacing: AlphonsoDS.Space.s4) {
                Button(action: onPicture) {
                    ProfileAvatarView(seed: model.data.avatarSeed, name: model.name, size: 72)
                }
                .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
                .accessibilityLabel("Change picture")
                .accessibilityHint("Choose an animal or your initial")
                HStack(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s2) {
                    Text(model.name).dsText(.displayXL).foregroundStyle(ds.onHero)
                        .fixedSize(horizontal: false, vertical: true)
                    if let flag = model.flag {
                        Text(flag).dsText(.title).accessibilityLabel("Flag")
                    }
                }
                Spacer(minLength: 0)
            }
            Picker("Course", selection: Binding(get: { course }, set: onCourse)) {
                ForEach([Course.english, .french, .spanish], id: \.wireCode) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            numbers
        }
        .padding(AlphonsoDS.Space.s4)
        .background(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                .fill(LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .top, endPoint: .bottom)))
    }

    private var numbers: some View {
        let b = model.big
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            statTile(String(b.streak), "day streak", "Longest \(b.longestStreak)",
                 "\(b.streak) day streak, longest \(b.longestStreak)")
            statTile(String(b.courseXP), "XP in \(course.label)", "\(b.xpThisWeek) this week",
                 "\(b.courseXP) XP in \(course.label), \(b.xpThisWeek) this week")
            statTile(String(b.wordsLearned), "words learned", "\(b.savedWords) saved",
                 "\(b.wordsLearned) words learned, \(b.savedWords) saved")
            statTile(String(b.lessonsDone), plural(b.lessonsDone, "lesson done", "lessons done"),
                 b.accuracyPct.map { "\($0)% accuracy" } ?? "No lessons yet",
                 "\(b.lessonsDone) lessons done, " + (b.accuracyPct.map { "\($0) percent accuracy" } ?? "no lessons yet"))
        }
    }

    private func statTile(_ value: String, _ label: String, _ sub: String, _ spoken: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).dsText(.numeralXL).foregroundStyle(ds.onHero)
            Text(label).dsText(.footnote).foregroundStyle(ds.onHero)
            Text(sub).dsText(.caption).foregroundStyle(ds.onHeroSoft)
        }
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }
}

// MARK: Week, speech, heat map

struct ProfileWeekSection: View {
    let model: ProfileOverviewModel
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let week = model.week
        VStack(spacing: AlphonsoDS.Space.s3) {
            ProfileCard(title: "This week") {
                HStack {
                    ForEach(week.days, id: \.day) { d in
                        VStack(spacing: AlphonsoDS.Space.s1) {
                            ring(d.state)
                            Text(weekday(d.day)).dsText(.caption).foregroundStyle(ds.inkSoft)
                        }
                        .frame(maxWidth: .infinity)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(weekday(d.day, long: true)): \(stateWord(d.state))")
                    }
                }
                Text("\(week.activeDays) of 7 days active").dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
            ProfileCard(title: "Minutes spoken this week") {
                Text("\(week.minutesSpoken)").dsText(.numeral).foregroundStyle(ds.brand)
                    .accessibilityLabel("\(week.minutesSpoken) \(plural(week.minutesSpoken, "minute", "minutes")) spoken this week")
                if week.minutesSpoken == 0 {
                    Text("Speak in a lesson or with Hector and your minutes show up here.")
                        .dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
            }
        }
    }

    @ViewBuilder private func ring(_ s: ProfileMath.RingState) -> some View {
        let size = AlphonsoDS.Space.s8
        switch s {
        case .done:
            Circle().fill(ds.flame).frame(width: size, height: size)
                .overlay(DSIconView(icon: .check, size: 16).foregroundStyle(ds.onAction))
        case .today:
            Circle().strokeBorder(ds.flame, lineWidth: 3).frame(width: size, height: size)
        case .missed, .future:
            Circle().strokeBorder(ds.line, lineWidth: 3).frame(width: size, height: size)
        }
    }

    private func stateWord(_ s: ProfileMath.RingState) -> String {
        switch s {
        case .done: return "done"
        case .today: return "today, not yet"
        case .missed: return "not done"
        case .future: return "to come"
        }
    }

    private func weekday(_ day: String, long: Bool = false) -> String {
        let f = DateFormatter()
        f.locale = Locale.current
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: day) else { return day }
        f.dateFormat = long ? "EEEE" : "EEEEE"
        return f.string(from: d)
    }
}

struct ProfileHeatMapSection: View {
    let model: ProfileOverviewModel
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let heat = model.heat
        ProfileCard(title: "Last 3 months") {
            HStack(spacing: AlphonsoDS.Space.s1) {
                ForEach(Array(heat.weeks.enumerated()), id: \.offset) { _, week in
                    VStack(spacing: AlphonsoDS.Space.s1) {
                        ForEach(week, id: \.day) { cell in
                            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key / 4, style: .continuous)
                                .fill(color(cell))
                                .aspectRatio(1, contentMode: .fit)
                        }
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Activity over the last 3 months: \(heat.activeDays) active \(plural(heat.activeDays, "day", "days"))")
            Text(heat.activeDays == 0 ? "No active days yet. Your first lesson lights up the first square."
                 : "\(heat.activeDays) active \(plural(heat.activeDays, "day", "days"))")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
        }
    }

    private func color(_ c: ProfileMath.HeatCell) -> Color {
        if !c.inRange { return .clear }
        if c.level == 0 { return ds.sunk }
        return ds.action.opacity(Double(c.level) / 4)
    }
}

// MARK: Records, level, weak spots, Hector

struct ProfileRecordsLevelSection: View {
    let model: ProfileOverviewModel
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            ProfileCard(title: "Personal records") {
                record("Best day", "\(model.records.bestDayXP) XP")
                record("Longest streak", "\(model.records.bestStreak) \(plural(model.records.bestStreak, "day", "days"))")
                record("Perfect lessons", String(model.records.perfectLessons))
            }
            ProfileCard(title: "Level \(model.level.level)") {
                ProgressView(value: Double(model.level.done), total: Double(max(1, model.level.total)))
                    .tint(ds.action)
                    .accessibilityLabel("Level \(model.level.level) progress")
                    .accessibilityValue("\(model.level.pct) percent")
                Text(model.level.total == 0 ? "No lessons at this level yet."
                     : "\(model.level.done) of \(model.level.total) lessons done"
                        + (model.level.next.map { ", \(model.level.unitsLeft) \(plural(model.level.unitsLeft, "unit", "units")) to \($0)" } ?? ""))
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
            }
        }
    }

    private func record(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).dsText(.body).foregroundStyle(ds.ink)
            Spacer(minLength: AlphonsoDS.Space.s2)
            Text(value).dsText(.headline).foregroundStyle(ds.brand)
        }
        .accessibilityElement(children: .combine)
    }
}

struct ProfileWeakAndHectorSection: View {
    let model: ProfileOverviewModel
    let onPractice: () -> Void
    let onPaywall: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            ProfileCard(title: "Top weak spots") {
                if model.weak.top.isEmpty {
                    Text("Nothing is slipping. Words you miss will show up here.")
                        .dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    ForEach(model.weak.top, id: \.label) { w in
                        HStack {
                            Text(w.display).dsText(.body).foregroundStyle(ds.ink)
                            Spacer(minLength: AlphonsoDS.Space.s2)
                            Text("\(w.lapses) \(plural(w.lapses, "miss", "misses"))").dsText(.caption).foregroundStyle(ds.inkSoft)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    if model.weak.total > model.weak.top.count {
                        Text("\(model.weak.total - model.weak.top.count) more in Review")
                            .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    }
                    Button("Practice", action: onPractice)
                        .dsText(.headline).foregroundStyle(ds.choice)
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                }
            }
            if let hector = model.hector {
                ProfileCard(title: "Hector noticed") {
                    switch hector {
                    case .pro(let topics):
                        Text("You are working on \(ProfileMath.joinTopics(topics)). Hector keeps it in mind when you talk.")
                            .dsText(.body).foregroundStyle(ds.ink)
                    case .teaser(let topics):
                        Text("Hector can help you with \(ProfileMath.joinTopics(topics)).")
                            .dsText(.body).foregroundStyle(ds.ink)
                        Button("See Hector Pro", action: onPaywall)
                            .dsText(.headline).foregroundStyle(ds.choice)
                            .frame(minHeight: AlphonsoDS.Space.minTouch)
                    }
                }
            }
        }
    }
}

// MARK: Achievements, league, friends

struct ProfileProgressSection: View {
    let model: ProfileOverviewModel
    let catalogCount: Int
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            ProfileCard(title: "Achievements") {
                Text("\(model.unlockedCount) of \(catalogCount) unlocked").dsText(.headline).foregroundStyle(ds.brand)
                if let next = model.next {
                    Text("Next: \(next.achievement.title)").dsText(.body).foregroundStyle(ds.ink)
                    ProgressView(value: Double(min(next.value, next.achievement.threshold)), total: Double(next.achievement.threshold))
                        .tint(ds.xp)
                        .accessibilityLabel(next.achievement.title)
                        .accessibilityValue("\(next.value) of \(next.achievement.threshold)")
                    Text(next.achievement.description).dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
            }
            ProfileCard(title: "League") {
                Text(model.league.tier.capitalized).dsText(.title).foregroundStyle(ds.brand)
                if let next = model.league.next {
                    Text("\(model.league.xpToNext) XP to \(next.capitalized)").dsText(.footnote).foregroundStyle(ds.inkSoft)
                } else {
                    Text("Top league reached").dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
            }
            ProfileCard(title: "Friends this week") {
                if model.friends.count <= 1 {
                    Text("Add friends to see who is learning with you.").dsText(.footnote).foregroundStyle(ds.inkSoft)
                }
                ForEach(Array(model.friends.enumerated()), id: \.element.key) { i, f in
                    HStack(spacing: AlphonsoDS.Space.s3) {
                        Text("\(i + 1)").dsText(.headline).foregroundStyle(ds.inkSoft).frame(minWidth: AlphonsoDS.Space.s5)
                        ProfileAvatarView(seed: f.avatarSeed, name: f.displayName, size: AlphonsoDS.Space.s8)
                        Text(f.isYou ? "\(f.displayName) (you)" : f.displayName).dsText(.body).foregroundStyle(ds.ink)
                        Spacer(minLength: AlphonsoDS.Space.s2)
                        Text("\(f.weekXP) XP").dsText(.headline).foregroundStyle(ds.xpText)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(i + 1). \(f.displayName)\(f.isYou ? ", you" : ""), \(f.weekXP) XP this week")
                }
            }
        }
    }
}

// MARK: Share card (image only, no link)

struct ProfileShareCardView: View {
    let lines: [String]
    let avatarSeed: String?
    let name: String
    let ds: AlphonsoDS.Colors

    var body: some View {
        // lines: app, "<name>'s week", "<course> <level>", then (value, label) pairs.
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            HStack {
                ProfileAvatarView(seed: avatarSeed, name: name, size: 64)
                VStack(alignment: .leading) {
                    Text(lines[1]).dsText(.title).foregroundStyle(ds.onHero)
                    Text(lines[2]).dsText(.footnote).foregroundStyle(ds.onHeroSoft)
                }
            }
            ForEach(0..<3, id: \.self) { i in
                HStack(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s2) {
                    Text(lines[3 + 2 * i]).dsText(.displayXL).foregroundStyle(ds.onHero)
                    Text(lines[4 + 2 * i]).dsText(.headline).foregroundStyle(ds.onHeroSoft)
                }
            }
            Text(lines[0]).dsText(.overline).foregroundStyle(ds.onHeroKick)
        }
        .padding(AlphonsoDS.Space.s8)
        .frame(width: 360, alignment: .leading)
        .background(LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .top, endPoint: .bottom))
        .environment(\.alphonsoDS, ds)
    }
}

struct ProfileShareSection: View {
    let model: ProfileOverviewModel
    let course: Course
    let level: String
    @State private var image: UIImage?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        ProfileCard(title: "Share your week") {
            if let image {
                ShareLink(item: Image(uiImage: image), preview: SharePreview("My week", image: Image(uiImage: image))) {
                    Label("Share", systemImage: "square.and.arrow.up").dsText(.headline)
                }
                .frame(minHeight: AlphonsoDS.Space.minTouch)
            }
        }
        .task(id: model.big.streak &+ model.week.minutesSpoken &+ model.big.xpThisWeek &+ model.name.count) {
            let lines = ProfileMath.shareCardLines(
                name: model.name, courseLabel: course.label, level: level, streak: model.big.streak,
                minutesSpoken: model.week.minutesSpoken, xpThisWeek: model.big.xpThisWeek)
            let renderer = ImageRenderer(content: ProfileShareCardView(lines: lines, avatarSeed: model.data.avatarSeed, name: model.name, ds: ds))
            renderer.scale = 3
            image = renderer.uiImage
        }
    }
}
