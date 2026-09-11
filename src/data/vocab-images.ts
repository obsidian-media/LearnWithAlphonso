// Vocab-term -> stock-photo lookup, sourced from the Pexels API (free tier,
// no watermark, commercial use permitted). Keyed by lowercased term so
// deriveVocab() in vocab.ts can attach an image to any matching vocab item
// without touching the underlying lesson-bank/curriculum data.
export type VocabImage = { url: string; alt: string; credit: string };

export const VOCAB_IMAGES: Record<string, VocabImage> = {
  children: {
    url: "https://images.pexels.com/photos/590472/pexels-photo-590472.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A joyful brother and sister smiling outdoors in a sunlit garden. Perfect stock photo for family and lifestyle themes.",
    credit: "Janko Ferlic",
  },
  man: {
    url: "https://images.pexels.com/photos/16912191/pexels-photo-16912191.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An elderly man carrying a bag walks in a city street, showcasing urban life.",
    credit: "Yakup  Polat",
  },
  woman: {
    url: "https://images.pexels.com/photos/28589238/pexels-photo-28589238.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An elderly woman smiles warmly while standing on a busy street, capturing a moment of joy.",
    credit: "Nishant Aneja",
  },
  feet: {
    url: "https://images.pexels.com/photos/11101355/pexels-photo-11101355.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A creative shot of bare feet on a sandy beach in black and white.",
    credit: "Asep Saeful Bahri",
  },
  teeth: {
    url: "https://images.pexels.com/photos/11956948/pexels-photo-11956948.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a smiling woman with vibrant red lips and perfect teeth.",
    credit: "Amir SeilSepour",
  },
  mice: {
    url: "https://images.pexels.com/photos/345736/pexels-photo-345736.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A cute wood mouse in a lush green natural setting.",
    credit: "Victoria  Thorley",
  },
  knives: {
    url: "https://images.pexels.com/photos/35698501/pexels-photo-35698501.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of two sleek stainless steel knives with colorful accents.",
    credit: "Yevhen Khokhlov",
  },
  leaves: {
    url: "https://images.pexels.com/photos/4122764/pexels-photo-4122764.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant green leaves illuminated by sunlight, showcasing patterns and textures.",
    credit: "Ellie Burgin",
  },
  cities: {
    url: "https://images.pexels.com/photos/26178948/pexels-photo-26178948.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Beautiful night view of Tokyo skyline with illuminated skyscrapers reflecting on water.",
    credit: "Tosan  Shrestha",
  },
  babies: {
    url: "https://images.pexels.com/photos/38008350/pexels-photo-38008350.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Charming black and white portrait of a baby lying on a soft surface, capturing innocence.",
    credit: "Benoit Vacherie",
  },
  boxes: {
    url: "https://images.pexels.com/photos/19608064/pexels-photo-19608064.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of green Christmas gift boxes with holiday tags, perfect for seasonal celebrations.",
    credit: "Sachu Zayn",
  },
  watches: {
    url: "https://images.pexels.com/photos/38797596/pexels-photo-38797596.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish watch collection displayed in a modern workspace setting with accessories.",
    credit: "Huy Phan",
  },
  buses: {
    url: "https://images.pexels.com/photos/18435558/pexels-photo-18435558.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Monochrome image of a bus navigating city streets with passengers inside.",
    credit: "aboodi vesakaran",
  },
  dishes: {
    url: "https://images.pexels.com/photos/9440473/pexels-photo-9440473.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful ceramic plates and bowls arranged on a marble background, showcasing a bright and artistic table setting.",
    credit: "DRAKE NICOLLS",
  },
  potatoes: {
    url: "https://images.pexels.com/photos/38742086/pexels-photo-38742086.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up view of fingerling and red potatoes in baskets at a farmer's market.",
    credit: "Jonathan David",
  },
  photos: {
    url: "https://images.pexels.com/photos/15636411/pexels-photo-15636411.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Artistic scrapbook with photos, tulips, and decorative elements.",
    credit: "Kristyna Vyvolej.to",
  },
  sheep: {
    url: "https://images.pexels.com/photos/14106145/pexels-photo-14106145.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A tranquil scene of sheep grazing in Krummhörn countryside on a clear day.",
    credit: "Petra Ravensberg",
  },
  fish: {
    url: "https://images.pexels.com/photos/14867605/pexels-photo-14867605.png?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful koi fish underwater in a serene pond, showcasing their vibrant patterns.",
    credit: "Michelle Carrie",
  },
  apple: {
    url: "https://images.pexels.com/photos/11663121/pexels-photo-11663121.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist photo of a whole and halved green apple on a pastel blue background, ideal for food and health themes.",
    credit: "Sabur Ahmed Jishan",
  },
  banana: {
    url: "https://images.pexels.com/photos/16829201/pexels-photo-16829201.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright yellow bananas arranged on a purple surface in a playful flat lay pattern.",
    credit: "Carlie Wright",
  },
  coffee: {
    url: "https://images.pexels.com/photos/28496565/pexels-photo-28496565.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Cappuccino with intricate latte art served on a dark marble table. Perfect for cafe lovers.",
    credit: "Jovan Popović",
  },
  umbrella: {
    url: "https://images.pexels.com/photos/18430837/pexels-photo-18430837.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Rainy city scene with pedestrians and cars. Umbrellas in the foreground, skyscrapers in the background.",
    credit: "Traveler stories photos  旅人故事相片集",
  },
  train: {
    url: "https://images.pexels.com/photos/5059248/pexels-photo-5059248.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Overhead shot of two trains at a Moscow metro station, showcasing urban transportation.",
    credit: "Max Avans",
  },
  bicycle: {
    url: "https://images.pexels.com/photos/20728294/pexels-photo-20728294.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful vintage bicycle with a basket by a serene pond in a sunny park setting.",
    credit: "mitbg000",
  },
  airport: {
    url: "https://images.pexels.com/photos/3140204/pexels-photo-3140204.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Airplanes parked at a busy airport terminal during sunset, showcasing aviation and travel.",
    credit: "Brett Sayles",
  },
  suitcase: {
    url: "https://images.pexels.com/photos/29936876/pexels-photo-29936876.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A collection of vintage suitcases stacked high, showcasing diverse textures and colors.",
    credit: "Ahmet  Kayra",
  },
};
