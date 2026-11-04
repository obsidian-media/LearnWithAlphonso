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
    /// The course the word is saved under ("en", "fr" or "es"): the course of the
    /// conversation or lesson the text came from.
    let course: String
    let onSave: (SaveWordRequest) -> Void
    /// French and Spanish lesson explanations mix English with quoted course text: when set, only words
    /// inside these course-language strings are linked, and the saved sentence is that string
    /// (`CourseLanguageSpans`). nil (the default) links every word, for text wholly in the course's language.
    var courseSpans: [String]? = nil

    /// The text cut into pieces; with no `courseSpans` it is one piece in which every word is linkable.
    private var pieces: [CourseLanguageSpans.Piece] {
        guard let courseSpans else { return [.init(text: text, isCourseLanguage: true)] }
        return CourseLanguageSpans.split(text, spans: courseSpans)
    }

    private var attributed: AttributedString {
        var result = AttributedString()
        var offset = 0
        for part in pieces {
            var partOffset = 0
            for segment in WordSegmenter.segments(in: part.text) {
                var piece = AttributedString(segment.text)
                if part.isCourseLanguage, segment.isWord, WordSegmenter.isSavable(segment.text),
                    let url = WordLink.url(for: segment.text, offset: offset + partOffset)
                {
                    piece.link = url
                }
                result.append(piece)
                partOffset += segment.text.count
            }
            offset += part.text.count
        }
        return result
    }

    /// The sentence to save for a tap at `offset`: the course-language piece it fell in when spans are used.
    private func sentence(for word: String, atOffset offset: Int?) -> String {
        guard courseSpans != nil else {
            return offset.map { WordSegmenter.sentence(containing: word, in: text, atOffset: $0) }
                ?? WordSegmenter.sentence(containing: word, in: text)
        }
        var start = 0
        for part in pieces {
            let end = start + part.text.count
            if part.isCourseLanguage, let offset, offset >= start, offset < end {
                return WordSegmenter.sentence(containing: word, in: part.text, atOffset: offset - start)
            }
            start = end
        }
        return word
    }

    var body: some View {
        Text(attributed)
            .foregroundStyle(color)
            .tint(color)
            .environment(\.openURL, OpenURLAction { url in
                guard let word = WordLink.word(from: url) else { return .systemAction }
                let sentence = sentence(for: word, atOffset: WordLink.offset(from: url))
                onSave(SaveWordRequest(word: word, sentence: sentence, course: course))
                return .handled
            })
    }
}
