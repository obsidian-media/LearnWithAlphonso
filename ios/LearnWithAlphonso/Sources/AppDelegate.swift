import UIKit

/// V4 candidate #2 -- real (remote APNs) push notifications. This app is
/// otherwise pure SwiftUI (LearnWithAlphonsoApp: App, no prior
/// AppDelegate) -- remote-notification registration is the one piece of
/// this feature that's only reachable via UIApplicationDelegate's
/// callback-based API, so this is the minimum UIKit bridge needed, wired
/// in via @UIApplicationDelegateAdaptor in LearnWithAlphonsoApp. Posts
/// plain Foundation NotificationCenter notifications rather than holding
/// a direct reference to RemotePushRegistrar -- SwiftUI's
/// @UIApplicationDelegateAdaptor instantiates this type itself, so
/// there's no constructor-injection path to hand it the registrar
/// directly, and this keeps the coupling one-directional (RemotePushRegistrar
/// observes, AppDelegate only posts) instead of needing static mutable
/// state.
final class AppDelegate: NSObject, UIApplicationDelegate {
    static let deviceTokenNotification = Notification.Name("com.obsidianmedia.learnwithalphonso.remotePushDeviceToken")
    static let registrationFailureNotification = Notification.Name("com.obsidianmedia.learnwithalphonso.remotePushRegistrationFailure")

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        NotificationCenter.default.post(name: Self.deviceTokenNotification, object: deviceToken)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Expected any time the Push Notifications capability isn't
        // actually provisioned yet (every Simulator run, and every device
        // build until a human completes the developer.apple.com setup
        // this feature's design doc flags as the hard blocker) -- never
        // crash or surface this to the user, same "fail silently until
        // configured" contract as the rest of this feature.
        NotificationCenter.default.post(name: Self.registrationFailureNotification, object: error)
    }
}
