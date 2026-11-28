import SwiftUI
import LearnWithAlphonsoKit

/// The partner, chosen at the start of EACH stage (the owner's pick 5B). "Start with Alphonso" is the main button for
/// everyone. Hector is the second choice: a learner who is not Pro sees a Pro badge on him, and choosing him opens the
/// existing Pro paywall instead of starting a call. On the last stage a Hector run can also be hard mode. Both are AI,
/// and the sheet says so. The rules (badge, door, hard mode) are the Kit's `RehearsalPartner`; this file only draws them.
///
/// `hectorAvailable` is the server's answer: true is Pro, false is not, nil is "could not tell", which lets the learner
/// try (the run's own first turn checks Pro once, and a refusal there opens the paywall).
struct RehearsalPartnerSheet: View {
    let stage: RehearsalStage
    let hectorAvailable: Bool?
    let entitlementStore: EntitlementStore?
    /// The learner's choice: who, and whether hard mode.
    let onChoose: (RehearsalPersona, Bool) -> Void
    let onClose: () -> Void

    @State private var hardMode = false
    @State private var showingPaywall = false
    @Environment(\.alphonsoDS) private var ds

    var body: some View {
        if showingPaywall, let entitlementStore {
            PaywallView(entitlementStore: entitlementStore, source: .rehearsalEntry, onClose: onClose)
        } else {
            sheet
        }
    }

    private var offersHardMode: Bool { RehearsalPartner.offersHardMode(stage: stage, hectorAvailable: hectorAvailable) }

    private var sheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                    Text(stage.label).dsText(.title).foregroundStyle(ds.ink).accessibilityAddTraits(.isHeader)
                    Text(RehearsalPartner.title).dsText(.footnote).foregroundStyle(ds.inkSoft)
                }

                Button(RehearsalPartner.alphonsoButton) { onChoose(.alphonso, false) }
                    .buttonStyle(.alphonsoPrimary(fullWidth: true))
                    .accessibilityHint("Alphonso is an AI")

                VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
                    hectorHeader
                    Text(RehearsalPartner.hectorBlurb).dsText(.footnote).foregroundStyle(ds.inkSoft)
                    if offersHardMode {
                        Toggle(isOn: $hardMode) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(RehearsalPartner.hardModeTitle).dsText(.footnote).foregroundStyle(ds.ink)
                                Text(RehearsalPartner.hardModeBody).dsText(.caption).foregroundStyle(ds.inkSoft)
                            }
                        }
                        .tint(ds.choice)
                        .frame(minHeight: AlphonsoDS.Space.minTouch)
                        .accessibilityIdentifier("rehearsalHardModeToggle")
                    }
                    Button(RehearsalPartner.hectorButton(hectorAvailable: hectorAvailable, hardMode: hardMode && offersHardMode)) {
                        switch RehearsalPartner.hectorDoor(hectorAvailable: hectorAvailable) {
                        case .start: onChoose(.hector, hardMode && offersHardMode)
                        // The existing paywall; with no store to show it (a preview) the sheet just closes.
                        case .paywall: if entitlementStore == nil { onClose() } else { showingPaywall = true }
                        }
                    }
                    .buttonStyle(.alphonsoSecondary(fullWidth: true))
                    .accessibilityLabel(RehearsalPartner.hectorAccessibilityLabel(
                        hectorAvailable: hectorAvailable, hardMode: hardMode && offersHardMode))
                    .accessibilityIdentifier("rehearsalStartHector")
                }
                .padding(AlphonsoDS.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).fill(ds.card))
                .overlay(RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous).strokeBorder(ds.line, lineWidth: 1))

                Button(RehearsalPartner.notNow) { onClose() }
                    .dsText(.footnote).foregroundStyle(ds.inkSoft)
                    .frame(maxWidth: .infinity, minHeight: AlphonsoDS.Space.minTouch)
            }
            .padding(AlphonsoDS.Space.gutter)
        }
        .background(ds.surface)
        .presentationDetents([.medium, .large])
    }

    /// "Hector", the AI label and (for a learner who is not Pro) a Pro badge, read as one line by VoiceOver.
    private var hectorHeader: some View {
        HStack(spacing: AlphonsoDS.Space.s2) {
            Text("Hector").dsText(.headline).foregroundStyle(ds.ink)
            AILabelView()
            if RehearsalPartner.showsProBadge(hectorAvailable: hectorAvailable) {
                Text(RehearsalPartner.proBadge)
                    .dsText(.caption).foregroundStyle(ds.actionText)
                    .padding(.horizontal, AlphonsoDS.Space.s2).padding(.vertical, 2)
                    .background(ds.choiceTint, in: Capsule())
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(RehearsalPartner.showsProBadge(hectorAvailable: hectorAvailable)
                            ? "Hector, AI. Needs Alphonso Pro" : "Hector, AI")
        .accessibilityAddTraits(.isHeader)
    }
}
