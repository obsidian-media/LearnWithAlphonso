import SwiftUI
import LearnWithAlphonsoKit

/// V1's lesson browser: pick a course, see every unit and its lessons.
/// Reads entirely from the bundled ContentStore (see that type's doc
/// comment) -- no network call, works offline. Tapping a lesson opens
/// LessonPlayerView, which does hit the network on finish.
struct LessonBrowserView: View {
    let contentStore: ContentStore
    let session: Session
    let notificationScheduler: NotificationScheduler

    @State private var course: Course = .english

    var body: some View {
        NavigationStack {
            List {
                ForEach(contentStore.bundle(for: course).units) { unit in
                    Section {
                        ForEach(unit.lessons) { lesson in
                            NavigationLink(value: lesson.id) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(lesson.title)
                                        .font(.body)
                                    Text(lesson.subtitle)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    } header: {
                        Text("\(unit.eyebrow) · \(unit.title)")
                    }
                }
            }
            .navigationTitle("Learn with Alphonso")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Picker("Course", selection: $course) {
                        Text("English").tag(Course.english)
                        Text("Français").tag(Course.french)
                    }
                    .pickerStyle(.segmented)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign out") { session.signOut() }
                }
            }
            .navigationDestination(for: String.self) { lessonId in
                if let found = contentStore.findLesson(id: lessonId, course: course) {
                    LessonPlayerView(lesson: found.lesson, course: course, session: session, notificationScheduler: notificationScheduler)
                } else {
                    Text("Lesson not found")
                }
            }
        }
    }
}
