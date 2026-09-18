// swift-tools-version:5.10
import PackageDescription

/// Portable, non-UI logic for the "Learn with Alphonso" native iOS app --
/// content models, the bundled-content loader, and (later) the SRS engine
/// port and gamification math. Deliberately a plain Swift Package with zero
/// UIKit/SwiftUI dependency, so it builds and tests on any platform with a
/// Swift toolchain (this was written and verified on Windows, not macOS --
/// see docs/superpowers/specs/2026-09-17-native-ios-app-design.md for why
/// that distinction matters). The eventual Xcode iOS app target imports
/// this package as a local dependency rather than duplicating this code
/// inline -- standard practice for factoring an iOS app's logic out from
/// its UI layer.
let package = Package(
    name: "LearnWithAlphonsoKit",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "LearnWithAlphonsoKit",
            targets: ["LearnWithAlphonsoKit"]
        )
    ],
    targets: [
        .target(
            name: "LearnWithAlphonsoKit",
            resources: [
                .copy("Resources/curriculum-en.json"),
                .copy("Resources/curriculum-fr.json"),
                .copy("Resources/scenarios.json"),
            ]
        ),
        .testTarget(
            name: "LearnWithAlphonsoKitTests",
            dependencies: ["LearnWithAlphonsoKit"]
        ),
    ]
)
