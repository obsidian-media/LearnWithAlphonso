import Foundation

/// Third-party work that ships inside the app, credited in Settings, Acknowledgements.
/// `licenseResource` is a text file bundled with the app (Sources/Fonts/*-OFL.txt, Sources/Licenses/*.txt).
/// src/lib/ios-binary-polish.test.ts checks every bundled font in Info.plist's UIAppFonts has an entry here
/// and that every licence file exists.
public struct Acknowledgement: Sendable, Equatable, Identifiable {
    public let name: String
    public let licenseName: String
    public let licenseResource: String
    public let url: String
    public var id: String { name }
}

public enum Acknowledgements {
    public static let mit = "MIT License"
    public static let ofl = "SIL Open Font License 1.1"

    public static let all: [Acknowledgement] = [
        Acknowledgement(name: "RevenueCat (purchases-ios)", licenseName: mit, licenseResource: "RevenueCat-LICENSE", url: "https://github.com/RevenueCat/purchases-ios"),
        Acknowledgement(name: "Baloo 2", licenseName: ofl, licenseResource: "Baloo2-OFL", url: "https://github.com/EkType/Baloo2"),
        Acknowledgement(name: "Fraunces", licenseName: ofl, licenseResource: "Fraunces-OFL", url: "https://github.com/undercasetype/Fraunces"),
        Acknowledgement(name: "Geist", licenseName: ofl, licenseResource: "Geist-OFL", url: "https://github.com/vercel/geist-font"),
        Acknowledgement(name: "Instrument Sans", licenseName: ofl, licenseResource: "InstrumentSans-OFL", url: "https://github.com/Instrument/instrument-sans"),
        Acknowledgement(name: "Instrument Serif", licenseName: ofl, licenseResource: "InstrumentSerif-OFL", url: "https://github.com/Instrument/instrument-serif"),
        Acknowledgement(name: "Newsreader", licenseName: ofl, licenseResource: "Newsreader-OFL", url: "https://github.com/productiontype/Newsreader"),
        Acknowledgement(name: "Source Sans 3", licenseName: ofl, licenseResource: "SourceSans3-OFL", url: "https://github.com/adobe-fonts/source-sans"),
    ]
}
