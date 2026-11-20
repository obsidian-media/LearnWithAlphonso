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
    let name: String
    /// The daily minutes the learner chose in first run (LearnerProfile.dailyMinutes); nil if never chosen.
    let dailyGoalMinutes: Int?
    /// This week's rings in learning minutes against that goal; nil without a goal (the XP rings stay).
    let goal: (days: [ProfileMath.GoalRingDay], metDays: Int)?
    let radar: SkillsRadar.Model
    /// This week as the Overview strip shows it (minutes against the goal, else the XP rule).
    let strip: ProfileMath.WeekStrip
    /// How far through the current league tier's XP span the learner is, 0 to 100.
    let leaguePct: Int
    /// The latest unlocked achievements (up to three), newest first, for the preview's overlapping medallions.
    let recentAchievements: [Achievement]

    init(data: ProfileOverviewData, contentStore: ContentStore, course: Course, isPro: Bool, dailyGoalMinutes: Int? = nil) {
        self.data = data
        let goalMinutes: Int? = (dailyGoalMinutes ?? 0) > 0 ? dailyGoalMinutes : nil
        self.dailyGoalMinutes = goalMinutes
        goal = goalMinutes.map { ProfileMath.goalRings(today: data.today, learning: data.learning, goalMinutes: $0) }
        strip = ProfileMath.weekStrip(
            today: data.today, activity: data.activity, speech: data.speech, learning: data.learning, goalMinutes: goalMinutes)
        recentAchievements = Array(
            data.achievements.filter { $0.unlockedAt != nil }
                .sorted { ($0.unlockedAt ?? "") > ($1.unlockedAt ?? "") }
                .compactMap { row in contentStore.achievements.first { $0.id == row.id } }
                .prefix(3))
        radar = SkillsRadar.radarModel(ProfileMath.skillScores(rows: data.skills, today: data.today))
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
        leaguePct = ProfileMath.leaguePct(tier: mine?.leagueTier ?? "bronze", courseXP: big.courseXP)
        name = (data.displayName?.isEmpty == false ? data.displayName : nil) ?? "Learner"
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

/// The identity hero (the web's ProfileIdentityHero): the learner's picture in a level ring, their name and drawn
/// flag, a league chip, the level bar and the four numbers. It stays on every tab; Progress and Social show it
/// without the level bar and numbers. Every value comes from the overview through ProfileMath.
struct ProfileHeroSection: View {
    let model: ProfileOverviewModel
    let course: Course
    let compact: Bool
    let onPicture: () -> Void
    @Environment(\.alphonsoDS) private var ds
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            identity
            if !compact {
                levelBar
                numbers
            }
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.sheet, style: .continuous)
                .fill(LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .topLeading, endPoint: .bottomTrailing)))
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
    }

    private var leagueChipText: String {
        let label = "\(LeagueTierCopy.label(for: model.league.tier)) league"
        return model.data.league.map { "\(label) · Rank \($0.rank)" } ?? label
    }

    private var identity: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: AlphonsoDS.Space.s3))
            : AnyLayout(HStackLayout(alignment: .center, spacing: AlphonsoDS.Space.s4))
        return layout {
            avatarRing
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                HStack(alignment: .firstTextBaseline, spacing: AlphonsoDS.Space.s2) {
                    Text(model.name).dsText(.displayXL).foregroundStyle(ds.onHero)
                        .fixedSize(horizontal: false, vertical: true)
                    if let country = model.data.country, ProfileMath.flagAccessibilityLabel(country: country) != nil {
                        ProfileFlagView(country: country)
                    }
                }
                HStack(spacing: AlphonsoDS.Space.s1) {
                    DSIconView(icon: .trophy, size: AlphonsoDS.Space.s4)
                    Text(leagueChipText).dsText(.caption).fixedSize(horizontal: false, vertical: true)
                }
                .foregroundStyle(ds.onHeroKick)
                .padding(.horizontal, AlphonsoDS.Space.s2)
                .padding(.vertical, AlphonsoDS.Space.s1)
                .background(Capsule().fill(ds.onHeroKick.opacity(0.22)))
                .overlay(Capsule().strokeBorder(ds.onHeroKick.opacity(0.5), lineWidth: 1))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(leagueChipText)
            }
        }
    }

    /// The picture in a gold ring that fills with this level's lesson progress, a level badge on its corner.
    private var avatarRing: some View {
        let ring = AlphonsoDS.Space.s12 + AlphonsoDS.Space.s6 + AlphonsoDS.Space.s1
        let level = model.level
        return Button(action: onPicture) {
            ZStack {
                Circle().stroke(ds.onHero.opacity(0.18), lineWidth: AlphonsoDS.Space.s1)
                Circle().trim(from: 0, to: CGFloat(min(100, max(0, level.pct))) / 100)
                    .stroke(
                        LinearGradient(colors: [ds.actionHi, ds.action], startPoint: .topLeading, endPoint: .bottomTrailing),
                        style: StrokeStyle(lineWidth: AlphonsoDS.Space.s1, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                ProfileAvatarView(seed: model.data.avatarSeed, name: model.name, size: ring - AlphonsoDS.Space.s3)
            }
            .frame(width: ring, height: ring)
            .overlay(alignment: .bottomTrailing) {
                Text(level.level).dsText(.overline).foregroundStyle(ds.onAction)
                    .padding(.horizontal, AlphonsoDS.Space.s2)
                    .background(Capsule().fill(LinearGradient(colors: [ds.actionHi, ds.action], startPoint: .top, endPoint: .bottom)))
                    .overlay(Capsule().strokeBorder(ds.heroB, lineWidth: 2))
            }
        }
        .buttonStyle(.plain)
        .frame(minWidth: AlphonsoDS.Space.minTouch, minHeight: AlphonsoDS.Space.minTouch)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Change picture")
        .accessibilityValue("\(level.level), \(level.pct) percent of the level done")
        .accessibilityHint("Choose an animal or your initial")
    }

    private var levelLine: String {
        let level = model.level
        let left = ProfileMath.lessonsLeft(level)
        if left > 0 { return "\(left) \(plural(left, "lesson", "lessons")) left in \(level.level)" }
        if let next = level.next { return "\(level.level) done. Ready for \(next)" }
        return "The top level in \(course.label)"
    }

    private var levelBar: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
            HStack(alignment: .firstTextBaseline) {
                Text("Level \(model.level.level)").dsText(.headline).foregroundStyle(ds.onHero)
                Spacer(minLength: AlphonsoDS.Space.s2)
                Text(levelLine).dsText(.caption).foregroundStyle(ds.onHeroSoft).multilineTextAlignment(.trailing)
            }
            ProfileGoldBar(pct: model.level.pct, track: ds.heroB.opacity(0.4))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Level \(model.level.level)")
        .accessibilityValue("\(model.level.pct) percent, \(levelLine)")
    }

    private var numbers: some View {
        let b = model.big
        let streakSpoken = b.streakState == .protected
            ? "\(StreakDisplay.accessibilityLabel(StreakDisplay.Shown(streak: b.streak, state: b.streakState)))"
            : "\(b.streak) day streak"
        return LazyVGrid(
            columns: Array(repeating: GridItem(.flexible(), alignment: .topLeading), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2),
            alignment: .leading, spacing: AlphonsoDS.Space.s3
        ) {
            statTile(.flameSolid, tone: ds.onHeroKick, value: String(b.streak), label: "day streak", spoken: streakSpoken)
            statTile(.boltSolid, tone: ds.onHeroKick, value: String(b.courseXP), label: "XP in \(course.label)",
                     spoken: "\(b.courseXP) XP in \(course.label)")
            statTile(.words, tone: ds.onHeroSoft, value: String(b.wordsLearned), label: plural(b.wordsLearned, "word learned", "words learned"),
                     spoken: "\(b.wordsLearned) \(plural(b.wordsLearned, "word", "words")) learned")
            statTile(.target, tone: ds.onHeroSoft, value: b.accuracyPct.map { "\($0)%" } ?? "–", label: "accuracy",
                     spoken: b.accuracyPct.map { "\($0) percent accuracy" } ?? "No accuracy yet")
        }
        .padding(AlphonsoDS.Space.s3)
        .background(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                .fill(ds.heroB.opacity(0.3))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    .strokeBorder(ds.onHero.opacity(0.1), lineWidth: 1)))
    }

    /// One number: a line icon in a subtle tile, the value and its label, read by VoiceOver as one phrase.
    private func statTile(_ icon: AlphonsoDS.Icon, tone: Color, value: String, label: String, spoken: String) -> some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            DSIconView(icon: icon, size: AlphonsoDS.Space.s5)
                .foregroundStyle(tone)
                .frame(width: AlphonsoDS.Space.s8, height: AlphonsoDS.Space.s8)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous).fill(ds.onHero.opacity(0.1)))
            VStack(alignment: .leading, spacing: 0) {
                Text(value).dsText(.numeral).foregroundStyle(ds.onHero)
                Text(label).dsText(.overline).foregroundStyle(ds.onHeroSoft)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }
}

