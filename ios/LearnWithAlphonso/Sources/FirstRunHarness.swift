#if DEBUG
import SwiftUI
import LearnWithAlphonsoKit

/// DEBUG ONLY, for screenshots and UI tests: `-UITestFirstRunHarness <screen>` shows one first-run screen that
/// normally needs a signed-in account (the picture, how you heard, Meet Hector, Complete your profile) with a
/// made-up learner and no session. Nothing on these screens is tapped through to a save. Never compiled into
/// Release, so the shipped app has no way in.
enum FirstRunHarness {
    static var screen: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-UITestFirstRunHarness"), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
}

struct FirstRunHarnessView: View {
    let screen: String
    let session: Session
    let entitlementStore: EntitlementStore
    let contentStore: ContentStore

    private let store = FirstRunStore(draftStorage: InMemoryFirstRunKeyValue(), blockStorage: InMemoryFirstRunKeyValue())

    var body: some View {
        switch screen {
        case "avatar":
            FirstRunAvatarStep(session: session, name: "Sam", seed: "animal:fox") {}
        case "heard":
            FirstRunHeardStep(session: session, course: "es") {}
        case "hector":
            MeetHectorView(entitlementStore: entitlementStore, name: "Sam", course: "es", interests: ["food"], onFinish: { _ in })
        case "hector-trial":
            // A stand-in for a store offer of 7 days, to show the line; the real one comes from StoreKit.
            MeetHectorView(entitlementStore: entitlementStore, name: "Sam", course: "es", interests: ["food"],
                           trialDaysOverride: 7, onFinish: { _ in })
        case "complete-hello", "complete-about":
            FirstRunFlowView(
                mode: .complete, store: store, contentStore: contentStore,
                prefill: LearnerAnswers(name: "Robin", nativeLanguage: "en", country: "GB"), course: "fr",
                onExit: {}, onBlocked: {}, onUnder13Ok: {}, startIndex: screen == "complete-about" ? 1 : 0)
        case "profile":
            ProfileAvatarHarness()
        case "avatar-profile":
            // The picker Profile and Settings open; saving needs an account, so nothing is tapped here.
            AvatarPickerSheet(session: session, name: "Sam", current: "animal:owl") { _ in }
        default:
            Text("Unknown harness screen \(screen)")
        }
    }
}

/// Profile's new card with a fixed learner (no account behind it).
private struct ProfileAvatarHarness: View {
    @Environment(\.alphonsoDS) private var ds
    var body: some View {
        VStack(spacing: AlphonsoDS.Space.s4) {
            HStack(spacing: AlphonsoDS.Space.s4) {
                ProfileAvatarView(seed: "animal:owl", name: "Sam", size: 72)
                VStack(alignment: .leading) {
                    Text("Sam").dsText(.title).foregroundStyle(ds.brand)
                    Text("Change picture").dsText(.footnote).foregroundStyle(ds.choice)
                }
                Spacer()
            }
            AvatarPickerGrid(value: "animal:owl", name: "Sam", initialsSeed: "a") { _ in }
            Spacer()
        }
        .padding(AlphonsoDS.Space.s5)
        .background(ds.surface.ignoresSafeArea())
    }
}
#endif
