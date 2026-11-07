import SwiftUI
import AuthenticationServices
import LearnWithAlphonsoKit

struct AuthView: View {
    @Bindable var session: Session
    private enum Field { case email, code }
    @FocusState private var focusedField: Field?
    @Environment(\.alphonsoDS) private var ds

    private var awaitingCode: Bool {
        if case .awaitingCode = session.state { return true }
        return false
    }

    var body: some View {
        NavigationStack {
            FirstRunScreen {
                // Alphonso in his room, with his speech bubble: the same look as the first run's sign-in step.
                FirstRunRoom(roomID: "room-light", figure: LessonArt.expression(.talk), figureLabel: "Alphonso") {
                    FirstRunHUD(showCounter: false)
                }
                FirstRunBubble(
                    title: awaitingCode ? "Check your email." : "Welcome back.",
                    sub: awaitingCode ? "Type the 6-digit code." : "Sign in to start learning."
                ) { FirstRunVoice.speak(awaitingCode ? "Check your email." : "Welcome back.") }
            } content: {
                VStack(spacing: AlphonsoDS.Space.s3) {
                    VStack(spacing: AlphonsoDS.Space.s2) {
                        switch session.state {
                        case .signedOut:
                            emailStep
                        case .awaitingCode(let email):
                            codeStep(email: email)
                        case .signedIn:
                            EmptyView()
                        }

                        if let notice = session.notice ?? session.emailFlow.notice {
                            Text(notice)
                                .dsText(.footnote)
                                .foregroundStyle(ds.inkSoft)
                                .multilineTextAlignment(.center)
                        }
                        if let message = session.emailFlow.failure?.message ?? session.errorMessage {
                            Text(message)
                                .dsText(.footnote)
                                .foregroundStyle(ds.wrongInk)
                                .multilineTextAlignment(.center)
                        }
                    }

                    // What continuing means, with both documents one tap away.
                    Text(Self.footer)
                        .dsText(.caption)
                        .foregroundStyle(ds.inkSoft)
                        .tint(ds.brand)
                        .multilineTextAlignment(.center)
                        .padding(.top, AlphonsoDS.Space.s1)
                }
                .padding(.horizontal, AlphonsoDS.Space.gutter)
                .padding(.top, AlphonsoDS.Space.s4)
                // A tap outside a field puts the keyboard away.
                .contentShape(Rectangle())
                .simultaneousGesture(TapGesture().onEnded { focusedField = nil })
            } footer: {
                EmptyView()
            }
            // Dragging the content down also dismisses it, and the keyboard bar always offers Done.
            .scrollDismissesKeyboard(.interactively)
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
        }
    }

    private func inputField<F: View>(_ field: F) -> some View {
        let shape = RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous)
        return field
            .dsText(.headline)
            .foregroundStyle(ds.brand)
            .padding(.horizontal, AlphonsoDS.Space.s4)
            .padding(.vertical, AlphonsoDS.Space.s3)
            .background { shape.fill(ds.card) }
            .overlay { shape.strokeBorder(ds.line, lineWidth: 2) }
    }

    // MARK: - Email step: Apple, Google, then email

    private var emailStep: some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
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

            HStack(spacing: AlphonsoDS.Space.s2) {
                // A plain Divider() in an HStack wants to stretch to fill
                // all available cross-axis (vertical) height -- a real bug
                // found on a real device, where this pushed "Continue with
                // Google" almost to the bottom of the screen. Give it an
                // explicit height so it stays a plain 1pt rule.
                Divider().frame(height: 1)
                Text("or")
                    .dsText(.caption)
                    .foregroundStyle(ds.inkSoft)
                Divider().frame(height: 1)
            }

            inputField(TextField("Email", text: $session.emailFlow.email))
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .focused($focusedField, equals: .email)
                .onSubmit {
                    // Return always puts the keyboard away so the bot check and Send code are in view.
                    focusedField = nil
                    if session.botCheck.canSend { Task { await session.requestCode() } }
                }

            // Bot check (Cloudflare Turnstile, usually no tap needed). Apple and Google sign-in never need it.
            BotCheckView(model: session.botCheck)
                .frame(height: 70)

            Button {
                Task { await session.requestCode() }
            } label: {
                if session.isBusy {
                    ProgressView().tint(ds.onAction)
                } else {
                    Text("Send code")
                }
            }
            .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
            .disabled(session.isBusy || !session.emailFlow.canSendCode || !session.botCheck.canSend)
            .accessibilityLabel(session.isBusy ? "Sending code" : "Send code")
        }
    }

    private var appleButtonStyle: SignInWithAppleButton.Style {
        AlphonsoThemeManager.shared.palette.colorScheme == .dark ? .white : .black
    }

    // MARK: - Code step (never a dead end)

    private func codeStep(email: String) -> some View {
        VStack(spacing: AlphonsoDS.Space.s2) {
            Text(AuthCopy.codeSentTo(email))
                .dsText(.footnote)
                .foregroundStyle(ds.inkSoft)
                .multilineTextAlignment(.center)

            inputField(TextField(AuthCopy.codeFieldLabel, text: Binding(
                get: { session.emailFlow.code },
                set: { session.enterCode($0) }
            )))
            .textContentType(.oneTimeCode)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .focused($focusedField, equals: .code)
            .accessibilityLabel(AuthCopy.codeFieldLabel)

            Button {
                Task { await session.verifyCode() }
            } label: {
                if session.isBusy {
                    ProgressView().tint(ds.onAction)
                } else {
                    Text("Verify")
                }
            }
            .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
            .disabled(session.isBusy || !session.emailFlow.isCodeComplete)
            .accessibilityLabel(session.isBusy ? "Verifying" : "Verify")

            TimelineView(.periodic(from: .now, by: 1)) { context in
                let remaining = session.emailFlow.resendSecondsRemaining(now: context.date)
                Button(remaining > 0 ? AuthCopy.resendIn(remaining) : AuthCopy.resendCode) {
                    Task { await session.resendCode() }
                }
                .buttonStyle(LessonEdgeButtonStyle(variant: .secondary))
                .disabled(session.isBusy || remaining > 0 || !session.botCheck.canSend)
            }

            // A resend needs its own single-use bot-check token.
            BotCheckView(model: session.botCheck)
                .frame(height: 70)

            Button(AuthCopy.useDifferentEmail) {
                session.useDifferentEmail()
            }
            .dsText(.headline)
            .foregroundStyle(ds.choice)
            .frame(minHeight: AlphonsoDS.Space.minTouch)
            .disabled(session.isBusy)
        }
        .onAppear { focusedField = .code }
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
