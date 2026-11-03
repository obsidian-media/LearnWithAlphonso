import SwiftUI

/// A whole number that counts up as its `number` is animated (0 to its value), keeping any text around it
/// ("+25", "80%"). Animatable, so SwiftUI re-renders it every frame of the surrounding `withAnimation`.
struct CountingText: View, Animatable {
    var number: Double
    var prefix: String = ""
    var suffix: String = ""

    var animatableData: Double {
        get { number }
        set { number = newValue }
    }

    var body: some View {
        Text("\(prefix)\(Int(number.rounded()))\(suffix)")
    }
}

/// Splits a reward value such as "+25" or "7" into the text before the number, the number and the text after it.
enum RewardCountUp {
    /// How long the numbers take to count up from 0.
    static let duration: Double = 0.8

    static func split(_ value: String) -> (prefix: String, number: Int, suffix: String)? {
        guard let start = value.firstIndex(where: \.isNumber) else { return nil }
        let rest = value[start...]
        let digits = rest.prefix(while: \.isNumber)
        guard let number = Int(digits) else { return nil }
        return (String(value[..<start]), number, String(rest.dropFirst(digits.count)))
    }
}
