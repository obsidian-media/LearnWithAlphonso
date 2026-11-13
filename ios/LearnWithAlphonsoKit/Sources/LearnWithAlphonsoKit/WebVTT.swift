import Foundation

/// One caption: shown from `start` up to (not including) `end`, in seconds. `text` is plain, lines joined by "\n".
public struct WebVTTCue: Equatable, Sendable {
    public let start: Double
    public let end: Double
    public let text: String

    public init(start: Double, end: Double, text: String) {
        self.start = start
        self.end = end
        self.text = text
    }
}

/// A WebVTT reader for the Watch shelf's captions. AVPlayer does not load a sidecar .vtt next to a progressive mp4, so the
/// app downloads the file, parses it here and draws the current cue over the video. Pure and tested: no clock, no
/// network, no AVFoundation.
///
/// Reads what the owner's captions use and what the format allows around it: an optional byte-order mark, CRLF or LF
/// line ends, an optional cue identifier line, cue settings after the end time, multi-line cue text, `mm:ss.mmm` and
/// `hh:mm:ss.mmm` timestamps, and inline tags (`<b>`, `<c.yellow>`, `<00:01.000>`) which are dropped. NOTE, STYLE and
/// REGION blocks are skipped. A file that does not start with `WEBVTT` is not WebVTT and gives no cues.
public enum WebVTT {
    public static func parse(_ source: String) -> [WebVTTCue] {
        var text = source
        if text.hasPrefix("\u{FEFF}") { text.removeFirst() }
        text = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        let lines = text.components(separatedBy: "\n")
        guard let first = lines.first, first.hasPrefix("WEBVTT"),
              first.count == 6 || first.dropFirst(6).first.map({ $0 == " " || $0 == "\t" }) == true
        else { return [] }

        // Blocks are separated by one or more blank lines.
        var blocks: [[String]] = []
        var current: [String] = []
        for line in lines.dropFirst() {
            if line.trimmingCharacters(in: .whitespaces).isEmpty {
                if !current.isEmpty { blocks.append(current); current = [] }
            } else {
                current.append(line)
            }
        }
        if !current.isEmpty { blocks.append(current) }

        var cues: [WebVTTCue] = []
        for block in blocks {
            guard let head = block.first else { continue }
            if head.hasPrefix("NOTE") || head.hasPrefix("STYLE") || head.hasPrefix("REGION") { continue }
            guard let timingIndex = block.firstIndex(where: { $0.contains("-->") }) else { continue }
            guard let (start, end) = timing(block[timingIndex]) else { continue }
            let body = block[(timingIndex + 1)...].map(plain).filter { !$0.isEmpty }.joined(separator: "\n")
            // A cue with no text, or that ends before it starts, shows nothing: drop it.
            if body.isEmpty || end <= start { continue }
            cues.append(WebVTTCue(start: start, end: end, text: body))
        }
        // Stable by start time, so a file whose cues are out of order still looks up correctly.
        return cues.enumerated().sorted { ($0.element.start, $0.offset) < ($1.element.start, $1.offset) }.map(\.element)
    }

    /// The cue to show at `time`: the one whose interval holds it. Where cues overlap, the one that started last.
    public static func cue(at time: Double, in cues: [WebVTTCue]) -> WebVTTCue? {
        guard time.isFinite else { return nil }
        return cues.last(where: { $0.start <= time && time < $0.end })
    }

    /// `00:07.024`, `1:02:03.500` or `7.5` (seconds) as seconds; nil if it is not a timestamp.
    public static func timestamp(_ raw: String) -> Double? {
        let parts = raw.trimmingCharacters(in: .whitespaces).split(separator: ":", omittingEmptySubsequences: false)
        guard (1...3).contains(parts.count) else { return nil }
        var total = 0.0
        for (index, part) in parts.enumerated() {
            let isSeconds = index == parts.count - 1
            let cleaned = isSeconds ? part.replacingOccurrences(of: ",", with: ".") : String(part)
            guard !cleaned.isEmpty, cleaned.allSatisfy({ $0.isNumber || (isSeconds && $0 == ".") }),
                  let value = Double(cleaned) else { return nil }
            total = total * 60 + value
        }
        return total
    }

    private static func timing(_ line: String) -> (Double, Double)? {
        let sides = line.components(separatedBy: "-->")
        guard sides.count == 2 else { return nil }
        // Cue settings ("align:start position:10%") follow the end time after a space.
        let endToken = sides[1].trimmingCharacters(in: .whitespaces).split(separator: " ", maxSplits: 1).first.map(String.init) ?? ""
        guard let start = timestamp(sides[0]), let end = timestamp(endToken) else { return nil }
        return (start, end)
    }

    private static func plain(_ line: String) -> String {
        line.replacingOccurrences(of: "<[^>]*>", with: "", options: .regularExpression)
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
            .trimmingCharacters(in: .whitespaces)
    }
}
