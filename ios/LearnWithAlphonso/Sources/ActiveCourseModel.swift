import Foundation
import Observation
import LearnWithAlphonsoKit

/// The learner's active course, shared by Learn (which sets it through its
/// CoursePicker), Practice and Hector (which follow it), and persisted via the
/// Kit's ActiveCoursePreference. LessonBrowserView used to keep the course in
/// its own @State, reset to English every launch, so the conversation screens
/// had no course to follow.
@MainActor
@Observable
final class ActiveCourseModel {
    var course: Course {
        didSet { ActiveCoursePreference.save(course, to: defaults) }
    }

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        course = ActiveCoursePreference.load(from: defaults)
    }
}
