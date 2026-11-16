import Foundation

/// Which picture a screen scene shows: the day image (`Scene-<name>`) or, in Royal night, the night image
/// (`SceneNight-<name>`). The view (ScreenScene.swift) only draws what this picks.
public enum ScreenSceneArt {
    /// The scenes that have a Royal-night picture. Lesson complete has none: it stays light.
    public static let nightScenes: Set<String> = ["hector", "learn", "listen", "practice", "profile"]

    /// `night` is `DSPaletteID.usesNight(deviceDark:)`: true only for Royal on a dark device, never for Meadow.
    public static func assetName(scene: String, night: Bool) -> String {
        night && nightScenes.contains(scene) ? "SceneNight-\(scene)" : "Scene-\(scene)"
    }
}
