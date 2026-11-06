import SwiftUI
import WebKit
import LearnWithAlphonsoKit

/// The bot check on the email form: holds what the native-captcha page has said (BotCheckGate) and asks the page for
/// a fresh widget after each token is spent.
@Observable
@MainActor
final class BotCheckModel {
    private(set) var gate = BotCheckGate()
    @ObservationIgnored weak var webView: WKWebView?
    @ObservationIgnored private var timeoutTask: Task<Void, Never>?

    var canSend: Bool { gate.canSend }

    func receive(_ message: Any) { gate.receive(message) }

    /// Starts the "page never answered" timer (BotCheckGate.pageTimeout).
    func pageStarted() {
        timeoutTask?.cancel()
        timeoutTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(BotCheckGate.pageTimeout))
            guard !Task.isCancelled else { return }
            self?.gate.pageTimedOut()
        }
    }

    func pageFailed() { gate.pageTimedOut() }

    /// The token for one email request, or nil without a bot check. A spent token makes the page render a new widget.
    func spend() -> String? {
        let token = gate.spend()
        if token != nil {
            webView?.evaluateJavaScript("window.alphonsoCaptchaReset && window.alphonsoCaptchaReset()")
        }
        return token
    }
}

/// Cloudflare Turnstile only runs in a web page, so the email form shows ours (`/native-captcha`) in a small web view.
/// Off-domain navigation is refused; the page only talks back through the `alphonsoCaptcha` message handler.
struct BotCheckView: UIViewRepresentable {
    let model: BotCheckModel

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(WeakScriptHandler(context.coordinator), name: "alphonsoCaptcha")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.navigationDelegate = context.coordinator
        webView.accessibilityLabel = "Security check"
        model.webView = webView
        model.pageStarted()
        webView.load(URLRequest(url: AppConfig.apiBaseURL.appendingPathComponent("native-captcha")))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "alphonsoCaptcha")
    }

    @MainActor
    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let model: BotCheckModel
        init(model: BotCheckModel) { self.model = model }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            // Only our own page (the top frame on our host) may hand over a token; never a frame inside it.
            guard message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "https",
                  message.frameInfo.securityOrigin.host == AppConfig.apiBaseURL.host else { return }
            model.receive(message.body)
        }

        func webView(
            _ webView: WKWebView, decidePolicyFor action: WKNavigationAction
        ) async -> WKNavigationActionPolicy {
            // Our page and Cloudflare's challenge frames only; anything else (a link tapped in the widget) is refused.
            let url = action.request.url
            let host = url?.host
            let allowed = (url?.scheme == "https"
                && (host == AppConfig.apiBaseURL.host || host == "challenges.cloudflare.com"))
                || url?.scheme == "about"
            return allowed ? .allow : .cancel
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            model.pageFailed()
        }
    }
}

/// WKUserContentController keeps its handlers strongly; this keeps the coordinator from living forever.
private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