/// A gold bar filling to a percentage on a dark track. Static: no fill animation to turn off for Reduce Motion.
struct ProfileGoldBar: View {
    let pct: Int
    let track: Color
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule()
                    .fill(LinearGradient(colors: [ds.actionHi, ds.action], startPoint: .leading, endPoint: .trailing))
                    .frame(width: g.size.width * CGFloat(min(100, max(0, pct))) / 100)
            }
        }
        .frame(height: AlphonsoDS.Space.s2)
        .accessibilityHidden(true)
    }
}

/// The learner's flag, drawn (the Flags imageset group); a country with no drawing shows its code in a chip, never the
/// emoji (the web and Android follow the same rule).
struct ProfileFlagView: View {
    let country: String
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let width = AlphonsoDS.Space.s6
        let height = AlphonsoDS.Space.s4
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key / 4, style: .continuous)
        Group {
            if let code = ProfileMath.drawnFlagCode(country: country) {
                Image("flag-\(code.lowercased())")
                    .resizable()
                    .scaledToFill()
                    .frame(width: width, height: height)
                    .clipShape(shape)
                    .overlay(shape.strokeBorder(ds.onHero.opacity(0.4), lineWidth: 1))
            } else {
                Text(country.uppercased()).dsText(.overline).foregroundStyle(ds.onHero)
                    .padding(.horizontal, AlphonsoDS.Space.s1)
                    .frame(minWidth: width, minHeight: height)
                    .background(shape.fill(ds.onHero.opacity(0.2)))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Locale.current.localizedString(forRegionCode: country.uppercased()) ?? "Country \(country.uppercased())")
    }
}

