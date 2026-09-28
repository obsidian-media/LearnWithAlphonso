import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// Diagnoses the "scene-create" watchdog kill found in build 29's crash log
/// (2026-09-28): the app is SIGKILLed by iOS for taking >20s to render its
/// first frame, so neither a console log (no Mac available to read it) nor
/// on-screen debug text (nothing ever renders) can show where the hang is --
/// the exact same "no Mac" constraint an earlier debugging round hit (see
/// `EntitlementStore.loadOffering()`'s history).
///
/// Writes each checkpoint to a file in the app's Documents directory
/// instead, `fsync`ing after every line so a checkpoint survives even if
/// the very next line never gets appended. Documents is visible from the
/// Files app (On My iPhone > Learn with Alphonso) whether or not the app
/// ever successfully launches, since Files reads the directory from disk,
/// not through the running app -- readable with no Mac and no working app.
///
/// **Temporary.** Remove once the hang is found and fixed; this is not a
/// permanent logging mechanism (Sentry, once wired with a real DSN, is).
enum LaunchBreadcrumbs {
    private static let fileURL: URL? = {
        guard let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
            return nil
        }
        return dir.appendingPathComponent("launch-breadcrumbs.log")
    }()

    /// Truncates the previous run's log so each launch's trail is
    /// unambiguous -- call once, as the very first line of `App.init()`.
    static func startNewRun() {
        guard let fileURL else { return }
        try? "".write(to: fileURL, atomically: true, encoding: .utf8)
        log("run started")
    }

    static func log(_ message: String, file: String = #fileID, line: Int = #line) {
        guard let fileURL else { return }
        let timestamp = Date().timeIntervalSince1970
        let entry = "[\(timestamp)] \(file):\(line) \(message)\n"
        guard let data = entry.data(using: .utf8) else { return }
        if let handle = try? FileHandle(forWritingTo: fileURL) {
            defer { try? handle.close() }
            handle.seekToEndOfFile()
            handle.write(data)
            // fsync, not just write(): write() can still be sitting in a
            // kernel buffer, not on disk, at the exact moment SIGKILL
            // lands -- fine for an ordinary log, not acceptable for the
            // one line that's supposed to survive the process dying.
            fsync(handle.fileDescriptor)
        } else {
            try? data.write(to: fileURL)
        }
    }
}
