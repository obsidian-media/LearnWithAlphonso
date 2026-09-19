import Foundation
import Observation
import UIKit
import LearnWithAlphonsoKit

/// Cloud Voice's own sign-in + device-enrollment state, entirely separate
/// from the app's main Session (see AppConfig.cloudVoice* -- a different
/// Supabase project, a different account). Mirrors Session.swift's
/// structure; the extra step here is enroll(), required once per session
/// before TutorConversationClient.respond() will accept requests. Same
/// "in-memory only for this first scaffold slice" caveat as Session.swift.
@Observable
@MainActor
final class HectorSession {
    enum State: Equatable {
        case signedOut
        case awaitingCode(email: String)
        case enrolling
        case ready(accessToken: String)
    }

    private(set) var state: State = .signedOut
    private(set) var errorMessage: String?
    private(set) var isBusy = false

    private let authClient: SupabaseAuthClient
    private let enrollmentClient: DeviceEnrollmentClient
    private let deviceID: String

    init(
        authClient: SupabaseAuthClient = SupabaseAuthClient(
            supabaseURL: AppConfig.cloudVoiceSupabaseURL,
            publishableKey: AppConfig.cloudVoiceSupabasePublishableKey
        ),
        enrollmentClient: DeviceEnrollmentClient = DeviceEnrollmentClient(respondEndpoint: AppConfig.cloudVoiceRespondEndpoint),
        deviceID: String = UIDevice.current.identifierForVendor?.uuidString ?? UUID().uuidString
    ) {
        self.authClient = authClient
        self.enrollmentClient = enrollmentClient
        self.deviceID = deviceID
    }

    func requestCode(email: String) async {
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            try await authClient.requestEmailOTP(email: email)
            state = .awaitingCode(email: email)
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    func verifyCodeAndEnroll(_ code: String) async {
        guard case .awaitingCode(let email) = state else { return }
        errorMessage = nil
        isBusy = true
        defer { isBusy = false }
        do {
            let session = try await authClient.verifyEmailOTP(email: email, code: code)
            state = .enrolling
            try await enrollmentClient.enroll(deviceID: deviceID, displayName: UIDevice.current.name, accessToken: session.accessToken)
            state = .ready(accessToken: session.accessToken)
        } catch {
            state = .awaitingCode(email: email)
            errorMessage = Self.message(for: error)
        }
    }

    func signOut() {
        state = .signedOut
        errorMessage = nil
    }

    private static func message(for error: Error) -> String {
        if let authError = error as? SupabaseAuthError {
            switch authError {
            case .server(_, let message):
                return message ?? "Something went wrong. Please try again."
            case .badResponse, .invalidPayload:
                return "Something went wrong. Please try again."
            }
        }
        if let enrollError = error as? DeviceEnrollmentError {
            switch enrollError {
            case .server(_, let message):
                return message ?? "This device couldn't be enrolled for Hector."
            case .badResponse:
                return "This device couldn't be enrolled for Hector."
            }
        }
        return "Couldn't connect. Check your internet connection and try again."
    }
}
