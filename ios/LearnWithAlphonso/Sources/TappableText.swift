import SwiftUI
import LearnWithAlphonsoKit

/// Text whose words can be tapped. Built as ONE `Text` from an
/// `AttributedString` in which every word run carries a custom-scheme link
/// (`WordLink`), and an `OpenURLAction` turns a tap into `onWordTap(word)`.
/// That keeps normal text layout, wrapping and Dynamic Type, which a flow
/// layout of per-word buttons would not.
///
/// Links are tinted, so the caller's text colour is also applied as the tint
/// to keep the text looking like ordinary text; a hint line on the screen
/// tells the learner words are tappable.
struct TappableText: View {
    let text: String
    let color: Color
    let onWordTap: (String) -> Void

    private var attributed: AttributedString {
        var result = AttributedString()
        for segment in WordSegmenter.segments(in: text) {
            var piece = AttributedString(segment.text)
            if segment.isWord, let url = WordLink.url(for: segment.text) {
                piece.link = url
            }
            result.append(piece)
        }
        return result
    }

    var body: some View {
        Text(attributed)
            .foregroundStyle(color)
            .tint(color)
            .environment(\.openURL, OpenURLAction { url in
                guard let word = WordLink.word(from: url) else { return .systemAction }
                onWordTap(word)
                return .handled
            })
    }
}
