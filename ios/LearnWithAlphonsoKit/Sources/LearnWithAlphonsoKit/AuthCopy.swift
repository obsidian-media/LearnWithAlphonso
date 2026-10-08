import Foundation

/// Words on the sign-in screen that are not Apple's or Google's own button titles.
public enum AuthCopy {
    public static let footerPrefix = "By continuing, you agree to the "
    public static let termsOfUse = "Terms of Use"
    public static let footerMiddle = " and acknowledge the "
    public static let privacyPolicy = "Privacy Policy"
    public static let footerSuffix = "."
    public static var footer: String { footerPrefix + termsOfUse + footerMiddle + privacyPolicy + footerSuffix }

    public static let continueWithGoogle = "Continue with Google"
    public static let codeFieldLabel = "6-digit code"
    public static let useDifferentEmail = "Use a different email"
    public static let resendCode = "Resend code"

    public static let invalidEmail = "Enter a valid email address."
    public static let invalidCode = "That code isn't right. Check the newest email from us and try again."
    public static let expiredCode = "That code has expired. Tap Resend code to get a new one."
    public static let tooManyRequests = "Too many tries. Wait a minute, then try again."
    public static let generic = "Something went wrong. Try again."
    public static let appleCredentialRevoked =
        "You were signed out because Sign in with Apple was turned off for this app. Sign in again to continue."

    public static func codeSentTo(_ email: String) -> String { "Enter the 6-digit code we sent to \(email)." }
    public static func resendIn(_ seconds: Int) -> String { "Resend code in \(seconds)s" }
    public static func codeResent(to email: String) -> String { "We sent a new code to \(email)." }
}
