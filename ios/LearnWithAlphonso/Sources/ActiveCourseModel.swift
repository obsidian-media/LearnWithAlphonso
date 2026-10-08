import Foundation
import Observation
import LearnWithAlphonsoKit

/// The learner's active course, shared by Learn (which sets it through its
/// CoursePicker), Practice and Hector (which follow it), and persisted per
/// account via the Kit's ActiveCoursePreference. LessonBrowserView used to keep
/// the course in its own @State, reset to English every launch, so the
/// conversation screens had no course to follow.
@MainActor
@Observable
final class ActiveCourseModel {
    var course: Course = .english {
        didSet {
            guard !isLoading else { return }
            ActiveCoursePreference.save(course, for: userID, to: defaults)
        }
    }

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var userID: String?
    @ObservationIgnored private var isLoading = false

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The signed-in account changed (or is now known): show that account's own course, English if it has none.
    func accountChanged(to userID: String?) {
        self.userID = userID
        isLoading = true
        course = ActiveCoursePreference.load(for: userID, from: defaults)
        isLoading = false
    }
}
