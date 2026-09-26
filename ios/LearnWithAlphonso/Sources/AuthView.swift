import SwiftUI

struct AuthView: View {
    let session: Session

    @State private var email = ""
    @State private var code = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: AlphonsoSpacing.xl) {
                    VStack(spacing: AlphonsoSpacing.md) {
                        Text("Learn with Alphonso")
                            .font(AlphonsoFont.display(32, weight: .semiBold))
                            .foregroundStyle(AlphonsoColor.ink)
                            .multilineTextAlignment(.center)

                        // Alphonso himself greets you -- the app's own
                        // namesake had zero visual presence anywhere
                        // before this; the sign-in screen is the first
                        // thing every user ever sees. A banner (not just
                        // a small circular avatar) so he's actually
                        // "speaking" the greeting, not just decorating it.
                        AlphonsoMascotBanner(mascot: .alphonso, message: "Sign in to start learning")
                            .springEntrance(response: 0.6, dampingFraction: 0.65, minScale: 0.9)
                    }

                    VStack(spacing: AlphonsoSpacing.md) {
                        Group {
                            switch session.state {
                            case .signedOut:
                                emailStep
                            case .awaitingCode(let email):
                                codeStep(email: email)
                            case .signedIn:
                                EmptyView()
                            }
                        }

                        if let message = session.errorMessage {
                            Text(message)
                                .font(AlphonsoFont.sans(13))
                                .foregroundStyle(AlphonsoColor.destructive)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .padding(AlphonsoSpacing.lg)
                    .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: AlphonsoRadius.xl, style: .continuous)
                            .strokeBorder(AlphonsoColor.hairline, lineWidth: 1)
                    )
                }
                .frame(maxWidth: 400)
                .padding(AlphonsoSpacing.lg)
                .padding(.top, AlphonsoSpacing.xxl)
                .frame(maxWidth: .infinity)
            }
            .background(AlphonsoColor.surface)
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var emailStep: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            // App Store Guideline 4.8: an app offering a third-party social
            // login (Google, below) must also offer an equivalent
            // privacy-preserving option -- Apple first, per the sign-in
            // audit's ordering.
            Button {
                Task { await session.signInWithApple() }
            } label: {
                if session.isBusy {
                    ProgressView()
                } else {
                    Label("Continue with Apple", systemImage: "apple.logo")
                }
            }
            .buttonStyle(.alphonsoSecondary)
            .disabled(session.isBusy)
            // Every busy-state button on this screen swaps its label for a
            // bare ProgressView with no text -- fine for a sighted user
            // (the spinner itself communicates "working"), but VoiceOver
            // then has no accessible name for the button at all. Setting
            // the label explicitly, in both branches, means it's always
            // correct regardless of which one renders.
            .accessibilityLabel(session.isBusy ? "Signing in" : "Continue with Apple")

            Button {
                Task { await session.signInWithGoogle() }
            } label: {
                if session.isBusy {
                    ProgressView()
                } else {
                    Text("Continue with Google")
                }
            }
            .buttonStyle(.alphonsoSecondary)
            .disabled(session.isBusy)
            .accessibilityLabel(session.isBusy ? "Signing in" : "Continue with Google")

            HStack(spacing: AlphonsoSpacing.sm) {
                // A plain Divider() in an HStack wants to stretch to fill
                // all available cross-axis (vertical) height -- a real bug
                // found on a real device, where this pushed "Continue with
                // Google" almost to the bottom of the screen. Give it an
                // explicit height so it stays a plain 1pt rule.
                Divider().frame(height: 1)
                Text("or")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                Divider().frame(height: 1)
            }

            TextField("Email", text: $email)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .alphonsoInputBackground()
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            Button {
                Task { await session.requestCode(email: email) }
            } label: {
                if session.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Send code")
                }
            }
            .buttonStyle(.alphonsoPrimary)
            .disabled(session.isBusy || !email.contains("@"))
            .accessibilityLabel(session.isBusy ? "Sending code" : "Send code")
        }
    }

    private func codeStep(email: String) -> some View {
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
                Task { await session.verifyCode(code) }
            } label: {
                if session.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Verify")
                }
            }
            .buttonStyle(.alphonsoPrimary)
            .disabled(session.isBusy || code.isEmpty)
            .accessibilityLabel(session.isBusy ? "Verifying" : "Verify")
        }
    }
}
