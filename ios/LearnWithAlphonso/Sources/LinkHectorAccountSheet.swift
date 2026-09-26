import SwiftUI
import LearnWithAlphonsoKit

/// Hector re-parenting Phase 2
/// (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
/// lets a user who already has a Hector/Cloud Voice sign-in link it to
/// this account explicitly, from Settings, rather than only ever
/// getting linked as an automatic side effect of opening the Hector tab
/// (Phase 0's `HectorView.onChange`).
///
/// **Why this needs its own entry point, not just Phase 0's automatic
/// link.** `HectorSession` holds no persisted session (same "in-memory
/// only" caveat `Session.swift` used to have, before Keychain
/// persistence -- Hector never got that treatment). So "next time an
/// existing Hector user opens Hector" already re-authenticates and
/// already auto-links via Phase 0, with nothing further needed *for
/// that population*. The population Phase 0 alone can't reach is
/// narrower and more consequential: someone who deletes their main
/// account **without ever reopening Hector after Phase 0 shipped**.
/// This sheet is the one moment they can still be reached -- offered
/// from Settings, most usefully right before deleting.
///
/// **No guessing, ever.** This reuses the exact same real,
/// email/OTP-confirmed pairing Phase 0 already trusts -- there is no
/// "is this you?" heuristic based on matching emails anywhere in this
/// flow (a private-relay or simply different email would make that
/// unsafe -- see the design doc's Question 2). Skipping this sheet
/// leaves the account unlinked, permanently, by default; the user's
/// own account deletion still proceeds in full either way
/// (`hectorRevoked: false`, same shape as `appleRevoked: false`).
struct LinkHectorAccountSheet: View {
    let session: Session

    @Environment(\.dismiss) private var dismiss
    @State private var hectorSession = HectorSession()
    @State private var didLink = false

    var body: some View {
        NavigationStack {
            Group {
                if didLink {
                    confirmationBody
                } else {
                    signInBody
                }
            }
            .background(AlphonsoColor.surface)
            .navigationTitle("Link Hector Account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(didLink ? "Done" : "Cancel") { dismiss() }
                }
            }
        }
        .tint(AlphonsoColor.ember)
        // Same shape as HectorView's own `.onChange(of:
        // hectorSession.enrolledCloudVoiceUserID)` -- small, deliberate
        // per-screen duplication (this codebase's established
        // precedent, see HectorTurnRecorder's own doc comment) rather
        // than a shared abstraction for five lines. Fire-and-forget:
        // Hector enrollment already succeeded by the time this fires.
        .onChange(of: hectorSession.enrolledCloudVoiceUserID) { _, cloudVoiceUserID in
            // Send the Cloud Voice access token, never the id itself --
            // the server derives the id by verifying this token against
            // Cloud Voice's own project (see AccountClient.linkHectorAccount's
            // doc comment for why trusting a claimed id here was the bug).
            guard cloudVoiceUserID != nil,
                  let accessToken = session.accessToken,
                  case .ready(let hectorAccessToken) = hectorSession.state
            else { return }
            Task {
                let client = AccountClient(baseURL: AppConfig.apiBaseURL, accessToken: { accessToken })
                try? await client.linkHectorAccount(cloudVoiceAccessToken: hectorAccessToken)
                didLink = true
            }
        }
    }

    private var signInBody: some View {
        VStack(spacing: AlphonsoSpacing.md) {
            Text("Sign in to your existing Hector account")
                .font(AlphonsoFont.display(20, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
                .multilineTextAlignment(.center)

            Text("This links it to your Learn with Alphonso account, so deleting one deletes both.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)

            switch hectorSession.state {
            case .signedOut:
                LinkHectorEmailStep(hectorSession: hectorSession)
            case .awaitingCode(let email):
                LinkHectorCodeStep(hectorSession: hectorSession, email: email)
            case .enrolling:
                ProgressView("Connecting to Hector...").tint(AlphonsoColor.ember)
            case .ready:
                // Transitional -- the onChange above flips didLink to
                // true within one network round trip of reaching here.
                ProgressView().tint(AlphonsoColor.ember)
            }

            if let errorMessage = hectorSession.errorMessage {
                Text(errorMessage)
                    .font(AlphonsoFont.sans(13))
                    .foregroundStyle(AlphonsoColor.destructive)
                    .multilineTextAlignment(.center)
            }
        }
        .padding()
        .frame(maxWidth: 360)
    }

    private var confirmationBody: some View {
        VStack(spacing: AlphonsoSpacing.md) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 40))
                .foregroundStyle(AlphonsoColor.moss)
            Text("Hector account linked")
                .font(AlphonsoFont.display(18, weight: .semiBold))
                .foregroundStyle(AlphonsoColor.ink)
            Text("It's now included whenever you delete your Learn with Alphonso account.")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

/// Same shape as HectorView's own (private, unreachable from here)
/// `HectorEmailStep` -- duplicated, not shared, same reasoning as this
/// file's own header comment.
private struct LinkHectorEmailStep: View {
    let hectorSession: HectorSession
    @State private var email = ""

    var body: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            TextField("Email", text: $email)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .alphonsoInputBackground()
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            Button {
                Task { await hectorSession.requestCode(email: email) }
            } label: {
                if hectorSession.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Send code")
                }
            }
            .buttonStyle(.alphonsoEmber)
            .disabled(hectorSession.isBusy || !email.contains("@"))
        }
    }
}

private struct LinkHectorCodeStep: View {
    let hectorSession: HectorSession
    let email: String
    @State private var code = ""

    var body: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            Text("Enter the code sent to \(email)")
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
            TextField("6-digit code", text: $code)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .alphonsoInputBackground()
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
            Button {
                Task { await hectorSession.verifyCodeAndEnroll(code) }
            } label: {
                if hectorSession.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Verify")
                }
            }
            .buttonStyle(.alphonsoEmber)
            .disabled(hectorSession.isBusy || code.isEmpty)
        }
    }
}
