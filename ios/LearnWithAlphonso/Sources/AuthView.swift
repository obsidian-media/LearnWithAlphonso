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
                        Image(systemName: "book.pages.fill")
                            .font(.system(size: 40))
                            .foregroundStyle(AlphonsoColor.moss)
                            .frame(width: 84, height: 84)
                            .background(AlphonsoColor.emberSoft.opacity(0.5), in: Circle())

                        VStack(spacing: AlphonsoSpacing.xs) {
                            Text("Learn with Alphonso")
                                .font(AlphonsoFont.display(32, weight: .semiBold))
                                .foregroundStyle(AlphonsoColor.ink)
                                .multilineTextAlignment(.center)
                            Text("Sign in to start learning")
                                .font(AlphonsoFont.sans(15))
                                .foregroundStyle(AlphonsoColor.inkSoft)
                        }
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
        }
    }
}
