import Foundation

/// The moments a mascot appears at. Raw values are the keys in
/// src/data/mascot-moments.json, shared with the web.
public enum MascotMoment: String, CaseIterable, Sendable {
    case learnGreeting, lessonComplete, lessonCompleteOffline, leaguePromotion, emptyState
    case streakEncourage, questionAsk, campaignComplete, authWelcome
    case hectorIdle, hectorListening, hectorSpeaking, hectorThinking, paywall
}

/// Which mascot and pose a moment shows, and which image asset to use for it.
public enum MascotPoseCatalog {
    struct Entry: Decodable { let mascot: String; let pose: String }
    private struct File: Decodable { let moments: [String: Entry] }

    static let moments: [String: Entry] = {
        guard let url = Bundle.module.url(forResource: "mascot-moments", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data)
        else { return [:] }
        return file.moments
    }()

    /// The pose images bundled so far ("alphonso-proud"), from mascot-poses-available.json.
    public static let bundledPoses: Set<String> = {
        guard let url = Bundle.module.url(forResource: "mascot-poses-available", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let names = try? JSONDecoder().decode([String].self, from: data)
        else { return [] }
        return Set(names)
    }()

    /// The asset is "Alphonso-proud" when that pose is available, otherwise the base "Alphonso" image.
    public static func art(for moment: MascotMoment, available: Set<String> = bundledPoses) -> (mascot: String, assetName: String) {
        let entry = moments[moment.rawValue] ?? Entry(mascot: moment.rawValue.hasPrefix("hector") || moment == .paywall ? "hector" : "alphonso", pose: "happy")
        let base = entry.mascot.prefix(1).uppercased() + entry.mascot.dropFirst()
        let name = "\(entry.mascot)-\(entry.pose)"
        return (entry.mascot, available.contains(name) ? "\(base)-\(entry.pose)" : base)
    }
}