/// The course switch, right under the hero on Overview: the same app-wide switch as Learn's.
struct ProfileCoursePicker: View {
    let course: Course
    let onCourse: (Course) -> Void

    var body: some View {
        Picker("Course", selection: Binding(get: { course }, set: onCourse)) {
            ForEach([Course.english, .french, .spanish], id: \.wireCode) { Text($0.label).tag($0) }
        }
        .pickerStyle(.segmented)
    }
}

// MARK: Week, speech, heat map

struct ProfileWeekSection: View {
    let model: ProfileOverviewModel
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let strip = model.strip
        let b = model.big
        let chip = b.streakState == .protected ? StreakDisplay.protectedCaption : "\(b.streak)-day streak"
        ProfileCard(title: "This week") {
            HStack {
                HStack(spacing: AlphonsoDS.Space.s1) {
                    DSIconView(icon: .flameSolid, size: AlphonsoDS.Space.s4)
                    Text(chip).dsText(.caption)
                }
                .foregroundStyle(ds.flame)
                .padding(.horizontal, AlphonsoDS.Space.s2)
                .padding(.vertical, AlphonsoDS.Space.s1)
                .background(Capsule().fill(ds.flameTint))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(b.streakState == .protected ? chip : "\(b.streak) day streak")
                Spacer(minLength: 0)
            }
            HStack(spacing: AlphonsoDS.Space.s2) {
                ForEach(strip.days, id: \.day) { d in
                    VStack(spacing: AlphonsoDS.Space.s1) {
                        pip(d.state)
                        Text(weekday(d.day)).dsText(.overline)
                            .foregroundStyle(d.state == .done ? ds.actionText : ds.inkFaint)
                    }
                    .frame(maxWidth: .infinity)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(weekday(d.day, long: true)): \(d.spoken)")
                }
            }
            Text("\(strip.doneDays) of 7 days \(strip.measuredInMinutes ? "done" : "active")")
                .dsText(.footnote).foregroundStyle(ds.inkSoft)
            if let minutes = model.dailyGoalMinutes {
                Text("Goal: \(minutes) learning minutes a day").dsText(.caption).foregroundStyle(ds.inkSoft)
            } else {
                Text("Pick a daily time in Edit your answers to measure your days in minutes.")
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
            }
            if strip.minutesSpoken > 0 {
                Text("\(strip.minutesSpoken) \(plural(strip.minutesSpoken, "minute", "minutes")) spoken this week")
                    .dsText(.caption).foregroundStyle(ds.inkSoft)
            }
        }
    }

    /// Done days are stamped gold with a check, today is ringed in the choice colour, the rest are plain.
    @ViewBuilder private func pip(_ s: ProfileMath.RingState) -> some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key, style: .continuous)
        switch s {
        case .done:
            shape.fill(LinearGradient(colors: [ds.actionHi, ds.action], startPoint: .top, endPoint: .bottom))
                .frame(height: AlphonsoDS.Space.s8)
                .overlay(DSIconView(icon: .check, size: AlphonsoDS.Space.s4).foregroundStyle(ds.onAction))
        case .today:
            shape.fill(ds.choiceTint)
                .overlay(shape.strokeBorder(ds.choice, lineWidth: 2))
                .frame(height: AlphonsoDS.Space.s8)
        case .missed, .future:
            shape.fill(ds.sunk).frame(height: AlphonsoDS.Space.s8)
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

/// The achievements preview: the latest medallions overlapping on navy, how many are unlocked, a chevron to the wall.
struct ProfileAchievementsPreview: View {
    let model: ProfileOverviewModel
    let catalogCount: Int
    let action: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let more = model.unlockedCount - model.recentAchievements.count
        let count = "\(model.unlockedCount) of \(catalogCount) unlocked"
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                HStack(spacing: -AlphonsoDS.Space.s4) {
                    ForEach(model.recentAchievements, id: \.id) { a in
                        BadgeMedallion(id: a.id, size: AlphonsoDS.Space.s12, state: .earned)
                    }
                    if model.recentAchievements.isEmpty, let next = model.next {
                        BadgeMedallion(id: next.achievement.id, size: AlphonsoDS.Space.s12, state: .locked)
                    }
                    if more > 0 {
                        Text("+\(more)").dsText(.caption).foregroundStyle(ds.onHero)
                            .frame(width: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s2, height: AlphonsoDS.Space.s8 + AlphonsoDS.Space.s2)
                            .background(Circle().fill(ds.onHero.opacity(0.15)))
                            .padding(.leading, AlphonsoDS.Space.s4)
                    }
                }
                VStack(alignment: .leading, spacing: 0) {
                    Text("Achievements").dsText(.headline).foregroundStyle(ds.onHero)
                    Text(count).dsText(.caption).foregroundStyle(ds.onHeroSoft)
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                DSIconView(icon: .chevron, size: AlphonsoDS.Space.s4).foregroundStyle(ds.onHeroSoft)
            }
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                    .fill(LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .topLeading, endPoint: .bottomTrailing)))
            .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Achievements, \(count)")
        .accessibilityHint("Opens your achievements")
    }
}

