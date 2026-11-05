import Foundation

/// Which kind of install this is. Preview-only screens (the 3D Alphonso preview) are shown on
/// TestFlight and debug builds and never in an App Store build.
///
/// TestFlight installs carry a sandbox receipt (`sandboxReceipt`); an App Store install's receipt is
/// `receipt`. A debug build (Xcode, simulator) is always allowed.
enum BuildChannel {
    /// Pure so it can be reasoned about: the receipt file name decides, nothing else.
    static func isTestFlight(receiptFileName: String?) -> Bool {
        receiptFileName == "sandboxReceipt"
    }

    /// True on a debug build or a TestFlight install. False for every App Store install.
    static var isTestFlightOrDebug: Bool {
        #if DEBUG
        return true
        #else
        return isTestFlight(receiptFileName: Bundle.main.appStoreReceiptURL?.lastPathComponent)
        #endif
    }
}
