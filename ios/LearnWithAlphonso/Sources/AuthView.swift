import SwiftUI

struct AuthView: View {
    let session: Session

    @State private var email = ""
    @State private var code = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 8) {
                    Text("Learn with Alphonso")
                        .font(.largeTitle.bold())
                    Text("Sign in to start learning")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
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
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }

                Spacer()
                Spacer()
            }
            .padding()
        }
    }

    private var emailStep: some View {
        VStack(spacing: 12) {
            TextField("Email", text: $email)
                .textFieldStyle(.roundedBorder)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            Button {
                Task { await session.requestCode(email: email) }
            } label: {
                if session.isBusy {
                    ProgressView()
                } else {
                    Text("Send code")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(session.isBusy || !email.contains("@"))
        }
    }

    private func codeStep(email: String) -> some View {
        VStack(spacing: 12) {
            Text("Enter the code sent to \(email)")
                .font(.footnote)
                .foregroundStyle(.secondary)

            TextField("6-digit code", text: $code)
                .textFieldStyle(.roundedBorder)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)

            Button {
                Task { await session.verifyCode(code) }
            } label: {
                if session.isBusy {
                    ProgressView()
                } else {
                    Text("Verify")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(session.isBusy || code.isEmpty)
        }
    }
}
