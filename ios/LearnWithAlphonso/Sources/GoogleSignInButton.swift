import SwiftUI
import LearnWithAlphonsoKit

/// Shared by the Apple and Google buttons so neither is more prominent (Guideline 4.8; Google's
/// "at least as prominently as other third-party options").
enum AuthButtonMetrics {
    static let height: CGFloat = 50
    static let cornerRadius: CGFloat = 8
}

/// Google's light-theme button (developers.google.com/identity/branding-guidelines, read 2026-10-07):
/// fill #FFFFFF, 1 pt #747775 stroke inside, #1F1F1F text, the unmodified multicolour "G" from Google's own
/// asset pack (Assets.xcassets/GoogleG, cropped by scripts/extract-google-g.ts), 16 pt before the logo and
/// after the text, 12 pt between them. Always light, in both colour schemes.
struct GoogleSignInButton: View {
    let isBusy: Bool
    let action: () -> Void

    private static let text = Color(red: 0x1F / 255, green: 0x1F / 255, blue: 0x1F / 255)
    private static let stroke = Color(red: 0x74 / 255, green: 0x77 / 255, blue: 0x75 / 255)

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image("GoogleG")
                    .resizable()
                    .interpolation(.high)
                    .frame(width: 20, height: 20)
                    .accessibilityHidden(true)
                Text(AuthCopy.continueWithGoogle)
                    .font(.system(size: 17, weight: .medium))
                    .foregroundStyle(Self.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, minHeight: AuthButtonMetrics.height, maxHeight: AuthButtonMetrics.height)
            .background(Color.white, in: RoundedRectangle(cornerRadius: AuthButtonMetrics.cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: AuthButtonMetrics.cornerRadius, style: .continuous)
                    .strokeBorder(Self.stroke, lineWidth: 1)
            )
            .opacity(isBusy ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .accessibilityLabel(AuthCopy.continueWithGoogle)
    }
}
