import SwiftUI
import AuthenticationServices
import LearnWithAlphonsoKit

struct AuthView: View {
    @Bindable var session: Session
    @FocusState private var codeFieldFocused: Bool

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

                        if let notice = session.notice ?? session.emailFlow.notice {
                            Text(notice)
                                .font(AlphonsoFont.sans(13))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                                .multilineTextAlignment(.center)
                        }
                        if let message = session.emailFlow.failure?.message ?? session.errorMessage {
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

                    // What continuing means, with both documents one tap away.
                    Text(Self.footer)
                        .font(AlphonsoFont.sans(12))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                        .tint(AlphonsoColor.moss)
                        .multilineTextAlignment(.center)
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

    // MARK: - Email step: Apple, Google, then email

    private var emailStep: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            // Apple's own button (HIG), "Continue" title, black on light and white on dark, 50 pt, first.
            // The style is read once when the button is created, so .id rebuilds it after a theme switch.
            SignInWithAppleButton(.continue) { request in
                session.prepareAppleRequest(request)
            } onCompletion: { result in
                Task { await session.completeAppleSignIn(result) }
            }
            .signInWithAppleButtonStyle(appleButtonStyle)
            .id(AlphonsoThemeManager.shared.palette.colorScheme)
            .frame(height: AuthButtonMetrics.height)
            .clipShape(RoundedRectangle(cornerRadius: AuthButtonMetrics.cornerRadius, style: .continuous))
            .disabled(session.isBusy)
            .opacity(session.isBusy ? 0.5 : 1)

            GoogleSignInButton(isBusy: session.isBusy) {
                Task { await session.signInWithGoogle() }
            }

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

            TextField("Email", text: $session.emailFlow.email)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .alphonsoInputBackground()
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .onSubmit { Task { await session.requestCode() } }

            Button {
                Task { await session.requestCode() }
            } label: {
                if session.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Send code")
                }
            }
            .buttonStyle(.alphonsoPrimary)
            .disabled(session.isBusy || !session.emailFlow.canSendCode)
            .accessibilityLabel(session.isBusy ? "Sending code" : "Send code")
        }
    }

    private var appleButtonStyle: SignInWithAppleButton.Style {
        AlphonsoThemeManager.shared.palette.colorScheme == .dark ? .white : .black
    }

    // MARK: - Code step (never a dead end)

    private func codeStep(email: String) -> some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            Text(AuthCopy.codeSentTo(email))
                .font(AlphonsoFont.sans(13))
                .foregroundStyle(AlphonsoColor.inkSoft)
                .multilineTextAlignment(.center)

            TextField(AuthCopy.codeFieldLabel, text: Binding(
                get: { session.emailFlow.code },
                set: { session.enterCode($0) }
            ))
            .textFieldStyle(.plain)
            .padding(AlphonsoSpacing.sm + 2)
            .alphonsoInputBackground()
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .focused($codeFieldFocused)
            .accessibilityLabel(AuthCopy.codeFieldLabel)

            Button {
                Task { await session.verifyCode() }
            } label: {
                if session.isBusy {
                    ProgressView().tint(AlphonsoColor.surface)
                } else {
                    Text("Verify")
                }
            }
            .buttonStyle(.alphonsoPrimary)
            .disabled(session.isBusy || !session.emailFlow.isCodeComplete)
            .accessibilityLabel(session.isBusy ? "Verifying" : "Verify")

            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = session.emailFlow.resendSecondsRemaining(now: context.date)
                Button(remaining > 0 ? AuthCopy.resendIn(remaining) : AuthCopy.resendCode) {
                    Task { await session.resendCode() }
                }
                .buttonStyle(.alphonsoSecondary)
                .disabled(session.isBusy || remaining > 0)
            }

            Button(AuthCopy.useDifferentEmail) {
                session.useDifferentEmail()
            }
            .font(AlphonsoFont.sans(14, weight: .medium))
            .foregroundStyle(AlphonsoColor.moss)
            .frame(minHeight: 44)
            .disabled(session.isBusy)
        }
        .onAppear { codeFieldFocused = true }
    }

    // MARK: - Footer

    static var footer: AttributedString {
        var text = AttributedString(AuthCopy.footerPrefix)
        var terms = AttributedString(AuthCopy.termsOfUse)
        terms.link = AppConfig.apiBaseURL.appendingPathComponent("terms")
        terms.underlineStyle = .single
        var privacy = AttributedString(AuthCopy.privacyPolicy)
        privacy.link = AppConfig.apiBaseURL.appendingPathComponent("privacy")
        privacy.underlineStyle = .single
        text += terms
        text += AttributedString(AuthCopy.footerMiddle)
        text += privacy
        text += AttributedString(AuthCopy.footerSuffix)
        return text
    }
}
