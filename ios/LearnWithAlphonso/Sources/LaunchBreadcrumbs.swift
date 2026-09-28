import Foundation
#if canImport(Darwin)
import Darwin
#endif

/// Diagnoses a second "scene-create" watchdog kill on build 38 (2026-09-28)
/// -- same FRONTBOARD/0x8BADF00D/SIGKILL shape as build 29's, but
/// AlphonsoThemeManager.updateSystemColorScheme's equality guard (the fix
/// for that one) is confirmed still present and unchanged, so this is a
/// different loop wearing the same watchdog signature. Neither a console
/// log (no Mac available) nor on-screen debug text (nothing ever renders)
/// can localize it directly.
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