/// A tappable row card with a drawn icon in a tinted tile (Edit your answers, Settings, League, Friends, Invite).
struct ProfileRowCard: View {
    let icon: AlphonsoDS.Icon
    let tint: Color
    let ink: Color
    let title: String
    let subtitle: String
    let action: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                DSIconView(icon: icon, size: AlphonsoDS.Space.s5)
                    .foregroundStyle(ink)
                    .frame(width: AlphonsoDS.Space.s12 - AlphonsoDS.Space.s2, height: AlphonsoDS.Space.s12 - AlphonsoDS.Space.s2)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.key + AlphonsoDS.Space.s1, style: .continuous).fill(tint))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).dsText(.headline).foregroundStyle(ds.ink)
                    Text(subtitle).dsText(.caption).foregroundStyle(ds.inkSoft)
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                DSIconView(icon: .chevron, size: AlphonsoDS.Space.s4).foregroundStyle(ds.inkFaint)
            }
            .padding(.horizontal, AlphonsoDS.Space.s3)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control + AlphonsoDS.Space.s1, style: .continuous).fill(ds.card.opacity(0.92)))
            .dsElevation(AlphonsoDS.Elevation.resting, line: ds.line)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
    }
}

/// Your league, on navy: the tier, how far to the next, and where you stand this week.
struct ProfileLeagueCard: View {
    let model: ProfileOverviewModel
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let league = model.league
        let toNext = league.next.map { "\(league.xpToNext) XP to \(LeagueTierCopy.label(for: $0))" } ?? "The top league. Well done."
        let standing = model.data.league.map {
            "Rank \($0.rank) of \($0.size) · \(ProfileMath.leagueWeekEnds(weekEnd: $0.weekEnd, timeZone: model.data.timeZone))"
        }
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            Text("Your league").dsText(.overline).foregroundStyle(ds.onHeroSoft)
            HStack(spacing: AlphonsoDS.Space.s3) {
                ZStack {
                    Image(systemName: "shield.fill").resizable().scaledToFit()
                        .foregroundStyle(LeagueTierPalette.color(for: league.tier))
                    Image(systemName: "star.fill").foregroundStyle(ds.card.opacity(0.85))
                }
                .frame(width: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2, height: AlphonsoDS.Space.s12 + AlphonsoDS.Space.s2)
                .accessibilityHidden(true)
                Text(LeagueTierCopy.label(for: league.tier)).dsText(.displayXL).foregroundStyle(ds.onHeroKick)
            }
            ProfileGoldBar(pct: model.leaguePct, track: ds.heroB.opacity(0.4))
            Text(toNext).dsText(.footnote).foregroundStyle(ds.onHeroKick)
            if let standing {
                Text(standing).dsText(.caption).foregroundStyle(ds.onHeroSoft)
            }
        }
        .padding(AlphonsoDS.Space.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous)
                .fill(LinearGradient(colors: [ds.heroA, ds.heroB], startPoint: .topLeading, endPoint: .bottomTrailing)))
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Your league, \(LeagueTierCopy.label(for: league.tier))")
        .accessibilityValue([toNext, standing].compactMap { $0 }.joined(separator: ". "))
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

