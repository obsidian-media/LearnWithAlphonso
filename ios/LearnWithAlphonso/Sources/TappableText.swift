import SwiftUI
import LearnWithAlphonsoKit

/// Text whose words can be tapped. Built as ONE `Text` from an
/// `AttributedString` in which every word run carries a custom-scheme link
/// (`WordLink`, which also carries the word's offset in `text`), and an
/// `OpenURLAction` turns a tap into a ready-made `SaveWordRequest`. That keeps
/// normal text layout, wrapping and Dynamic Type, which a flow layout of
/// per-word buttons would not.
///
/// Only words the server will accept are linked (`WordSegmenter.isSavable`), and
/// the saved sentence is the one the word was TAPPED in, so a word that occurs
/// twice does not save the wrong context. Every screen that shows an AI reply
/// uses this one view, so that logic lives here and nowhere else.
///
/// Links are tinted, so the caller's text colour is also applied as the tint
/// to keep the text looking like ordinary text; a hint line on the screen
/// tells the learner words are tappable.
struct TappableText: View {
    let text: String
    let color: Color
    /// The course the word is saved under ("en" today: Hector, Practice and
    /// Campaign are English-only).
    let course: String
    let onSave: (SaveWordRequest) -> Void

    private var attributed: AttributedString {
        var result = AttributedString()
        var offset = 0
        for segment in WordSegmenter.segments(in: text) {
            var piece = AttributedString(segment.text)
            if segment.isWord, WordSegmenter.isSavable(segment.text),
                let url = WordLink.url(for: segment.text, offset: offset)
            {
                piece.link = url
            }
            result.append(piece)
            offset += segment.text.count
        }
        return result
    }

    var body: some View {
        Text(attributed)
            .foregroundStyle(color)
            .tint(color)
            .environment(\.openURL, OpenURLAction { url in
                guard let word = WordLink.word(from: url) else { return .systemAction }
                let sentence =
                    WordLink.offset(from: url).map {
                        WordSegmenter.sentence(containing: word, in: text, atOffset: $0)
                    } ?? WordSegmenter.sentence(containing: word, in: text)
                onSave(SaveWordRequest(word: word, sentence: sentence, course: course))
                return .handled
            })
    }
}
