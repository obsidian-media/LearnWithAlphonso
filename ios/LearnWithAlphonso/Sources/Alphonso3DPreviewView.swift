import AVFoundation
import SwiftUI
import UIKit
import WebKit

/// "3D Alphonso (preview)": a TestFlight/debug-only screen that hosts the bundled page in `Preview3D/`.
/// The page renders the rigged model with three.js. The model (about 16 MB) is downloaded from its URL
/// when the page opens and is never part of the app bundle (see `src/lib/ios-3d-preview-guards.test.ts`).
/// Reach it only through `BuildChannel.isTestFlightOrDebug`.
struct Alphonso3DPreviewView: View {
    enum Phase: Equatable {
        case loading(percent: Int?)
        case ready
        case failed
    }

    @State private var phase: Phase = .loading(percent: nil)
    @State private var reloadToken = 0

    var body: some View {
        ZStack {
            AlphonsoColor.parchment.ignoresSafeArea()
            Alphonso3DWebView(reloadToken: reloadToken) { event in
                switch event {
                case .progress(let percent):
                    if case .loading = phase { phase = .loading(percent: percent) }
                case .ready: phase = .ready
                case .failed: phase = .failed
                }
            }
            .opacity(phase == .ready ? 1 : 0)
            .accessibilityHidden(phase != .ready)

            switch phase {
            case .loading(let percent):
                VStack(spacing: AlphonsoSpacing.md) {
                    ProgressView()
                    Text(percent.map { "Loading Alphonso in 3D... \($0)%" } ?? "Loading Alphonso in 3D...")
                        .font(AlphonsoFont.sans(15))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("alphonso3DLoading")
            case .failed:
                VStack(spacing: AlphonsoSpacing.md) {
                    Text("Alphonso could not load")
                        .font(AlphonsoFont.display(20, weight: .bold))
                        .foregroundStyle(AlphonsoColor.ink)
                    Text("The 3D model downloads when this screen opens. Check your connection and try again.")
                        .font(AlphonsoFont.sans(15))
                        .foregroundStyle(AlphonsoColor.inkSoft)
                        .multilineTextAlignment(.center)
                    Button("Retry") {
                        phase = .loading(percent: nil)
                        reloadToken += 1
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(AlphonsoColor.moss)
                    .frame(minHeight: AlphonsoSpacing.minTouchTarget)
                    .accessibilityIdentifier("alphonso3DRetry")
                }
                .padding(AlphonsoSpacing.lg)
            case .ready:
                EmptyView()
            }
        }
        .navigationTitle("3D Alphonso (preview)")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            // Web Audio follows the ringer switch unless the session is "playback"; the voice button should be heard.
            try? AVAudioSession.sharedInstance().setCategory(.playback)
        }
    }
}

enum Alphonso3DPreviewEvent {
    case progress(Int)
    case ready
    case failed
}

private struct Alphonso3DWebView: UIViewRepresentable {
    let reloadToken: Int
    let onEvent: (Alphonso3DPreviewEvent) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onEvent: onEvent) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsInlineMediaPlayback = true
        let controller = WKUserContentController()
        // Weak proxy: the controller retains its handlers, so handing it the coordinator would leak the web view.
        controller.add(WeakScriptHandler(context.coordinator), name: "alphonso")
        for source in Self.documentStartScripts() {
            controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        // Transparent and matching, so there is no white flash before the page paints.
        let background = UIColor(AlphonsoColor.parchment)
        webView.isOpaque = false
        webView.backgroundColor = background
        webView.scrollView.backgroundColor = background
        webView.scrollView.bounces = false
        webView.navigationDelegate = context.coordinator
        #if DEBUG
        webView.isInspectable = true
        #endif
        context.coordinator.webView = webView
        context.coordinator.load(reloadToken)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.onEvent = onEvent
        if context.coordinator.loadedToken != reloadToken { context.coordinator.load(reloadToken) }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeAllUserScripts()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "alphonso")
    }

    /// The app's own colours (read from the active theme) and the bundled voice line, handed to the page.
    private static func documentStartScripts() -> [String] {
        let tokens: [(String, Color)] = [
            ("bg", AlphonsoColor.parchment), ("stage-hi", AlphonsoColor.surface), ("stage-lo", AlphonsoColor.parchment),
            ("panel", AlphonsoColor.surface), ("ink", AlphonsoColor.ink), ("muted", AlphonsoColor.inkSoft),
            ("line", AlphonsoColor.hairline), ("accent", AlphonsoColor.moss), ("accent-ink", AlphonsoColor.onPrimary),
            ("chip", AlphonsoColor.parchment),
        ]
        let theme = tokens.map { "\"\($0.0)\":\"\(cssColor($0.1))\"" }.joined(separator: ",")
        var scripts = ["window.__theme = {\(theme)};"]
        if let url = Bundle.main.url(forResource: "voice", withExtension: "mp3", subdirectory: "Preview3D"),
           let data = try? Data(contentsOf: url) {
            scripts.append("window.__voiceB64 = \"\(data.base64EncodedString())\";")
        }
        return scripts
    }

    private static func cssColor(_ color: Color) -> String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a)
        return "rgba(\(Int((r * 255).rounded())),\(Int((g * 255).rounded())),\(Int((b * 255).rounded())),\(a))"
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var onEvent: (Alphonso3DPreviewEvent) -> Void
        weak var webView: WKWebView?
        var loadedToken: Int?

        init(onEvent: @escaping (Alphonso3DPreviewEvent) -> Void) { self.onEvent = onEvent }

        func load(_ token: Int) {
            loadedToken = token
            guard let webView,
                  let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "Preview3D")
            else {
                DispatchQueue.main.async { self.onEvent(.failed) }
                return
            }
            // Read access to the bundled folder only; the model and three.js come over https.
            webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
            switch type {
            case "ready": onEvent(.ready)
            case "progress": if let percent = body["percent"] as? Int { onEvent(.progress(percent)) }
            case "error": onEvent(.failed)
            default: break
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { onEvent(.failed) }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            onEvent(.failed)
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { onEvent(.failed) }
    }
}

private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
