import Foundation

/// The two calls a completion needs. ProgressSyncClient is the production conformer; tests script it.
public protocol LessonCompletionAPI: Sendable {
    func startLessonSession(lessonID: String, course: String) async throws -> String
    func completeLesson(lessonID: String, total: Int, answers: [LessonAnswer], course: String, sessionToken: String) async throws -> LessonCompletionResult
}

extension ProgressSyncClient: LessonCompletionAPI {}

/// What the app's Session can give: a token, "not signed in", or "signed in but the refresh could not reach
/// the server" (offline).
public enum AccessTokenResult: Sendable, Equatable {
    case token(String)
    case signedOut
    case unreachable
}

public struct LessonCompletionRequest: Sendable, Equatable {
    public let lessonID: String
    public let total: Int
    public let answers: [LessonAnswer]
    public let course: String
    /// The token from start-lesson-session when the lesson OPENED. Nil means "start one now".
    public let sessionToken: String?

    public init(lessonID: String, total: Int, answers: [LessonAnswer], course: String, sessionToken: String?) {
        self.lessonID = lessonID
        self.total = total
        self.answers = answers
        self.course = course
        self.sessionToken = sessionToken
    }

    public init(_ pending: PendingLessonCompletion) {
        self.init(lessonID: pending.lessonID, total: pending.total, answers: pending.answers,
                  course: pending.course, sessionToken: pending.sessionToken)
    }
}

/// One completion attempt, shared by the live finish and the sync queue, so both handle failures identically:
/// - a held session token is used as is (the lesson was gated when it opened, not at the finish line);
/// - a 401 refreshes the access token once and retries;
/// - a 403 from complete-lesson on a held token (older than its 3 h lifetime) mints one new token and
///   retries once;
/// - everything else is classified by LessonCompletionError.
public struct LessonCompletionService: Sendable {
    public typealias TokenProvider = @Sendable (_ forceRefresh: Bool) async -> AccessTokenResult
    public typealias ClientFactory = @Sendable (_ accessToken: String) -> any LessonCompletionAPI

    private let token: TokenProvider
    private let makeClient: ClientFactory

    public init(token: @escaping TokenProvider, makeClient: @escaping ClientFactory) {
        self.token = token
        self.makeClient = makeClient
    }

    public func complete(_ request: LessonCompletionRequest) async -> Result<LessonCompletionResult, LessonCompletionError> {
        var accessToken: String
        switch await token(false) {
        case let .token(value): accessToken = value
        case .signedOut: return .failure(.unauthorized)
        case .unreachable: return .failure(.offline)
        }
        var sessionToken = request.sessionToken
        var refreshed = false
        var reminted = false
        while true {
            let client = makeClient(accessToken)
            do {
                let sessionForCall: String
                if let sessionToken { sessionForCall = sessionToken } else {
                    sessionForCall = try await client.startLessonSession(lessonID: request.lessonID, course: request.course)
                    sessionToken = sessionForCall
                }
                return .success(try await client.completeLesson(
                    lessonID: request.lessonID, total: request.total, answers: request.answers,
                    course: request.course, sessionToken: sessionForCall))
            } catch let ProgressSyncError.server(status, _) where status == 401 && !refreshed {
                refreshed = true
                switch await self.token(true) {
                case let .token(value): accessToken = value
                case .signedOut: return .failure(.unauthorized)
                case .unreachable: return .failure(.offline)
                }
            } catch let ProgressSyncError.server(status, _) where status == 403 && !reminted && sessionToken != nil {
                reminted = true
                sessionToken = nil
            } catch {
                return .failure(.classify(error))
            }
        }
    }
}