// MARK: Skills radar

/// The Skills radar (web SkillsChart): the share of recent answers right per skill. A skill with too few answers has
/// no vertex and says how many more it needs; with too little data overall the designed empty state shows.
struct ProfileSkillsSection: View {
    let model: ProfileOverviewModel
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        let radar = model.radar
        ProfileCard(title: "Skills") {
            if radar.ready, let lowest = radar.lowest {
                RadarChart(skills: radar.skills)
                    .aspectRatio(1, contentMode: .fit)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(spoken(radar))
                Text("Lowest: \(lowest.label) · \(lowest.pct ?? 0). Practise it to lift your shape.")
                    .dsText(.footnote).foregroundStyle(ds.ink)
                    .padding(AlphonsoDS.Space.s2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.sunk))
            } else {
                Text(SkillsRadar.emptyIntro(radar.skills))
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
                ForEach(radar.skills, id: \.skill) { s in
                    Text(needLine(s)).dsText(.caption).foregroundStyle(ds.inkSoft)
                }
            }
        }
    }

    private func needLine(_ s: SkillsRadar.Skill) -> String {
        guard s.pct == nil else { return "\(s.label): \(s.pct ?? 0)" }
        return "\(s.label): \(s.needed) more \(plural(s.needed, "answer", "answers")) to score (\(s.answered) of \(SkillsRadar.minSkillAnswers) so far)"
    }

    private func spoken(_ radar: SkillsRadar.Model) -> String {
        "Skills: " + radar.skills.map { "\($0.label) " + ($0.pct.map { String($0) } ?? "not scored yet") }.joined(separator: ", ")
    }
}

private struct RadarPolygon: Shape {
    let points: [SkillsRadar.Point]
    var close = true

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard let first = points.first else { return path }
        path.move(to: CGPoint(x: first.x, y: first.y))
        for p in points.dropFirst() { path.addLine(to: CGPoint(x: p.x, y: p.y)) }
        if close { path.closeSubpath() }
        return path
    }
}

