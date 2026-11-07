import SwiftUI
import UIKit
import LearnWithAlphonsoKit

/// Words to learn before a lesson's questions (visual round 6): one big card at a time in the lesson's design system,
/// or one scrolling list at the largest text sizes. Moved out of LessonPlayerView so it can be design-system only.
struct VocabScreen: View {
    let lesson: Lesson
    let items: [VocabItem]
    let onSpeak: (String) -> Void
    let onStart: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.alphonsoDS) private var ds
    @State private var page = 0

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            // At the largest text sizes a fixed card would clip its words, so the screen stays one scrolling list.
            ScrollView { listContent }
        } else {
            deck
        }
    }

    /// Words to learn, one big card at a time: the picture, the word, its sound, the meaning and an example, with
    /// Alphonso peeking over the corner. "Next word" moves on and the last card starts practice; Skip goes straight
    /// to it. Swiping also moves between cards.
    private var deck: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Vocabulary · \(lesson.subtitle)".uppercased())
                    .dsText(.overline)
                    .foregroundStyle(ds.actionText)
                Text(lesson.title)
                    .dsText(.display)
                    .foregroundStyle(ds.brand)
                    .accessibilityAddTraits(.isHeader)
                // Skip shares the counter's row (build 55): beside the title it crowded long titles.
                HStack {
                    Text("Word \(page + 1) of \(items.count)")
                        .dsText(.footnote)
                        .foregroundStyle(ds.inkSoft)
                        .monospacedDigit()
                    Spacer(minLength: 0)
                    if items.count > 1 {
                        Button("Skip to practice", action: onStart)
                            .dsText(.footnote)
                            .foregroundStyle(ds.choice)
                            .frame(minHeight: AlphonsoDS.Space.minTouch)
                    }
                }
            }

            TabView(selection: $page) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    wordCard(item, index: index)
                        .padding(.horizontal, 2)
                        .padding(.top, 14)
                        // Room for the card's shadow: the page view clips at its edge.
                        .padding(.bottom, AlphonsoDS.Space.s8)
                        // The card keeps its own height, at the top of the page.
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .tag(index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: page)

            HStack(spacing: 6) {
                ForEach(items.indices, id: \.self) { index in
                    Capsule()
                        .fill(index == page ? ds.xp : ds.line)
                        .frame(width: index == page ? 20 : 8, height: 8)
                }
            }
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)

            Button(VocabDeck.buttonTitle(index: page, count: items.count)) {
                if page < items.count - 1 {
                    page += 1
                } else {
                    onStart()
                }
            }
            .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
        }
        .padding(AlphonsoDS.Space.s4)
        .background(ds.surface)
    }

    /// The card's picture: 180 pt, smaller on a short screen (an iPhone SE) so the words below it still fit.
    private static var cardImageHeight: CGFloat { min(180, UIScreen.main.bounds.height * 0.2) }

    private func speakButton(_ item: VocabItem, foreground: Color? = nil) -> some View {
        Button {
            onSpeak(item.term)
        } label: {
            Image(systemName: "speaker.wave.2.fill")
                .font(.body)
                .frame(width: AlphonsoDS.Space.minTouch, height: AlphonsoDS.Space.minTouch)
                .background(ds.card, in: Circle())
                .overlay(Circle().strokeBorder(ds.line, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .foregroundStyle(foreground ?? ds.choice)
        .accessibilityLabel("Play pronunciation for \(item.term)")
    }

    /// A word with no photo (grammar words never have one) gets a coloured band with the word itself, large, in
    /// place of the picture: a different tile tone per card so the deck still feels illustrated.
    private func wordBand(_ item: VocabItem, index: Int) -> some View {
        VStack(spacing: AlphonsoDS.Space.s4) {
            Text(item.term)
                .dsText(.displayXL)
                .foregroundStyle(ds.brand)
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.5)
                .lineLimit(2)
            speakButton(item)
        }
        .padding(.horizontal, AlphonsoDS.Space.s12)
        .padding(.vertical, AlphonsoDS.Space.s8)
        .frame(maxWidth: .infinity)
        .background(ds.choiceTint, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.bubble, style: .continuous))
    }

    private func cardWords(_ item: VocabItem, index: Int) -> some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s2) {
            if let image = item.image {
                VocabImageView(image: image, cardHeight: Self.cardImageHeight)
                HStack(spacing: AlphonsoDS.Space.s2) {
                    Text(item.term)
                        .dsText(.display)
                        .foregroundStyle(ds.brand)
                        .minimumScaleFactor(0.6)
                        .lineLimit(2)
                    speakButton(item)
                }
                .padding(.trailing, 56)
            } else {
                wordBand(item, index: index)
            }
            // Either line can be empty when the lesson data has no real meaning or example for the word.
            if !item.meaning.isEmpty {
                Text(item.meaning)
                    .dsText(.body)
                    .foregroundStyle(ds.inkSoft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if !item.example.isEmpty {
                Text(item.example)
                    .italic() // on the Text, so the role's font keeps it
                    .dsText(.body)
                    .foregroundStyle(ds.brand)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, AlphonsoDS.Space.s4)
                    .padding(.vertical, AlphonsoDS.Space.s3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ds.sunk, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
            }
        }
        .padding(AlphonsoDS.Space.s3)
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// One card, as tall as its words (no stretched empty box). It scrolls inside only when the words do not fit
    /// (a long example on an iPhone SE).
    private func wordCard(_ item: VocabItem, index: Int) -> some View {
        ViewThatFits(in: .vertical) {
            cardWords(item, index: index)
            ScrollView { cardWords(item, index: index) }
                .scrollBounceBehavior(.basedOnSize)
        }
        .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.sheet, style: .continuous))
        .dsElevation(AlphonsoDS.Elevation.floating, line: ds.line)
        .overlay(alignment: .topTrailing) {
            // Decorative: Alphonso peeks over the card's corner, in a round frame, as on the web.
            if let face = LessonArt.expression(.talk) {
                Image(uiImage: face)
                    .resizable()
                    .scaledToFill()
                    .frame(width: 64, height: 64, alignment: .top)
                    .background(ds.card)
                    .clipShape(Circle())
                    .overlay(Circle().strokeBorder(ds.card, lineWidth: 3))
                    .offset(x: AlphonsoDS.Space.s1, y: -AlphonsoDS.Space.s3)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// The scrolling list, kept for the largest text sizes.
    private var listContent: some View {
        VStack(alignment: .leading, spacing: AlphonsoDS.Space.s4) {
            Text("Vocabulary · \(lesson.subtitle)".uppercased())
                .dsText(.overline)
                .foregroundStyle(ds.actionText)
            Text(lesson.title)
                .dsText(.display)
                .foregroundStyle(ds.brand)
                .accessibilityAddTraits(.isHeader)
            Text("\(items.count) word\(items.count == 1 ? "" : "s") to learn before you practise.")
                .dsText(.footnote)
                .foregroundStyle(ds.inkSoft)
            wordList
            startButton
        }
        .padding(AlphonsoDS.Space.s4)
        .background(ds.surface)
    }

    private var startButton: some View {
        Button("Start practice", action: onStart)
            .buttonStyle(LessonEdgeButtonStyle(variant: .primary))
    }

    private var wordList: some View {
            VStack(alignment: .leading, spacing: AlphonsoDS.Space.s3) {
                ForEach(items, id: \.term) { item in
                    VStack(alignment: .leading, spacing: AlphonsoDS.Space.s1) {
                        if let image = item.image {
                            VocabImageView(image: image)
                        }
                        HStack(spacing: AlphonsoDS.Space.s2) {
                            Text(item.term)
                                .dsText(.title)
                                .foregroundStyle(ds.brand)
                            Button {
                                onSpeak(item.term)
                            } label: {
                                Image(systemName: "speaker.wave.2.fill")
                                    .dsText(.footnote)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(ds.choice)
                            .accessibilityLabel("Play pronunciation for \(item.term)")
                        }
                        Text(item.meaning)
                            .dsText(.body)
                            .foregroundStyle(ds.inkSoft)
                        Text(item.example)
                            .italic() // on the Text, so the role's font keeps it
                            .dsText(.body)
                            .foregroundStyle(ds.brand)
                            .padding(.top, AlphonsoDS.Space.s1)
                    }
                    .padding(AlphonsoDS.Space.s4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ds.card, in: RoundedRectangle(cornerRadius: AlphonsoDS.Radius.control, style: .continuous))
                }
            }

    }
}
