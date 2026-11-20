import Foundation

/// The short-lived files Say it right writes only so the system can decode a clip's samples for its waveform (the
/// learner's voice among them). They are deleted straight after the decode; this names them with one distinctive prefix
/// so a process killed mid-decode cannot leave a voice behind: `sweep` removes every leftover, at app launch and each
/// time the screen opens. Mirrors core/logic/ClipTempFiles.kt.
public enum ClipTempFiles {
    public static let prefix = "sir-wave-"

    /// A fresh temporary file name carrying the prefix.
    public static func name(fileExtension: String) -> String { "\(prefix)\(UUID().uuidString).\(fileExtension)" }

    /// Deletes every leftover in `directory`, and returns how many it removed.
    @discardableResult
    public static func sweep(in directory: URL, fileManager: FileManager = .default) -> Int {
        guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else { return 0 }
        var removed = 0
        for name in names where name.hasPrefix(prefix) {
            if (try? fileManager.removeItem(at: directory.appendingPathComponent(name))) != nil { removed += 1 }
        }
        return removed
    }
}