private struct RadarChart: View {
    let skills: [SkillsRadar.Skill]
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        GeometryReader { geo in
            let side = Double(min(geo.size.width, geo.size.height))
            let c = side / 2
            let n = skills.count
            let radius = c - Double(AlphonsoDS.Space.s12)
            let labelRadius = radius + Double(AlphonsoDS.Space.s4)
            let shape = SkillsRadar.radarPolygon(skills, radius: radius, c: c)
            ZStack {
                ForEach([0.25, 0.5, 0.75, 1.0], id: \.self) { (k: Double) in
                    RadarPolygon(points: (0..<n).map { SkillsRadar.radarPoint($0, n, radius * k, c) })
                        .stroke(ds.line, lineWidth: 1)
                }
                ForEach(0..<n, id: \.self) { (i: Int) in
                    RadarPolygon(points: [SkillsRadar.Point(x: c, y: c), SkillsRadar.radarPoint(i, n, radius, c)], close: false)
                        .stroke(ds.line, lineWidth: 1)
                }
                RadarPolygon(points: shape).fill(ds.choice.opacity(0.25))
                RadarPolygon(points: shape).stroke(ds.choice, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
                ForEach(Array(skills.enumerated()), id: \.offset) { i, s in
                    if let pct = s.pct {
                        let dot = SkillsRadar.radarPoint(i, n, radius * Double(pct) / 100, c)
                        Circle().fill(ds.xp)
                            .frame(width: AlphonsoDS.Space.s2, height: AlphonsoDS.Space.s2)
                            .position(x: CGFloat(dot.x), y: CGFloat(dot.y))
                    }
                    let at = SkillsRadar.radarPoint(i, n, labelRadius, c)
                    VStack(spacing: 0) {
                        Text(s.label).dsText(.caption).foregroundStyle(ds.ink)
                        Text(s.pct.map { String($0) } ?? "not yet").dsText(.caption).foregroundStyle(ds.inkSoft)
                    }
                    .position(x: CGFloat(at.x), y: CGFloat(at.y))
                }
            }
            .frame(width: CGFloat(side), height: CGFloat(side))
        }
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
    var showWeak = true
    var showHector = true
    let onPractice: () -> Void
    let onPaywall: () -> Void
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if showWeak {
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
            }
            if showHector, let hector = model.hector {
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


/// "What Alphonso remembers" on Profile: opens the page. Pro learners see their notes there; a free learner sees it
/// locked, with a teaser made only from their own weak spots (the same rule as "Hector can help").
struct ProfileMemoryCard: View {
    let isPro: Bool
    let topics: [String]
    let session: Session
    let action: () -> Void
    /// Pro: the counts, read from the server (nil until they arrive).
    @State private var summary: String?
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        Button(action: action) {
            HStack(spacing: AlphonsoDS.Space.s3) {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    HStack(spacing: AlphonsoDS.Space.s2) {
                        Text(isPro ? "What Alphonso remembers" : "What Alphonso can remember").dsText(.headline)
                        Text("Pro").dsText(.overline).foregroundStyle(ds.onAction)
                            .padding(.horizontal, AlphonsoDS.Space.s1).background(RoundedRectangle(cornerRadius: AlphonsoDS.Space.s1).fill(ds.action))
                    }
                    Text(isPro
                        ? (summary.map { $0 + " See and edit." } ?? "See and edit the notes he keeps from your calls.")
                        : (topics.isEmpty ? "With Pro, Alphonso keeps notes between calls." : "He could remember \(ProfileMath.joinTopics(topics)). See what Pro keeps."))
                        .dsText(.caption).foregroundStyle(ds.onHeroSoft)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").foregroundStyle(ds.onHeroSoft).accessibilityHidden(true)
            }
            .foregroundStyle(ds.onHero)
            .padding(AlphonsoDS.Space.s3)
            .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous).fill(ds.hero))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .task(id: isPro) {
            guard isPro, case .ready(let memory) = await practiceClient(session).tutorMemory() else { return }
            summary = memory.summary
        }
    }
}

// MARK: Achievements, league, friends

struct ProfileProgressSection: View {
    let model: ProfileOverviewModel
    let catalogCount: Int
    var showAchievements = true
    var showSocial = true
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s3) {
            if showAchievements {
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
            }
            if showSocial {
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
