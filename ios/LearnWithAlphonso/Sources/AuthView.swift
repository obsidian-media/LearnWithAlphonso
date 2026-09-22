import SwiftUI

struct AuthView: View {
    let session: Session

    @State private var email = ""
    @State private var code = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: AlphonsoSpacing.lg) {
                Spacer()

                VStack(spacing: AlphonsoSpacing.xs) {
                    Text("Learn with Alphonso")
                        .font(AlphonsoFont.display(32, weight: .semiBold))
                        .foregroundStyle(AlphonsoColor.ink)
                    Text("Sign in to start learning")
                        .font(AlphonsoFont.sans(15))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }

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
                .frame(maxWidth: 360)

                if let message = session.errorMessage {
                    Text(message)
                        .font(AlphonsoFont.sans(13))
                        .foregroundStyle(AlphonsoColor.destructive)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Spacer()
                Spacer()
            }
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(AlphonsoColor.surface)
        }
    }

    private var emailStep: some View {
        VStack(spacing: AlphonsoSpacing.sm) {
            TextField("Email", text: $email)
                .textFieldStyle(.plain)
                .padding(AlphonsoSpacing.sm + 2)
                .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous))
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
                Divider()
                Text("or")
                    .font(AlphonsoFont.sans(12))
                    .foregroundStyle(AlphonsoColor.inkSoft)
                Divider()
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
                .background(AlphonsoColor.parchment, in: RoundedRectangle(cornerRadius: AlphonsoRadius.md, style: .continuous))
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
