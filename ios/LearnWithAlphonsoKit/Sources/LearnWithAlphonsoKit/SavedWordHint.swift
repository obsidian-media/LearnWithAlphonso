import Foundation

/// When to show the "Tap a word to save it." hint under a lesson explanation.
///
/// Words in an explanation are styled as plain text (the link tint is set to the
/// text colour so the lesson does not look like a page of links), so without a
/// hint a learner cannot discover they are tappable -- the chat screens carry a
/// permanent hint line for the same reason. A permanent line under every
/// explanation would be noise across a ten-question lesson, so this one is shown
/// only the first few times, then goes away.
public enum SavedWordHint {
    /// Few enough to never nag, enough that missing it once is not fatal.
    public static let maxShows = 3

    public static func shouldShow(timesShown: Int) -> Bool {
        timesShown < maxShows
    }
}
