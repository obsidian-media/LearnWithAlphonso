import Foundation

/// What happens to the offline queue when the signed-in account leaves this device.
///
/// Sign-out (by the learner, or forced: a refresh token the server rejected, an Apple ID that stopped using the
/// app) used to delete every queued lesson and review answer, so a learner who finished lessons on a train and
/// then signed out lost them without a word. Now:
/// - **Sign-out keeps the queue.** Every row stays, tagged with the account that played it, and syncs when
///   that account signs back in on this device. SyncEngine never sends, and the Learn tab never counts, a row
///   another account owns, so the next account still neither sees nor sends them.
/// - **Account deletion still removes** the deleted account's rows. Rows another account left here stay theirs.
///
/// A row with no owner (queued by a build before owners were recorded) would be adopted by whoever syncs
/// next, so it is stamped with the leaving account, or deleted when that account is unknown (a cleanup resumed
/// after a process kill).
public enum AccountQueueRetention {
    public static func plan(
        event: SessionLifecycle.Event,
        retiringUserID: String?,
        lessons: [PendingLessonCompletion],
        grades: [PendingReviewGrade]
    ) -> QueueRetentionPlan {
        var plan = QueueRetentionPlan(owner: retiringUserID)
        func decide(owner: String?, identity: String, delete: inout Set<String>, tag: inout Set<String>) {
            switch event {
            case .signedOut:
                guard owner == nil else { return }
                if retiringUserID == nil { delete.insert(identity) } else { tag.insert(identity) }
            case .accountDeleted:
                if retiringUserID == nil || owner == nil || owner == retiringUserID { delete.insert(identity) }
            }
        }
        for lesson in lessons {
            decide(owner: lesson.ownerUserID, identity: lesson.queueIdentity,
                   delete: &plan.deleteLessonIdentities, tag: &plan.tagLessonIdentities)
        }
        for grade in grades {
            decide(owner: grade.ownerUserID, identity: grade.queueIdentity,
                   delete: &plan.deleteGradeIdentities, tag: &plan.tagGradeIdentities)
        }
        return plan
    }
}

extension AccountQueueRetention {
    /// How long another account's rows wait on this device for that account to sign back in.
    public static let foreignRowLifetime: TimeInterval = 30 * 24 * 60 * 60

    /// Rows of an account that left this device more than `foreignRowLifetime` ago (timed from when it left,
    /// ForeignOwnerClock, never from queuedAt: a row queued 29 days before its account signed out still gets 30
    /// days). An owner with no recorded departure is kept. That account has not been back, so
    /// they are deleted instead of kept forever. Run at the start of each sync pass for the signed-in account.
    public static func expiredForeignRows(
        currentUserID: String, lessons: [PendingLessonCompletion], grades: [PendingReviewGrade], now: Date,
        lifetime: TimeInterval = foreignRowLifetime, retiredAt: (String) -> Date?
    ) -> QueueRetentionPlan {
        var plan = QueueRetentionPlan(owner: nil)
        func expired(_ owner: String?) -> Bool {
            guard let owner, owner != currentUserID, let left = retiredAt(owner) else { return false }
            return now.timeIntervalSince(left) > lifetime
        }
        plan.deleteLessonIdentities = Set(lessons.filter { expired($0.ownerUserID) }.map(\.queueIdentity))
        plan.deleteGradeIdentities = Set(grades.filter { expired($0.ownerUserID) }.map(\.queueIdentity))
        return plan
    }
}

/// When each account last left this device, so its kept rows expire 30 days after it left. Kept beside the
/// frozen SwiftData schema, and deliberately not in AccountCacheKeys (those are wiped at every sign-out).
public struct ForeignOwnerClock: @unchecked Sendable {
    public static let key = "queue.foreignOwnerRetiredAt.v1"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    private var all: [String: Double] { (defaults.dictionary(forKey: Self.key) as? [String: Double]) ?? [:] }

    public func retiredAt(_ owner: String) -> Date? { all[owner].map(Date.init(timeIntervalSince1970:)) }

    /// At sign-out: the account's rows become foreign from now (a later departure restarts the 30 days).
    public func markRetired(_ owner: String, at date: Date) {
        var map = all
        map[owner] = date.timeIntervalSince1970
        defaults.set(map, forKey: Self.key)
    }

