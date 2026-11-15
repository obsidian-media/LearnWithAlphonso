import UIKit
import UserNotifications
import LearnWithAlphonsoKit

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
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    static let deviceTokenNotification = Notification.Name("com.obsidianmedia.learnwithalphonso.remotePushDeviceToken")
    static let registrationFailureNotification = Notification.Name("com.obsidianmedia.learnwithalphonso.remotePushRegistrationFailure")

    /// Takes the notification delegate role so a tap on "a person replied" can open the Help chat. Until now the app had no
    /// delegate at all: a foreground notification was not shown and a tap only opened the app. Both stay exactly so for
    /// every notification except a support reply (see the two methods below).
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// A support reply shows as a banner even while the app is open (the learner may be on another screen); everything
    /// else keeps the old behaviour, silent in the foreground.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let destination = notificationTapDestination(userInfo: notification.request.content.userInfo)
        completionHandler(destination == .help ? [.banner, .sound] : [])
    }

    /// A tap on a notification. Only a support reply has a destination (the Help chat); the rest just open the app.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let destination = notificationTapDestination(userInfo: response.notification.request.content.userInfo)
        if destination == .help {
            Task { @MainActor in SupportPushTap.shared.pending = true }
        }
        completionHandler()
    }

    /// Portrait everywhere, decided in code. App Review runs this iPhone-only app on iPads in
    /// compatibility mode, and the app was designed and tested only in portrait (iPhone is portrait-only via
    /// UISupportedInterfaceOrientations~iphone). The four-orientation base key stays in project.yml because
    /// App Store Connect's upload validator demanded it (ITMS-90474); this method, not that key, is what
    /// keeps the app upright.
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        .portrait
    }

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
