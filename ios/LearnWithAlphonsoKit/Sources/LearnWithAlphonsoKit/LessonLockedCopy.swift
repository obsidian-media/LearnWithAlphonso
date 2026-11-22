import Foundation

/// What the lesson player shows, instead of the lesson, when start-lesson-session refuses it as not unlocked yet
/// (409 lesson-locked): the same words as the web's lesson page, and a way back to Learn. Shown before play, so no
/// attempt is ever played and then refused at the finish. LessonLockedCopy.kt is the Android twin.
public enum LessonLockedCopy {
    public static let title = "Finish the earlier lessons first"
    public static let message = "This lesson opens once the ones before it are done."
    public static let backTitle = "Back to Learn"
}