    /// For rows left by an older build that never recorded a departure: start their clock now.
    public func markRetiredIfUnknown(_ owner: String, at date: Date) {
        if retiredAt(owner) == nil { markRetired(owner, at: date) }
    }

    /// The account is back: its rows are not foreign.
    public func forget(_ owner: String) {
        var map = all
        guard map.removeValue(forKey: owner) != nil else { return }
        defaults.set(map, forKey: Self.key)
    }
}

/// Rows to delete and unowned rows to stamp with `owner`, matched by `queueIdentity`. Rows in neither set are
/// left exactly as they are.
public struct QueueRetentionPlan: Sendable, Equatable {
    public let owner: String?
    public var deleteLessonIdentities: Set<String> = []
    public var tagLessonIdentities: Set<String> = []
    public var deleteGradeIdentities: Set<String> = []
    public var tagGradeIdentities: Set<String> = []

    public init(owner: String?) {
        self.owner = owner
    }

    public var isEmpty: Bool {
        deleteLessonIdentities.isEmpty && tagLessonIdentities.isEmpty && deleteGradeIdentities.isEmpty && tagGradeIdentities.isEmpty
    }

    /// What happens to one stored row. The store and the tests both apply a plan through this, row by row.
    public enum Disposition: Sendable, Equatable {
        case keep
        case delete
        case stamp(owner: String)
    }

    public func lessonDisposition(_ identity: String) -> Disposition {
        disposition(identity, delete: deleteLessonIdentities, tag: tagLessonIdentities)
    }

    public func gradeDisposition(_ identity: String) -> Disposition {
        disposition(identity, delete: deleteGradeIdentities, tag: tagGradeIdentities)
    }

    private func disposition(_ identity: String, delete: Set<String>, tag: Set<String>) -> Disposition {
        if delete.contains(identity) { return .delete }
        if let owner, tag.contains(identity) { return .stamp(owner: owner) }
        return .keep
    }

    /// The plan applied to plain rows (what SyncQueueStore does to its records, row by row, via the dispositions).
    public func applied(
        lessons: [PendingLessonCompletion], grades: [PendingReviewGrade]
    ) -> (lessons: [PendingLessonCompletion], grades: [PendingReviewGrade]) {
        let keptLessons: [PendingLessonCompletion] = lessons.compactMap {
            switch lessonDisposition($0.queueIdentity) {
            case .keep: return $0
            case .delete: return nil
            case let .stamp(owner): return $0.owned(by: owner)
            }
        }
        let keptGrades: [PendingReviewGrade] = grades.compactMap {
            switch gradeDisposition($0.queueIdentity) {
            case .keep: return $0
            case .delete: return nil
            case let .stamp(owner): return $0.owned(by: owner)
            }
        }
        return (keptLessons, keptGrades)
    }
}

/// The one rule every append to the offline queue goes through: a row must name the account that played it. An
/// unowned row would be adopted by whoever syncs next, so another account could be credited with (or send) this
/// learner's work. The store refuses it; the caller takes the signed-out path instead.
public enum QueueAppendResult: Sendable, Equatable {
    /// Written. `onDisk` is whether THIS save reached a persistent store.
    case stored(onDisk: Bool)
    case refusedNoOwner

    public static func decide(owner: String?, saved: () -> Bool, isPersistent: Bool) -> QueueAppendResult {
        guard let owner, !owner.isEmpty else { return .refusedNoOwner }
        return .stored(onDisk: saved() && isPersistent)
    }

    public var isStored: Bool {
        if case .stored = self { return true }
        return false
    }

    public var isOnDisk: Bool { self == .stored(onDisk: true) }
}

extension PendingLessonCompletion {
    public func owned(by owner: String) -> PendingLessonCompletion {
        PendingLessonCompletion(
            lessonID: lessonID, total: total, answers: answers, course: course, queuedAt: queuedAt,
            optimisticXpEstimate: optimisticXpEstimate, ownerUserID: owner, sessionToken: sessionToken,
            attemptCount: attemptCount, nextAttemptAt: nextAttemptAt)
    }
}

extension PendingReviewGrade {
    public func owned(by owner: String) -> PendingReviewGrade {
        PendingReviewGrade(
            itemKey: itemKey, answer: answer, course: course, queuedAt: queuedAt,
            expectedDueOn: expectedDueOn, expectedLastReviewedAt: expectedLastReviewedAt, ownerUserID: owner,
            attemptCount: attemptCount, nextAttemptAt: nextAttemptAt)
    }
}
