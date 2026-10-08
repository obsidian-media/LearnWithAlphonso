import SwiftUI
import StoreKit
import LearnWithAlphonsoKit

/// The Pro paywall (reached from the Hector tab). Every string, state and text role comes
/// from the Kit's `PaywallPresentation`. This view only lays it out, and it states no
/// price, period, trial or product name of its own.
///
/// Prominence rule (App Store 3.1.2): the price line and the trial line use
/// `presentation.priceStyle` / `trialStyle` through `font(_:)` and nothing else. The Kit
/// test `PaywallPresentationTests.testInvariantsHoldInEveryState` pins that the price
/// style is at least the trial style.
struct PaywallView: View {
    let entitlementStore: EntitlementStore

    // Apple's own recommendation is a direct in-app path to subscription management, not
    // just instructions to go find Settings yourself. manageSubscriptionsSheet is the
    // StoreKit 2 modifier for exactly this: no navigation, no Settings.
    @State private var isPresentingManageSubscriptions = false

    var body: some View {
        let presentation = entitlementStore.presentation
        let state = entitlementStore.state
        ScrollView {
            VStack(spacing: AlphonsoSpacing.lg) {
                Text(presentation.titleText)
                    .font(AlphonsoFont.display(28, weight: .bold))
                    .foregroundStyle(AlphonsoColor.ink)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)

                AlphonsoMascotBanner(mascot: .hector, message: PaywallCopy.mascotMessage)

                Text(PaywallCopy.featureBlurb)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                offer(presentation, state: state)

                if let notice = state.notice {
                    noticeText(notice)
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: AlphonsoSpacing.md) { restoreButton(state); manageButton }
                    VStack(spacing: AlphonsoSpacing.sm) { restoreButton(state); manageButton }
                }
                .font(AlphonsoFont.sans(13, weight: .medium))
                .tint(AlphonsoColor.moss)

                Text(presentation.renewalDisclosure)
                    .font(font(presentation.disclosureStyle))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                legalLinks
            }
            .padding(AlphonsoSpacing.md)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .background(AlphonsoColor.surface)
        .task { await entitlementStore.loadOffering() }
        .onChange(of: state.notice) { _, notice in
            // Purchase and restore results appear below the buttons; tell VoiceOver.
            guard let notice else { return }
            switch notice {
            case .info(let text), .error(let text):
                AccessibilityNotification.Announcement(text).post()
            }
        }
        .manageSubscriptionsSheet(isPresented: $isPresentingManageSubscriptions)
    }

    @ViewBuilder
    private func offer(_ presentation: PaywallPresentation, state: EntitlementState) -> some View {
        switch presentation.state {
        case .loading:
            // Skeleton: same shapes as the loaded offer, redacted. Placeholder text only,
            // never a price.
            VStack(spacing: AlphonsoSpacing.sm) {
                Text("Loading the price").font(font(presentation.priceStyle))
                Text("Loading the free trial details").font(font(presentation.trialStyle))
                Text("Loading").font(AlphonsoFont.sans(17, weight: .semiBold))
                    .padding(.vertical, AlphonsoSpacing.sm)
            }
            .redacted(reason: .placeholder)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(PaywallCopy.loadingAccessibilityLabel)

        case .failed(let message):
            VStack(spacing: AlphonsoSpacing.sm) {
                Text(message)
                    .font(AlphonsoFont.sans(14))
                    .foregroundStyle(AlphonsoColor.ink)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Button(presentation.retryTitle ?? PaywallCopy.tryAgain) {
                    Task { await entitlementStore.loadOffering() }
                }
                .buttonStyle(.alphonsoSecondary)
            }

        case .loaded:
            VStack(spacing: AlphonsoSpacing.sm) {
                if let priceLine = presentation.priceLine {
                    Text(priceLine)
                        .font(font(presentation.priceStyle))
                        .foregroundStyle(AlphonsoColor.ink)
                        .multilineTextAlignment(.center)
                }
                if let trialLine = presentation.trialLine {
                    Text(trialLine)
                        .font(font(presentation.trialStyle))
                        .foregroundStyle(AlphonsoColor.ink)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let ctaTitle = presentation.ctaTitle {
                    Button {
                        Task { await entitlementStore.purchase() }
                    } label: {
                        if state.isPurchasing {
                            ProgressView().tint(AlphonsoColor.onAccent)
                        } else {
                            Text(ctaTitle)
                        }
                    }
                    .buttonStyle(.alphonsoEmber)
                    .disabled(state.isPurchasing || state.isRestoring)
                    .accessibilityLabel(ctaTitle)
                }
            }
        }
    }

    private func restoreButton(_ state: EntitlementState) -> some View {
        Button(PaywallCopy.restore) {
            Task { await entitlementStore.restorePurchases() }
        }
        .disabled(state.isPurchasing || state.isRestoring)
    }

    private var manageButton: some View {
        Button(PaywallCopy.manage) { isPresentingManageSubscriptions = true }
    }

    private var legalLinks: some View {
        VStack(spacing: AlphonsoSpacing.xs) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: AlphonsoSpacing.md) { termsLink; privacyLink }
                VStack(spacing: AlphonsoSpacing.xs) { termsLink; privacyLink }
            }
            Link(PaywallCopy.appleEULA, destination: PaywallLinks.appleStandardEULA)
        }
        .font(AlphonsoFont.sans(12))
        .tint(AlphonsoColor.inkSoft)
    }

    // Same domain the rest of the app trusts for these pages (AppConfig.apiBaseURL).
    private var termsLink: some View {
        Link(PaywallCopy.termsOfUse, destination: AppConfig.apiBaseURL.appendingPathComponent("terms"))
    }

    private var privacyLink: some View {
        Link(PaywallCopy.privacyPolicy, destination: AppConfig.apiBaseURL.appendingPathComponent("privacy"))
    }

    private func noticeText(_ notice: EntitlementState.Notice) -> some View {
        let (text, color): (String, Color) = {
            switch notice {
            case .info(let text): return (text, AlphonsoColor.inkSoft)
            case .error(let text): return (text, AlphonsoColor.destructive)
            }
        }()
        return Text(text)
            .font(AlphonsoFont.sans(13))
            .foregroundStyle(color)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityAddTraits(.updatesFrequently)
    }

    /// The ONLY place a `PaywallTextStyle` becomes a font. AlphonsoFont scales every size
    /// with Dynamic Type by the same factor, so the Kit's prominence order holds at every
    /// text size.
    private func font(_ style: PaywallTextStyle) -> Font {
        AlphonsoFont.sans(CGFloat(style.pointSize), weight: AlphonsoFont.Weight(rawValue: CGFloat(style.weight)) ?? .regular)
    }
}
