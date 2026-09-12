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
  // Batch 2 — added alongside the "Family & People" and "Food & Drink" packs.
  mother: {
    url: "https://images.pexels.com/photos/38624440/pexels-photo-38624440.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Warm portrait of a mother and son sharing a happy embrace at home.",
    credit: "Krishna Kids  Photography",
  },
  father: {
    url: "https://images.pexels.com/photos/33292938/pexels-photo-33292938.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A father holds his child as they enjoy ice cream together.",
    credit: "Артем Зелюткин",
  },
  sister: {
    url: "https://images.pexels.com/photos/2469645/pexels-photo-2469645.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A captivating portrait of two young sisters with striking blue eyes in a studio setting.",
    credit: "Janko Ferlic",
  },
  brother: {
    url: "https://images.pexels.com/photos/590472/pexels-photo-590472.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A joyful brother and sister smiling outdoors in a sunlit garden.",
    credit: "Janko Ferlic",
  },
  daughter: {
    url: "https://images.pexels.com/photos/28589227/pexels-photo-28589227.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Mother and daughter enjoying quality time outdoors at a cafe.",
    credit: "Nishant Aneja",
  },
  grandmother: {
    url: "https://images.pexels.com/photos/18671527/pexels-photo-18671527.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A smiling elderly woman sitting indoors, exuding warmth and contentment.",
    credit: "Q. Hưng Phạm",
  },
  bacon: {
    url: "https://images.pexels.com/photos/9296995/pexels-photo-9296995.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A traditional English breakfast featuring eggs, sausage, bacon, and beans.",
    credit: "Jesus Cabrera",
  },
  tomato: {
    url: "https://images.pexels.com/photos/18254763/pexels-photo-18254763.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of vibrant ripe cherry tomatoes with fresh dew.",
    credit: "frank minjarez",
  },
  cake: {
    url: "https://images.pexels.com/photos/32191351/pexels-photo-32191351.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant pink frosted cake with candles on a decorative party table.",
    credit: "Nadiye Şamlı",
  },
  cheese: {
    url: "https://images.pexels.com/photos/24206934/pexels-photo-24206934.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A delectable brunch platter featuring assorted cheeses, fruits, and bagel.",
    credit: "Ali Dashti",
  },
  bread: {
    url: "https://images.pexels.com/photos/31744871/pexels-photo-31744871.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Top view of fresh, rustic brown bread slices on a white plate.",
    credit: "Gaurav  Sinha",
  },
  architect: {
    url: "https://images.pexels.com/photos/6615107/pexels-photo-6615107.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A diverse group of professionals discussing an architectural model in an office setting, emphasizing teamwork.",
    credit: "Tima Miroshnichenko",
  },
  attic: {
    url: "https://images.pexels.com/photos/1628417/pexels-photo-1628417.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A Christmas tree seen through an attic entrance with a ladder leading up.",
    credit: "Jeswin  Thomas",
  },
  badminton: {
    url: "https://images.pexels.com/photos/6878017/pexels-photo-6878017.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a hand holding a shuttlecock and badminton racket, ready to serve.",
    credit: "Saif71.com",
  },
  bag: {
    url: "https://images.pexels.com/photos/8335273/pexels-photo-8335273.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A stylish assortment of pastel handbags elegantly displayed against a minimalist backdrop in a studio setting.",
    credit: "aaron tannando",
  },
  basement: {
    url: "https://images.pexels.com/photos/35539075/pexels-photo-35539075.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright and clean modern basement with carpet flooring and recessed lighting.",
    credit: "Peter  Vang",
  },
  basketball: {
    url: "https://images.pexels.com/photos/13179883/pexels-photo-13179883.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of basketballs lined up for an arcade basketball hoop game.",
    credit: "Engin Akyurt",
  },
  bat: {
    url: "https://images.pexels.com/photos/10740581/pexels-photo-10740581.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A striking monochrome image of bats flying against a grayscale sky in Bali, Indonesia.",
    credit: "Vladimir Konoplev",
  },
  bathroom: {
    url: "https://images.pexels.com/photos/10258628/pexels-photo-10258628.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright and minimalist bathroom with a modern vanity and colorful shower curtain.",
    credit: "Get Lost Mike",
  },
  bedroom: {
    url: "https://images.pexels.com/photos/6903157/pexels-photo-6903157.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Interior design of modern bedroom with unmade bed under luminous lamps at sunlight",
    credit: "Max Vakhtbovych",
  },
  bee: {
    url: "https://images.pexels.com/photos/14287333/pexels-photo-14287333.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Macro shot of a bee collecting pollen from a vibrant orange flower, showcasing the beauty of nature.",
    credit: "Mason McCall",
  },
  bill: {
    url: "https://images.pexels.com/photos/7680361/pexels-photo-7680361.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a five-dollar bill next to shopping receipts on a white background, ideal for finance and retail themes.",
    credit: "https://kaboompics.com/",
  },
  bird: {
    url: "https://images.pexels.com/photos/30174893/pexels-photo-30174893.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant kingfisher perched on a branch next to colorful leaves, showcasing nature's beauty.",
    credit: "Quang Nguyen Vinh",
  },
  black: {
    url: "https://images.pexels.com/photos/1493080/pexels-photo-1493080.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of steaming Turkish tea in a traditional glass, creating a cozy and inviting atmosphere.",
    credit: "Hasan Albari",
  },
  blouse: {
    url: "https://images.pexels.com/photos/5549383/pexels-photo-5549383.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish portrait of a woman in a black blouse posing elegantly in a studio setting.",
    credit: "Lê Minh",
  },
  boots: {
    url: "https://images.pexels.com/photos/4729488/pexels-photo-4729488.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An artistic shot of a woman sitting on a vintage patterned tiled floor, showcasing fashion and style.",
    credit: "cottonbro studio",
  },
  boxing: {
    url: "https://images.pexels.com/photos/31403621/pexels-photo-31403621.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two boxers engaged in a thrilling match wearing protective headgear and gloves.",
    credit: "César O'neill",
  },
  brown: {
    url: "https://images.pexels.com/photos/30644008/pexels-photo-30644008.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a crusty artisan loaf with a rustic texture placed on a checkered cloth.",
    credit: "Sabine Freiberger",
  },
  builder: {
    url: "https://images.pexels.com/photos/17410515/pexels-photo-17410515.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two construction workers framing a wooden structure outdoors at a building site.",
    credit: "David Brown",
  },
  butter: {
    url: "https://images.pexels.com/photos/7965940/pexels-photo-7965940.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Focused shot of cutting butter for meal preparation, essential cooking ingredient.",
    credit: "Felicity Tai",
  },
  camel: {
    url: "https://images.pexels.com/photos/19285083/pexels-photo-19285083.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant scene of a cameleer with a decorated camel at the Pushkar Fair in India.",
    credit: "Harikrishan Jakhar",
  },
  cat: {
    url: "https://images.pexels.com/photos/33585484/pexels-photo-33585484.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene gray tabby cat lounging by a sunny window indoors, capturing a moment of calm.",
    credit: "大 董",
  },
  ceiling: {
    url: "https://images.pexels.com/photos/31748456/pexels-photo-31748456.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Explore the intricate patterns and design of a mosque ceiling dome captured in a stunning architectural photograph.",
    credit: "Cafer SEVİNÇ",
  },
  check: {
    url: "https://images.pexels.com/photos/5242826/pexels-photo-5242826.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women express surprise while reviewing a restaurant bill in a casual setting.",
    credit: "Anna Tarazevich",
  },
  chef: {
    url: "https://images.pexels.com/photos/36242484/pexels-photo-36242484.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white image of chefs preparing meals in an industrial restaurant kitchen.",
    credit: "DΛVΞ GΛRCIΛ",
  },
  chess: {
    url: "https://images.pexels.com/photos/4800923/pexels-photo-4800923.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Strategic close-up of chess pieces on a board, highlighting the queen in black and white.",
    credit: "Theia Sight",
  },
  cleaner: {
    url: "https://images.pexels.com/photos/6195274/pexels-photo-6195274.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women in work clothes cleaning a modern living room using a vacuum and mop.",
    credit: "Tima Miroshnichenko",
  },
  climbing: {
    url: "https://images.pexels.com/photos/17270017/pexels-photo-17270017.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man skillfully climbs a rock under a dramatic sky in a mountainous landscape.",
    credit: "Dylan Flying",
  },
  coat: {
    url: "https://images.pexels.com/photos/7653719/pexels-photo-7653719.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of two men wearing fashionable coats outdoors on an autumn day.",
    credit: "cottonbro studio",
  },
  cow: {
    url: "https://images.pexels.com/photos/31794126/pexels-photo-31794126.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Cows grazing in a lush green field in the English countryside on a sunny day.",
    credit: "Kristian  Thomas",
  },
  cricket: {
    url: "https://images.pexels.com/photos/28758998/pexels-photo-28758998.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A cricket player batting outdoors on a sunny day, showcasing athletic skill.",
    credit: "Engineer John",
  },
  cupboard: {
    url: "https://images.pexels.com/photos/34578073/pexels-photo-34578073.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person reaches into a kitchen cabinet to grab a mug, surrounded by neatly stacked dishes.",
    credit: "Letícia Alvares",
  },
  cycling: {
    url: "https://images.pexels.com/photos/26726124/pexels-photo-26726124.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white image of cyclists chatting outdoors, showcasing camaraderie and leisure.",
    credit: "Gato Joseph",
  },
  dentist: {
    url: "https://images.pexels.com/photos/8413334/pexels-photo-8413334.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Female dentist working on a patient in a modern dental office with bright lighting.",
    credit: "SHVETS production",
  },
  doctor: {
    url: "https://images.pexels.com/photos/19963167/pexels-photo-19963167.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Confident female doctor in white coat smiling and holding a stethoscope against a black background.",
    credit: "Tessy Agbonome",
  },
  dog: {
    url: "https://images.pexels.com/photos/144608/pexels-photo-144608.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up black and white portrait of a playful furry dog showing its teeth, capturing emotion and texture.",
    credit: "Suvan Chowdhury",
  },
  door: {
    url: "https://images.pexels.com/photos/17295937/pexels-photo-17295937.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Charming door with Maltese cross on a historic stone building in Valletta, Malta.",
    credit: "Efrem  Efre",
  },
  dress: {
    url: "https://images.pexels.com/photos/5582669/pexels-photo-5582669.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish models in elegant dresses posing with hay bales under a bright sky.",
    credit: "cottonbro studio",
  },
  dressing: {
    url: "https://images.pexels.com/photos/10060235/pexels-photo-10060235.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A woman pours olive oil and vinegar on a plate over a red checkered tablecloth.",
    credit: "Ron Lach",
  },
  driveway: {
    url: "https://images.pexels.com/photos/24524484/pexels-photo-24524484.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Lovely suburban houses with blue garage doors under cloudy sky, surrounded by greenery.",
    credit: "Thomas P",
  },
  duck: {
    url: "https://images.pexels.com/photos/38065888/pexels-photo-38065888.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene image of a female mallard duck peacefully floating on a calm river.",
    credit: "Liane Ferreira",
  },
  elephant: {
    url: "https://images.pexels.com/photos/27116276/pexels-photo-27116276.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A detailed black and white photo of an elephant standing in a rural Indian landscape.",
    credit: "Almuntadhar  Faris",
  },
  farmer: {
    url: "https://images.pexels.com/photos/9368704/pexels-photo-9368704.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A bearded farmer wearing a straw hat smiles while sitting in a tractor outdoors.",
    credit: "Fariborz MP",
  },
  firefighter: {
    url: "https://images.pexels.com/photos/19487945/pexels-photo-19487945.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Firefighter in protective gear holding a hose near a firetruck in a garage setting.",
    credit: "Mirada Robot",
  },
  fishing: {
    url: "https://images.pexels.com/photos/6478086/pexels-photo-6478086.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright and detailed fishing lures on a clean white surface.",
    credit: "https://kaboompics.com/",
  },
  flat: {
    url: "https://images.pexels.com/photos/38022580/pexels-photo-38022580.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Exterior view of a contemporary apartment building in İzmir, Türkiye, showcasing architectural details.",
    credit: "Doğan Alpaslan  Demir",
  },
  fox: {
    url: "https://images.pexels.com/photos/8650973/pexels-photo-8650973.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A peaceful red fox relaxes in a grassy field on a sunny day, a perfect capture of wildlife in nature.",
    credit: "Brett Jordan",
  },
  garage: {
    url: "https://images.pexels.com/photos/5487403/pexels-photo-5487403.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Row of three traditional residential garages with unique roof design on a sunny day.",
    credit: "Braeson Holland",
  },
  garden: {
    url: "https://images.pexels.com/photos/32759035/pexels-photo-32759035.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Tranquil park scene featuring lush greenery, a flower garden, and an empty bench.",
    credit: "Alex Ohan",
  },
  gardening: {
    url: "https://images.pexels.com/photos/36812098/pexels-photo-36812098.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Smiling young couple tending plants inside a vibrant greenhouse filled with flowers.",
    credit: "Vitaly Gariev",
  },
  giraffe: {
    url: "https://images.pexels.com/photos/14557610/pexels-photo-14557610.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A herd of giraffes in a green, tree-filled zoo area, showcasing their natural habitat.",
    credit: "Mehmet Turgut  Kirkgoz",
  },
  golf: {
    url: "https://images.pexels.com/photos/54123/pexels-photo-54123.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a golf ball near a hole on a vibrant golf green, capturing the moment of near success.",
    credit: "tyler hendy",
  },
  hairdresser: {
    url: "https://images.pexels.com/photos/10318038/pexels-photo-10318038.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Hairdresser styling client's hair in a chic salon with a focus on detailed hair work.",
    credit: "Ron Lach",
  },
  hallway: {
    url: "https://images.pexels.com/photos/5585184/pexels-photo-5585184.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white empty narrow hall between white walls leading to living room of contemporary house",
    credit: "Brett Sayles",
  },
  hat: {
    url: "https://images.pexels.com/photos/185765/pexels-photo-185765.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Back view of a man browsing hats at a street market stall on a sunny day.",
    credit: "Clem Onojeghuo",
  },
  hen: {
    url: "https://images.pexels.com/photos/29051473/pexels-photo-29051473.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Intimate view of a hen in Thailand under bright daylight.",
    credit: "Pongpoonat Rungrueng",
  },
  hook: {
    url: "https://images.pexels.com/photos/8442646/pexels-photo-8442646.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "White lab coats hanging on a metal wall hook in a sterile laboratory environment.",
    credit: "Pavel Danilyuk",
  },
  house: {
    url: "https://images.pexels.com/photos/6342356/pexels-photo-6342356.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Contemporary house nestled in a sunlit rocky outdoor setting, perfect for architecture lovers.",
    credit: "ROMAN ODINTSOV",
  },
  jacket: {
    url: "https://images.pexels.com/photos/10699145/pexels-photo-10699145.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man with a backpack hikes through a rainy forest wearing a hoodie and jacket.",
    credit: "Vlad",
  },
  jam: {
    url: "https://images.pexels.com/photos/34082316/pexels-photo-34082316.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful jars of homemade preserves and jams on a traditional patterned cloth.",
    credit: "Tahir Xəlfəquliyev",
  },
  jeans: {
    url: "https://images.pexels.com/photos/10133275/pexels-photo-10133275.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of neatly stacked folded denim fabrics in varying blue tones showcasing texture and pattern.",
    credit: "Viktorya  Sergeeva 🫂",
  },
  journalist: {
    url: "https://images.pexels.com/photos/32957317/pexels-photo-32957317.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Photographers focusing on event coverage with advanced cameras indoors, showcasing media professionals in action.",
    credit: "Tahir Xəlfəquliyev",
  },
  kangaroo: {
    url: "https://images.pexels.com/photos/27110778/pexels-photo-27110778.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two kangaroos standing in a lush green park in Perth, WA, highlighting Australian wildlife.",
    credit: "Line Knipst",
  },
  kitchen: {
    url: "https://images.pexels.com/photos/8186477/pexels-photo-8186477.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A modern kitchen with granite countertops opens into a stylish living room, featuring elegant furniture and built-in shelves.",
    credit: "Curtis Adams",
  },
  knitting: {
    url: "https://images.pexels.com/photos/5691897/pexels-photo-5691897.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "From above of knitted piece with bright pink yarn ball and knitting needles on sofa",
    credit: "Alex Green",
  },
  lace: {
    url: "https://images.pexels.com/photos/6358787/pexels-photo-6358787.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of hands adjusting lace on a wedding dress in a fashion atelier.",
    credit: "Anna Tarazevich",
  },
  lawyer: {
    url: "https://images.pexels.com/photos/34817073/pexels-photo-34817073.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Female judge in courtroom setting, sitting at desk with justice scales in background.",
    credit: "khezez  | خزاز",
  },
  lemon: {
    url: "https://images.pexels.com/photos/35926707/pexels-photo-35926707.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright yellow lemons perfectly captured with a single green leaf, conveying freshness and vitality.",
    credit: "L. Lum",
  },
  light: {
    url: "https://images.pexels.com/photos/1612726/pexels-photo-1612726.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A dimly lit bedside lamp creating a warm and cozy atmosphere in a bedroom setting.",
    credit: "Juan Pablo Serrano",
  },
  lion: {
    url: "https://images.pexels.com/photos/32196368/pexels-photo-32196368.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene lion rests amid lush greenery, showcasing its regal mane and natural habitat.",
    credit: "Jay Brand",
  },
  manager: {
    url: "https://images.pexels.com/photos/7580648/pexels-photo-7580648.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Business meeting with diverse team in modern office space, discussing projects.",
    credit: "RDNE Stock project",
  },
  mat: {
    url: "https://images.pexels.com/photos/5840868/pexels-photo-5840868.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Welcome mat on a tiled porch with boots visible. Perfect for home decor or hospitality themes.",
    credit: "Andrew Neel",
  },
  mattress: {
    url: "https://images.pexels.com/photos/6489093/pexels-photo-6489093.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Modern bedroom with white mattress on bed placed against wooden cabinet and table with flowerpot at wall with roller blind on window",
    credit: "Max Vakhtbovych",
  },
  meat: {
    url: "https://images.pexels.com/photos/37128330/pexels-photo-37128330.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up of a fresh, rustic barbecue platter filled with various grilled meats, perfect for outdoor gatherings.",
    credit: "Kari Alfonso",
  },
  mechanic: {
    url: "https://images.pexels.com/photos/4489758/pexels-photo-4489758.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two auto mechanics engaged in vehicle repair work inside a dimly lit garage.",
    credit: "cottonbro studio",
  },
  menu: {
    url: "https://images.pexels.com/photos/6327154/pexels-photo-6327154.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Overhead view of two friends sitting at a marble table, holding menus and enjoying coffee.",
    credit: "Tima Miroshnichenko",
  },
  midwife: {
    url: "https://images.pexels.com/photos/5206934/pexels-photo-5206934.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a medical professional wearing scrub suit and panda-themed stethoscope",
    credit: "https://kaboompics.com/",
  },
  milk: {
    url: "https://images.pexels.com/photos/13599629/pexels-photo-13599629.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Artistic black and white photo of milk gracefully pouring into a glass on a wooden table.",
    credit: "Luke Landon",
  },
  monkey: {
    url: "https://images.pexels.com/photos/27558085/pexels-photo-27558085.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Spider monkey gracefully traverses wooden beams amidst lush greenery under a clear blue sky.",
    credit: "Bruna  Fossile",
  },
  music: {
    url: "https://images.pexels.com/photos/210764/pexels-photo-210764.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white piano keys with a sheet of classical music creating a harmonious composition.",
    credit: "Pixabay",
  },
  nurse: {
    url: "https://images.pexels.com/photos/6129242/pexels-photo-6129242.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Crop African American female doctor with professional equipment doing examination of ear of woman lying on bed in hospital ward",
    credit: "RDNE Stock project",
  },
  orange: {
    url: "https://images.pexels.com/photos/7960508/pexels-photo-7960508.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of vibrant sliced oranges on a white surface, highlighting freshness and juicy texture.",
    credit: "Tina Laksmi Widayati",
  },
  painter: {
    url: "https://images.pexels.com/photos/36697960/pexels-photo-36697960.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Female artist painting with focus in an art studio, holding a palette.",
    credit: "Vitaly Gariev",
  },
  painting: {
    url: "https://images.pexels.com/photos/8843995/pexels-photo-8843995.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two Asian artists in robes collaborating on a painting in an art studio using various brushes and paints.",
    credit: "ANTONI SHKRABA production",
  },
  panda: {
    url: "https://images.pexels.com/photos/36023962/pexels-photo-36023962.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A giant panda joyfully eating bamboo in a lush, green environment, showcasing its playful nature.",
    credit: "Snow Chang",
  },
  peanuts: {
    url: "https://images.pexels.com/photos/33501329/pexels-photo-33501329.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Abundance of raw peanuts in shells. Great for backgrounds or agricultural themes.",
    credit: "King Shooter",
  },
  photography: {
    url: "https://images.pexels.com/photos/35846950/pexels-photo-35846950.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white portrait of a confident photographer with her camera in a lush outdoor setting.",
    credit: "Hófel .",
  },
  pig: {
    url: "https://images.pexels.com/photos/27167732/pexels-photo-27167732.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Adorable piglets on a farm, playfully exploring the grassy pasture. Perfect rural countryside scene.",
    credit: "Wei86 Travel",
  },
  pilot: {
    url: "https://images.pexels.com/photos/4269510/pexels-photo-4269510.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Back view of anonymous male pilots in uniform and headset navigating modern airplane while taking off",
    credit: "K",
  },
  plumber: {
    url: "https://images.pexels.com/photos/7859953/pexels-photo-7859953.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hands adjusting a boiler system with precise instrumentation, showing maintenance work.",
    credit: "Heiko Ruth",
  },
  postman: {
    url: "https://images.pexels.com/photos/37496811/pexels-photo-37496811.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Yellow-covered postal tricycle parked on city street beside a building.",
    credit: "Janez Temlin",
  },
  pottery: {
    url: "https://images.pexels.com/photos/4898085/pexels-photo-4898085.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A child craftsman in Cairo carrying handmade pottery outdoors.",
    credit: "Ahmed Elbetar",
  },
  programmer: {
    url: "https://images.pexels.com/photos/34804001/pexels-photo-34804001.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Open laptop displaying code on desk in bright, modern office setting. Ideal for tech and remote work context.",
    credit: "Daniil Komov",
  },
  pyjamas: {
    url: "https://images.pexels.com/photos/8416232/pexels-photo-8416232.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Group of people in colorful pajamas holding pillows, ready for a pillow fight.",
    credit: "SHVETS production",
  },
  rabbit: {
    url: "https://images.pexels.com/photos/17949205/pexels-photo-17949205.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Three cute rabbits enjoying fresh grass in a farm setting, showcasing natural wildlife behavior.",
    credit: "Natalia Vol",
  },
  rare: {
    url: "https://images.pexels.com/photos/36829381/pexels-photo-36829381.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Sliced juicy beef steak seasoned with spices on a wooden cutting board, showcasing mouthwatering texture.",
    credit: "Mohamed  Olwy",
  },
  ribbon: {
    url: "https://images.pexels.com/photos/5725871/pexels-photo-5725871.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "White gift box with red ribbon and velvet bows on a marble surface. Perfect for festive occasions.",
    credit: "https://kaboompics.com/",
  },
  rowing: {
    url: "https://images.pexels.com/photos/3682409/pexels-photo-3682409.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A women's rowing team celebrates with high fives during a competition on a river under the daylight.",
    credit: "Patrick Case",
  },
  running: {
    url: "https://images.pexels.com/photos/19146676/pexels-photo-19146676.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of people jogging on an outdoor track in the evening, showcasing urban fitness culture.",
    credit: "kf zhou",
  },
  salt: {
    url: "https://images.pexels.com/photos/7717461/pexels-photo-7717461.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed image showing coarse white sea salt crystals with a textured surface.",
    credit: "Marina Leonova",
  },
  scarf: {
    url: "https://images.pexels.com/photos/19346997/pexels-photo-19346997.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a stylish orange knit scarf and brown outfit, perfect for fall fashion enthusiasts.",
    credit: "beyzahzah",
  },
  sewing: {
    url: "https://images.pexels.com/photos/4621891/pexels-photo-4621891.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up of hands threading a sewing machine in a workshop setting.",
    credit: "cottonbro studio",
  },
  shirt: {
    url: "https://images.pexels.com/photos/7432867/pexels-photo-7432867.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up portrait of a confident man with facial hair, wearing a striped shirt.",
    credit: "August de Richelieu",
  },
  shopkeeper: {
    url: "https://images.pexels.com/photos/36753973/pexels-photo-36753973.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An elderly man sitting inside a shop surrounded by various coiled ropes and textile materials.",
    credit: "Zeynep Sude  Emek",
  },
  shorts: {
    url: "https://images.pexels.com/photos/8182248/pexels-photo-8182248.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of worn denim shorts with tattoos peeking through, showcasing unique style.",
    credit: "RDNE Stock project",
  },
  skateboarding: {
    url: "https://images.pexels.com/photos/5037667/pexels-photo-5037667.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Teenagers skateboarding on a graffiti-covered ramp, showcasing urban culture.",
    credit: "cottonbro studio",
  },
  skiing: {
    url: "https://images.pexels.com/photos/35988767/pexels-photo-35988767.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A lively scene of people gathering around ski gear at a snowy ski resort.",
    credit: "Aleksandr  Poklad",
  },
  sleeves: {
    url: "https://images.pexels.com/photos/9648922/pexels-photo-9648922.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man wearing a white shirt rolling up his sleeves against a dark background.",
    credit: "محمد النائلي - Mohammed Alnaily",
  },
  slice: {
    url: "https://images.pexels.com/photos/35447711/pexels-photo-35447711.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Hands cutting ham and scallions on a cutting board for a fresh meal prep.",
    credit: "Qeis Ismail",
  },
  snail: {
    url: "https://images.pexels.com/photos/38011485/pexels-photo-38011485.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a garden snail on vibrant green leaves with red berries.",
    credit: "Ivan Petrov",
  },
  sock: {
    url: "https://images.pexels.com/photos/10563910/pexels-photo-10563910.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant array of striped socks displayed on mannequin legs, showcasing fashion variety.",
    credit: "Jan van der Wolf",
  },
  socks: {
    url: "https://images.pexels.com/photos/10563910/pexels-photo-10563910.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant array of striped socks displayed on mannequin legs, showcasing fashion variety.",
    credit: "Jan van der Wolf",
  },
  sofa: {
    url: "https://images.pexels.com/photos/6758245/pexels-photo-6758245.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Comfortable sofa with pillows placed at wall with painted leaves in modern spacious room with table on rug at home",
    credit: "Max Vakhtbovych",
  },
  spider: {
    url: "https://images.pexels.com/photos/5406977/pexels-photo-5406977.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up image of a spider sitting on its web against a blue background.",
    credit: "𝙼𝚄𝚉𝙰𝙵𝙵𝙴𝚁",
  },
  steak: {
    url: "https://images.pexels.com/photos/39452689/pexels-photo-39452689.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Delicious grilled steaks on a tray next to green vegetables on an outdoor barbecue.",
    credit: "Deane Bayas",
  },
  still: {
    url: "https://images.pexels.com/photos/13464445/pexels-photo-13464445.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A minimalist image showcasing three different-sized glasses filled with water.",
    credit: "James Servant",
  },
  sugar: {
    url: "https://images.pexels.com/photos/7033660/pexels-photo-7033660.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An assortment of colorful gummy candies spilling from a clear glass on a pink background.",
    credit: "Tima Miroshnichenko",
  },
  suit: {
    url: "https://images.pexels.com/photos/17611505/pexels-photo-17611505.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Fashionable man in suit looking down thoughtfully against a bright, cloudy sky.",
    credit: "Anthony Lian",
  },
  sunglasses: {
    url: "https://images.pexels.com/photos/5202048/pexels-photo-5202048.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of stylish sunglasses displayed on a rack in a retail store.",
    credit: "https://kaboompics.com/",
  },
  sweater: {
    url: "https://images.pexels.com/photos/5712460/pexels-photo-5712460.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Neutral-toned flatlay featuring a notebook, sweater, and pen; perfect for inspiration or cozy themes.",
    credit: "Arina Krasnikova",
  },
  swimming: {
    url: "https://images.pexels.com/photos/5269487/pexels-photo-5269487.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Top view of anonymous slim lady floating underwater in crystal clear blue water in swimming pool on resort",
    credit: "Armin  Rimoldi",
  },
  table: {
    url: "https://images.pexels.com/photos/6748972/pexels-photo-6748972.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Table with glass vase with various flowers and plants near chairs in light room with yellow wall",
    credit: "Chris  Tombrella",
  },
  teacher: {
    url: "https://images.pexels.com/photos/37795357/pexels-photo-37795357.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A teacher engages with a student in a university classroom setting, fostering learning.",
    credit: "Eduard Perez",
  },
  tennis: {
    url: "https://images.pexels.com/photos/8224638/pexels-photo-8224638.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A tennis court featuring a net and several tennis balls lying on the ground, well-lit by sunlight.",
    credit: "RDNE Stock project",
  },
  tie: {
    url: "https://images.pexels.com/photos/21928749/pexels-photo-21928749.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish men's accessories including ties, watch, shoes, belt, and handkerchief.",
    credit: "Kenneth Surillo",
  },
  tiger: {
    url: "https://images.pexels.com/photos/27834727/pexels-photo-27834727.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A beautiful moment captured between a mother tiger and her playful cub in the wilderness.",
    credit: "Leon Aschemann",
  },
  trainers: {
    url: "https://images.pexels.com/photos/11324518/pexels-photo-11324518.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Top view of fashionable white sneakers on a bold red background, perfect for footwear fashion and design.",
    credit: "Hurrah suhail",
  },
  trousers: {
    url: "https://images.pexels.com/photos/2897539/pexels-photo-2897539.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish man posing casually against a roller shutter surrounded by plants.",
    credit: "Prayoon Sajeev",
  },
  turtle: {
    url: "https://images.pexels.com/photos/32486966/pexels-photo-32486966.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A turtle sunbathes on a log in a tranquil pond setting.",
    credit: "patrice schoefolt",
  },
  volleyball: {
    url: "https://images.pexels.com/photos/28207837/pexels-photo-28207837.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white photo of a futevôlei player hitting a ball on a sandy court in Ilhéus, Brazil.",
    credit: "Renan Braz",
  },
  waiter: {
    url: "https://images.pexels.com/photos/3769740/pexels-photo-3769740.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Confident young ethnic waiter in elegant clothes holding tray with food and drinks and looking at camera while serving tables in stylish restaurant",
    credit: "Andrea Piacquadio",
  },
  wardrobe: {
    url: "https://images.pexels.com/photos/7587809/pexels-photo-7587809.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Inviting bedroom showcasing modern interior design with warm wooden elements and natural light.",
    credit: "Max Vakhtbovych",
  },
  watch: {
    url: "https://images.pexels.com/photos/1697570/pexels-photo-1697570.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist black watch on wrist showcasing elegant design and precise timekeeping.",
    credit: "Pragyan Bezbaruah",
  },
  whale: {
    url: "https://images.pexels.com/photos/17980729/pexels-photo-17980729.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A whale tail gracefully rising from the ocean, showcasing marine beauty and wildlife.",
    credit: "Ema Reynares",
  },
  window: {
    url: "https://images.pexels.com/photos/953400/pexels-photo-953400.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A home interior featuring a window with curtains, blinds, and potted plants.",
    credit: "Dominika Gregušová",
  },
  yoga: {
    url: "https://images.pexels.com/photos/16131310/pexels-photo-16131310.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man balances in an advanced yoga pose on a mat indoors, showcasing strength and focus.",
    credit: "Lê Đức",
  },
  above: {
    url: "https://images.pexels.com/photos/38351370/pexels-photo-38351370.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Breathtaking aerial view of fluffy clouds floating over a green landscape during the day.",
    credit: "Sarowar Hussain",
  },
  accordingly: {
    url: "https://images.pexels.com/photos/5619655/pexels-photo-5619655.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man stands in shadow with 'Disconnected' text projected on him, creating a tech-themed silhouette.",
    credit: "Med Rofka",
  },
  actress: {
    url: "https://images.pexels.com/photos/7434645/pexels-photo-7434645.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful graffiti of famous woman in red dress on weathered black wall with blue lines of building of town",
    credit: "Erik Mclean",
  },
  afternoon: {
    url: "https://images.pexels.com/photos/14864078/pexels-photo-14864078.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person meditates on a mat in a tranquil park amidst historical architecture, capturing peace and relaxation.",
    credit: "Shantanu Goyal",
  },
  alarm: {
    url: "https://images.pexels.com/photos/15068318/pexels-photo-15068318.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a red analog alarm clock with a rainbow clock face on a bright orange background.",
    credit: "Towfiqu barbhuiya",
  },
  amount: {
    url: "https://images.pexels.com/photos/6694563/pexels-photo-6694563.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two hands displaying cash and a smartphone calculator with a digital display, indicating a financial transaction.",
    credit: "Tima Miroshnichenko",
  },
  answer: {
    url: "https://images.pexels.com/photos/208494/pexels-photo-208494.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Yellow sign with text questions and answers suggesting direction in decision-making.",
    credit: "Pixabay",
  },
  art: {
    url: "https://images.pexels.com/photos/6933319/pexels-photo-6933319.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hands painting on a colorful palette, showcasing creativity and artistry.",
    credit: "Mikhail Nilov",
  },
  ascertain: {
    url: "https://images.pexels.com/photos/19802197/pexels-photo-19802197.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden tiles spelling 'DISCOVER' arranged neatly on a rustic surface.",
    credit: "Markus Winkler",
  },
  ate: {
    url: "https://images.pexels.com/photos/30737878/pexels-photo-30737878.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elegant table setting with gourmet dishes at Tepe Restaurant, Istanbul.",
    credit: "Ayşe İpek",
  },
  attached: {
    url: "https://images.pexels.com/photos/39495/castles-fence-love-symbol-39495.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Red and silver padlocks symbolizing love attached to a chain link fence on a bridge.",
    credit: "Pixabay",
  },
  aunt: {
    url: "https://images.pexels.com/photos/29996666/pexels-photo-29996666.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elderly woman and young woman bonding in a garden full of blooming flowers in Vietnam.",
    credit: "Duy Nguyen",
  },
  average: {
    url: "https://images.pexels.com/photos/39368612/pexels-photo-39368612.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful stock chart showing market trends with candlesticks and moving averages.",
    credit: "Rafael Minguet Delgado",
  },
  balance: {
    url: "https://images.pexels.com/photos/267950/pexels-photo-267950.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A calming seascape featuring stacked stones at twilight, symbolizing balance and tranquility.",
    credit: "Pixabay",
  },
  behind: {
    url: "https://images.pexels.com/photos/7298842/pexels-photo-7298842.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of a woman's back wearing a sports tank top. Ideal for fitness and lifestyle themes.",
    credit: "Kindel Media",
  },
  believed: {
    url: "https://images.pexels.com/photos/32368861/pexels-photo-32368861.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Inspirational word 'Believe' crafted on a textured pink watercolor background. Ideal for motivation.",
    credit: "Ann H",
  },
  beside: {
    url: "https://images.pexels.com/photos/12277200/pexels-photo-12277200.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Simple modern living room with a wooden clock and neutral sofa.",
    credit: "dada _design",
  },
  bought: {
    url: "https://images.pexels.com/photos/8470797/pexels-photo-8470797.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hands placing 'sold' sticker on sign in front of a new house.",
    credit: "Thirdman",
  },
  bride: {
    url: "https://images.pexels.com/photos/5966184/pexels-photo-5966184.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Charming young bride in white dress and veil sitting in black modern car on sunny summer day",
    credit: "Анна Хазова",
  },
  broad: {
    url: "https://images.pexels.com/photos/33927045/pexels-photo-33927045.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Geometric facade of The Broad in Los Angeles showcases contemporary architectural style.",
    credit: "Jess Chen",
  },
  brush: {
    url: "https://images.pexels.com/photos/6148/brush-makeup-make-up-brushes.jpg?auto=compress&cs=tinysrgb&h=350",
    alt: "A stylish arrangement of makeup brushes set against a dark, elegant background.",
    credit: "Karolina Grabowska www.kaboompics.com",
  },
  brushes: {
    url: "https://images.pexels.com/photos/8382391/pexels-photo-8382391.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of various paintbrushes, essential for artistic creativity and painting projects.",
    credit: "Pavel Danilyuk",
  },
  building: {
    url: "https://images.pexels.com/photos/39376680/pexels-photo-39376680.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A modern building in Rajkot, Gujarat, India, under a dramatic cloudy sky.",
    credit: "Sarvaiya Keval",
  },
  calculator: {
    url: "https://images.pexels.com/photos/5921494/pexels-photo-5921494.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Hand using calculator for architectural calculations on blueprints.",
    credit: "RDNE Stock project",
  },
  card: {
    url: "https://images.pexels.com/photos/28639929/pexels-photo-28639929.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elderly person holding a playing card and newspaper while sitting outside in sunlight.",
    credit: "Roza",
  },
  catch: {
    url: "https://images.pexels.com/photos/1349509/pexels-photo-1349509.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Football player leaps to catch a ball with a vibrant rainbow backdrop on a sunny field.",
    credit: "football wife",
  },
  change: {
    url: "https://images.pexels.com/photos/32240408/pexels-photo-32240408.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters arranged to form 'Changes' on a textured, rustic surface.",
    credit: "Ann H",
  },
  cheaper: {
    url: "https://images.pexels.com/photos/6052793/pexels-photo-6052793.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A red ceramic piggy bank with polka dots surrounded by coins, symbolizing savings and finance.",
    credit: "Andre Taissin",
  },
  checks: {
    url: "https://images.pexels.com/photos/11412596/pexels-photo-11412596.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a checklist with green checkmarks on white paper using a marker.",
    credit: "Towfiqu barbhuiya",
  },
  chilly: {
    url: "https://images.pexels.com/photos/14008249/pexels-photo-14008249.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant green chili peppers growing, showcasing freshness and spice.",
    credit: "Yulianto Andika",
  },
  circle: {
    url: "https://images.pexels.com/photos/31650363/pexels-photo-31650363.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant abstract image featuring overlapping gradient circles in purple and pink hues.",
    credit: "Mahmoud Ramadan",
  },
  clear: {
    url: "https://images.pexels.com/photos/4271802/pexels-photo-4271802.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A clear glass tumbler spilled on a flat surface, creating a minimalist and serene scene.",
    credit: "alleksana",
  },
  closed: {
    url: "https://images.pexels.com/photos/942304/pexels-photo-942304.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up of a 'Closed' sign hanging against a blurred, bokeh background, creating a warm, inviting atmosphere.",
    credit: "Tim Mossholder",
  },
  cloud: {
    url: "https://images.pexels.com/photos/5432833/pexels-photo-5432833.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A single fluffy cloud floating in a bright blue sky on a clear day.",
    credit: "Gije Cho",
  },
  coins: {
    url: "https://images.pexels.com/photos/1006060/pexels-photo-1006060.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Assorted foreign coins stacked and scattered on a textured surface.",
    credit: "Steve A Johnson",
  },
  cold: {
    url: "https://images.pexels.com/photos/29732515/pexels-photo-29732515.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of snow-covered rocks in a serene winter setting.",
    credit: "Raul Ling",
  },
  colleague: {
    url: "https://images.pexels.com/photos/8204399/pexels-photo-8204399.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two business professionals smiling and talking during a coffee break in a modern office setting.",
    credit: "Kampus Production",
  },
  come: {
    url: "https://images.pexels.com/photos/8841712/pexels-photo-8841712.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white close-up of a motivational sign on a cafe window inviting customers to be themselves.",
    credit: "Melanie Brumble",
  },
  cone: {
    url: "https://images.pexels.com/photos/37805919/pexels-photo-37805919.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed shot of a pine cone with lush green needles, showcasing nature's beauty.",
    credit: "ArWeltAtty Attila",
  },
  consequently: {
    url: "https://images.pexels.com/photos/240163/pexels-photo-240163.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up shot of mathematical equations on a book page, perfect for education and learning concepts.",
    credit: "Deepak Gautam",
  },
  consistent: {
    url: "https://images.pexels.com/photos/16648178/pexels-photo-16648178.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of gentle ocean waves creating foam on a sandy beach.",
    credit: "Suki Lee",
  },
  contactless: {
    url: "https://images.pexels.com/photos/13657444/pexels-photo-13657444.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A businessman uses a secure card reader access system against a concrete wall.",
    credit: "Susanne Plank",
  },
  cooks: {
    url: "https://images.pexels.com/photos/12203611/pexels-photo-12203611.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Culinary staff wearing uniforms and masks preparing meals in a bustling restaurant kitchen setting.",
    credit: "Ali  Alcántara",
  },
  cube: {
    url: "https://images.pexels.com/photos/10285256/pexels-photo-10285256.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of two stacked Rubik's Cubes showcasing multi-colored squares for puzzle enthusiasts.",
    credit: "Engin Akyurt",
  },
  cylinder: {
    url: "https://images.pexels.com/photos/30686744/pexels-photo-30686744.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A contemporary rooftop featuring cylindrical structures under a clear sky.",
    credit: "Jiferson Mondragon",
  },
  dangerous: {
    url: "https://images.pexels.com/photos/36634292/pexels-photo-36634292.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Monochrome image of a crocodile warning sign against a rocky background.",
    credit: "Jean-Paul Wettstein",
  },
  days: {
    url: "https://images.pexels.com/photos/9810172/pexels-photo-9810172.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a calendar with red push pins marking important dates, emphasizing deadlines.",
    credit: "Towfiqu barbhuiya",
  },
  december: {
    url: "https://images.pexels.com/photos/3311235/pexels-photo-3311235.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A creative 'Hello December' message with pine leaves set on rustic wood.",
    credit: "Elijah O'Donnell",
  },
  delayed: {
    url: "https://images.pexels.com/photos/7447880/pexels-photo-7447880.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Mobile electronic traffic sign with inscription Expect delays placed on road in city street in evening time",
    credit: "Erik Mclean",
  },
  departs: {
    url: "https://images.pexels.com/photos/34983564/pexels-photo-34983564.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A scenic view of the breakwater and lighthouse along Montevideo's rugged coastline.",
    credit: "Nikolai Kolosov",
  },
  despite: {
    url: "https://images.pexels.com/photos/37420803/pexels-photo-37420803.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Protesters holding a bold anti-imperialism banner during a street demonstration.",
    credit: "Mico Medel",
  },
  different: {
    url: "https://images.pexels.com/photos/8088434/pexels-photo-8088434.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A diverse crowd stands together in a studio, exploring themes of individuality and social connections.",
    credit: "cottonbro studio",
  },
  difficult: {
    url: "https://images.pexels.com/photos/14958465/pexels-photo-14958465.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Man carrying large load while hiking through rugged mountain valley",
    credit: "Kata",
  },
  dirty: {
    url: "https://images.pexels.com/photos/981297/pexels-photo-981297.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a rusty metal door featuring graffiti and a peeling handle, embodying urban decay.",
    credit: "Brett Sayles",
  },
  discount: {
    url: "https://images.pexels.com/photos/5625001/pexels-photo-5625001.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Shop 50% discounts with a stylish gift box on a Black Friday sale background.",
    credit: "https://kaboompics.com/",
  },
  discuss: {
    url: "https://images.pexels.com/photos/3182752/pexels-photo-3182752.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two colleagues engaged in a collaborative discussion during a team meeting at the office.",
    credit: "fauxels",
  },
  dont: {
    url: "https://images.pexels.com/photos/8384531/pexels-photo-8384531.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Creative flat lay with a sunscreen reminder and mannequin legs on a blue background.",
    credit: "Tara Winstead",
  },
  drink: {
    url: "https://images.pexels.com/photos/8539249/pexels-photo-8539249.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women in activewear enjoying drinks in a sunny outdoor setting.",
    credit: "Polina Tankilevitch",
  },
  drinks: {
    url: "https://images.pexels.com/photos/4113660/pexels-photo-4113660.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Chilled Coca Cola bottles and cans surrounded by ice cubes, offering a refreshing beverage choice.",
    credit: "alleksana",
  },
  drives: {
    url: "https://images.pexels.com/photos/32892856/pexels-photo-32892856.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A collection of dismantled hard disk drives displayed on a white surface, showcasing internal components.",
    credit: "Marta Branco",
  },
  dry: {
    url: "https://images.pexels.com/photos/36723219/pexels-photo-36723219.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of cracked, dry desert earth illustrating drought conditions.",
    credit: "Anastasiia Melnyk",
  },
  duchess: {
    url: "https://images.pexels.com/photos/19736818/pexels-photo-19736818.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Iconic red double-decker bus on a bustling London street, passing by urban architecture.",
    credit: "Igor Passchier",
  },
  due: {
    url: "https://images.pexels.com/photos/33385777/pexels-photo-33385777.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Seagull perched with a domed historic building in the background under blue skies.",
    credit: "Najm Shihabi",
  },
  ear: {
    url: "https://images.pexels.com/photos/31987550/pexels-photo-31987550.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of a newborn baby's ear, capturing softness and innocence.",
    credit: "Natálie Scherer",
  },
  eat: {
    url: "https://images.pexels.com/photos/11872318/pexels-photo-11872318.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a person using chopsticks to enjoy flavorful Asian noodles in a bowl.",
    credit: "Nadin Sh",
  },
  elaborate: {
    url: "https://images.pexels.com/photos/38607089/pexels-photo-38607089.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of an ornate Islamic arch with intricate tile patterns and blue sky in the background.",
    credit: "Nur",
  },
  empty: {
    url: "https://images.pexels.com/photos/31446480/pexels-photo-31446480.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A woman in a garden smiling and holding flowers while wearing a white sweater.",
    credit: "🇻🇳🇻🇳Nguyễn Tiến Thịnh 🇻🇳🇻🇳",
  },
  enjoy: {
    url: "https://images.pexels.com/photos/38841195/pexels-photo-38841195.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A frothy cappuccino served in a white ceramic cup positioned on a gray surface.",
    credit: "Norbert Bálint",
  },
  enough: {
    url: "https://images.pexels.com/photos/8110779/pexels-photo-8110779.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Scrabble tiles on a pink background spelling out 'Get Enough Sleep'. Ideal for wellness and lifestyle themes.",
    credit: "Anna Tarazevich",
  },
  entirely: {
    url: "https://images.pexels.com/photos/19835652/pexels-photo-19835652.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Scrabble tiles arranged to form the word 'intimacy' on a wooden background.",
    credit: "Markus Winkler",
  },
  equally: {
    url: "https://images.pexels.com/photos/6185434/pexels-photo-6185434.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Metallic letter blocks spell 'All Love is Equal' creating a message about equality.",
    credit: "Polina ⠀",
  },
  exact: {
    url: "https://images.pexels.com/photos/162500/measurement-millimeter-centimeter-meter-162500.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of a measuring tape indicating measurements in feet and meters.",
    credit: "Pixabay",
  },
  excuse: {
    url: "https://images.pexels.com/photos/8728901/pexels-photo-8728901.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: 'Inspirational phrase "Stop making excuses" crafted with wooden letter tiles.',
    credit: "Brett Jordan",
  },
  expensive: {
    url: "https://images.pexels.com/photos/4386181/pexels-photo-4386181.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Multicolored pills in silver blisters on white surface near heap of paper money representing expensive pharmacy",
    credit: "https://kaboompics.com/",
  },
  fall: {
    url: "https://images.pexels.com/photos/6225215/pexels-photo-6225215.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant autumn maple leaves scattered on the ground, capturing fall's essence.",
    credit: "taro",
  },
  far: {
    url: "https://images.pexels.com/photos/11665210/pexels-photo-11665210.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Breathtaking aerial view of lush green mountains near Barcelona, featuring clear skies and scenic landscapes.",
    credit: "Hamza  Es",
  },
  february: {
    url: "https://images.pexels.com/photos/20047828/pexels-photo-20047828.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A red rose rests on a February calendar, symbolizing love and Valentine's Day.",
    credit: "Lisa Fotios",
  },
  fifteen: {
    url: "https://images.pexels.com/photos/2872752/pexels-photo-2872752.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Teen girl celebrating her fifteenth birthday with golden balloons in an outdoor meadow.",
    credit: "Kelvin  Siqueira",
  },
  fifty: {
    url: "https://images.pexels.com/photos/7826289/pexels-photo-7826289.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elegant cake with golden 50th birthday topper and star decorations.",
    credit: "Nataliya Vaitkevich",
  },
  first: {
    url: "https://images.pexels.com/photos/7858225/pexels-photo-7858225.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Creative arrangement of Scrabble tiles spelling 'But First Tea' on a white surface.",
    credit: "Brett Jordan",
  },
  flowers: {
    url: "https://images.pexels.com/photos/584420/little-pink-flowers-cute-584420.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of vibrant pink daisies with a soft-focus background, showcasing nature's beauty.",
    credit: "ClickerHappy",
  },
  fly: {
    url: "https://images.pexels.com/photos/17813460/pexels-photo-17813460.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Macro photograph of a housefly resting on a green leaf, showcasing natural wildlife details.",
    credit: "David K",
  },
  fog: {
    url: "https://images.pexels.com/photos/4946838/pexels-photo-4946838.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Picturesque scenery of green coniferous forest growing around small settlement covered with thick fog",
    credit: "Maria Orlova",
  },
  foggy: {
    url: "https://images.pexels.com/photos/10387112/pexels-photo-10387112.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Serene view of misty mountains and trees in Lesser Poland",
    credit: "Adrian Regeci",
  },
  forty: {
    url: "https://images.pexels.com/photos/30700464/pexels-photo-30700464.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Woman celebrating her 40th birthday with golden balloons and a glass of wine.",
    credit: "Eric Moura",
  },
  forward: {
    url: "https://images.pexels.com/photos/10423767/pexels-photo-10423767.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A motivational phrase 'Press Fast Forward' spelled with Scrabble pieces on a white background.",
    credit: "Brett Jordan",
  },
  free: {
    url: "https://images.pexels.com/photos/36781759/pexels-photo-36781759.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Group of people enjoying a beautiful sunset view from a grassy hilltop, surrounded by nature.",
    credit: "Warren  Noronha",
  },
  freezing: {
    url: "https://images.pexels.com/photos/1726789/pexels-photo-1726789.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of frosty roof shingles showcasing winter's icy grip and cold atmosphere.",
    credit: "Nadine Wuchenauer",
  },
  friday: {
    url: "https://images.pexels.com/photos/33008589/pexels-photo-33008589.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Eye-catching torn paper with Friday Offer text for promotions.",
    credit: "Adriana Beckova",
  },
  geese: {
    url: "https://images.pexels.com/photos/16974441/pexels-photo-16974441.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Canada geese in a grassy meadow under the sun, surrounded by yellow flowers.",
    credit: "Robert So",
  },
  girl: {
    url: "https://images.pexels.com/photos/38399839/pexels-photo-38399839.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A cheerful young girl in a striped top enjoying summer playtime outdoors.",
    credit: "panumas nikhomkhai",
  },
  godmother: {
    url: "https://images.pexels.com/photos/17516971/pexels-photo-17516971.png?auto=compress&cs=tinysrgb&h=350",
    alt: "A joyful mother holding her smiling baby outdoors on a sunny day, showcasing love and happiness.",
    credit: "Photography Maghradze PH",
  },
  good: {
    url: "https://images.pexels.com/photos/19023274/pexels-photo-19023274.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person holds a sticky note with an encouraging message in Dubai.",
    credit: "aboodi vesakaran",
  },
  granddaughter: {
    url: "https://images.pexels.com/photos/39465740/pexels-photo-39465740.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Heartwarming photo of a grandfather receiving kisses from his granddaughters outdoors.",
    credit: "Nuh Köstekli",
  },
  half: {
    url: "https://images.pexels.com/photos/5180433/pexels-photo-5180433.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A fresh, juicy blood orange sliced in half showcasing its vibrant colors and textures.",
    credit: "Elle Hughes",
  },
  halves: {
    url: "https://images.pexels.com/photos/820904/pexels-photo-820904.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant orange slices beautifully arranged on a rustic wooden surface, showcasing fresh and juicy texture.",
    credit: "Jessica Lewis 🦋 thepaintedsquare",
  },
  hard: {
    url: "https://images.pexels.com/photos/29083058/pexels-photo-29083058.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Team of construction workers collaborating on a project in San José, Costa Rica.",
    credit: "Mario Spencer",
  },
  harsh: {
    url: "https://images.pexels.com/photos/583347/pexels-photo-583347.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white macro shot of barbed wire, blurring the background for an abstract feel.",
    credit: "Daniel Abbatt",
  },
  hearing: {
    url: "https://images.pexels.com/photos/7283536/pexels-photo-7283536.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women listening to music together with earphones while sitting on a couch indoors.",
    credit: "https://kaboompics.com/",
  },
  heavy: {
    url: "https://images.pexels.com/photos/39345876/pexels-photo-39345876.png?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of yellow construction equipment's hydraulic system under sunlight.",
    credit: "Daniel  Wells",
  },
  heroine: {
    url: "https://images.pexels.com/photos/7777515/pexels-photo-7777515.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two cosplayers engage in a dynamic martial arts duel amidst dramatic fog, indoors.",
    credit: "cottonbro studio",
  },
  hexagon: {
    url: "https://images.pexels.com/photos/10051140/pexels-photo-10051140.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of gray hexagonal stone tiles creating a geometric pattern.",
    credit: "Alex Quezada",
  },
  hey: {
    url: "https://images.pexels.com/photos/4439450/pexels-photo-4439450.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Flat lay of eyeglasses and eucalyptus leaves with greeting card saying 'hey'.",
    credit: "Vie Studio",
  },
  hiking: {
    url: "https://images.pexels.com/photos/5064634/pexels-photo-5064634.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Multiracial men in activewear with backpacks resting on stone and checking ticks while having break during trekking",
    credit: "Kamaji Ogino",
  },
  hostess: {
    url: "https://images.pexels.com/photos/17694889/pexels-photo-17694889.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Enthusiastic flight attendant wearing a red uniform stands smiling in an airplane cabin.",
    credit: "Alejandro Quiñonez",
  },
  hot: {
    url: "https://images.pexels.com/photos/27377785/pexels-photo-27377785.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant hot air balloons soaring over trees in a clear summer sky.",
    credit: "Manuel Torres Garcia",
  },
  hottest: {
    url: "https://images.pexels.com/photos/28191076/pexels-photo-28191076.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed photo of the Sun showing sunspots, ideal for science or astronomy content.",
    credit: "Jay Brand",
  },
  hour: {
    url: "https://images.pexels.com/photos/6968188/pexels-photo-6968188.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist round wall clock with gold rim and white face on a white wall.",
    credit: "Mikhail Nilov",
  },
  huge: {
    url: "https://images.pexels.com/photos/7621756/pexels-photo-7621756.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Side view of a majestic African elephant standing in grassland, showcasing its immense size and tusks.",
    credit: "Motion Works",
  },
  ice: {
    url: "https://images.pexels.com/photos/35993293/pexels-photo-35993293.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of leaves trapped in ice, showcasing abstract patterns and textures in winter.",
    credit: "wal_ 172619",
  },
  indicate: {
    url: "https://images.pexels.com/photos/16052956/pexels-photo-16052956.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Red circle with white arrow on a minimalist wall, symbolizing direction and design.",
    credit: "Jan van der Wolf",
  },
  interested: {
    url: "https://images.pexels.com/photos/31864398/pexels-photo-31864398.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two children in red hoodies using microscopes in a classroom setting, focusing on scientific exploration.",
    credit: "Bhupindra International Public School",
  },
  interesting: {
    url: "https://images.pexels.com/photos/267363/pexels-photo-267363.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letter tiles arranged to spell Pinterest on a wooden table, ideal for social media themes.",
    credit: "Pixabay",
  },
  january: {
    url: "https://images.pexels.com/photos/1764429/pexels-photo-1764429.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of Scrabble tiles spelling 'January' on a white surface, perfect for winter or new year themes.",
    credit: "Jess Bailey Designs",
  },
  july: {
    url: "https://images.pexels.com/photos/5498347/pexels-photo-5498347.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Summer-themed flat lay with vacation essentials like sunglasses, fruits, and calendar on sand.",
    credit: "Boris Pavlikovsky",
  },
  june: {
    url: "https://images.pexels.com/photos/17265817/pexels-photo-17265817.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Blonde woman enjoying white flowers outdoors, smiling happily in a straw hat.",
    credit: "olga Volkovitskaia",
  },
  knee: {
    url: "https://images.pexels.com/photos/8093226/pexels-photo-8093226.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of diverse human legs highlighting body diversity. Top view arrangement.",
    credit: "https://kaboompics.com/",
  },
  lady: {
    url: "https://images.pexels.com/photos/4871916/pexels-photo-4871916.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A young woman smiling and posing outdoors in a stylish striped shirt and jeans.",
    credit: "Gustavo Fring",
  },
  landlady: {
    url: "https://images.pexels.com/photos/6466219/pexels-photo-6466219.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elegant hotel housekeeper holding fresh, neatly folded white towels in a luxurious room.",
    credit: "cottonbro studio",
  },
  last: {
    url: "https://images.pexels.com/photos/7317728/pexels-photo-7317728.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A grieving woman wipes tears during a heartfelt funeral ceremony in a somber indoor setting.",
    credit: "Pavel Danilyuk",
  },
  late: {
    url: "https://images.pexels.com/photos/11790890/pexels-photo-11790890.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A surprised couple holding an alarm clock while sitting in bed, expressing shock.",
    credit: "Rhema Emeka-Chiemenem",
  },
  later: {
    url: "https://images.pexels.com/photos/36502165/pexels-photo-36502165.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up macro photograph of a grasshopper perched on a green stem with a purple flower, showcasing detailed textures.",
    credit: "Pavan Prasad",
  },
  lead: {
    url: "https://images.pexels.com/photos/19856609/pexels-photo-19856609.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letter tiles spelling 'LEADERSHIP' on a wooden surface, symbolizing leadership qualities and skills.",
    credit: "Markus Winkler",
  },
  library: {
    url: "https://images.pexels.com/photos/9572540/pexels-photo-9572540.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Group of students studying together in a cozy library setting with bookshelves around.",
    credit: "Tima Miroshnichenko",
  },
  like: {
    url: "https://images.pexels.com/photos/8831805/pexels-photo-8831805.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "3D rendered cartoon hand showing a thumbs-up with a black background.",
    credit: "cottonbro CG studio",
  },
  list: {
    url: "https://images.pexels.com/photos/38728965/pexels-photo-38728965.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden 'To Do' list design on dark marble background, perfect for productivity themes.",
    credit: "Ann H",
  },
  lived: {
    url: "https://images.pexels.com/photos/36077399/pexels-photo-36077399.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Lively street view of Nashville's Broadway, showcasing bright lights and bustling nightlife.",
    credit: "Mark Direen",
  },
  lives: {
    url: "https://images.pexels.com/photos/761543/pexels-photo-761543.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Dynamic concert scene with an energetic crowd at night in a London stadium.",
    credit: "Jack Gittoes",
  },
  long: {
    url: "https://images.pexels.com/photos/30973304/pexels-photo-30973304.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Beautiful long-haired collie captured outdoors, showcasing its vibrant coat and lively expression.",
    credit: "Gundula Vogel",
  },
  lost: {
    url: "https://images.pexels.com/photos/30341731/pexels-photo-30341731.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A mysterious abandoned villa surrounded by lush trees in a warm sunset light.",
    credit: "Sabine Otten",
  },
  lovely: {
    url: "https://images.pexels.com/photos/867463/pexels-photo-867463.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A charming heart illustration on a card inside an envelope placed on a rustic wooden table, perfect for Valentine's Day.",
    credit: "freestocks.org",
  },
  low: {
    url: "https://images.pexels.com/photos/2029478/pexels-photo-2029478.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a road with a slow sign in yellow, capturing a calm street scene in Singapore.",
    credit: "Song Kaiyue",
  },
  map: {
    url: "https://images.pexels.com/photos/8828418/pexels-photo-8828418.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Magnifying glass focuses on pins highlighting travel destinations on a world map.",
    credit: "Lara Jameson",
  },
  meet: {
    url: "https://images.pexels.com/photos/6953835/pexels-photo-6953835.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Happy diverse women in stylish elegant clothes smiling while shaking hands in contemporary office",
    credit: "George Milton",
  },
  men: {
    url: "https://images.pexels.com/photos/16257489/pexels-photo-16257489.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Five well-dressed young men smiling at a casual indoor event, symbolizing friendship.",
    credit: "Rajesh Syangtan",
  },
  midnight: {
    url: "https://images.pexels.com/photos/414331/pexels-photo-414331.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A dramatic dusk scene with silhouetted trees reflected in a tranquil lake under a cloudy sky.",
    credit: "Pixabay",
  },
  mild: {
    url: "https://images.pexels.com/photos/20408461/pexels-photo-20408461.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Delicious Indian curry with vibrant spices and herbs, beautifully arranged in a bowl.",
    credit: "Jack Baghel",
  },
  mind: {
    url: "https://images.pexels.com/photos/6962645/pexels-photo-6962645.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two adults peacefully meditating outdoors under serene nature views.",
    credit: "Cup of  Couple",
  },
  minute: {
    url: "https://images.pexels.com/photos/6968188/pexels-photo-6968188.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist round wall clock with gold rim and white face on a white wall.",
    credit: "Mikhail Nilov",
  },
  monday: {
    url: "https://images.pexels.com/photos/33094239/pexels-photo-33094239.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden blocks spelling Monday on a neutral background, symbolic of the start of the week.",
    credit: "Ann H",
  },
  money: {
    url: "https://images.pexels.com/photos/14820446/pexels-photo-14820446.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Crisp image of a $100 bill standing and reflecting on a smooth surface, highlighting details.",
    credit: "Jonathan Borba",
  },
  months: {
    url: "https://images.pexels.com/photos/29509534/pexels-photo-29509534.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of a 2026 spiral-bound desk calendar showing February and March.",
    credit: "Matheus Bertelli",
  },
  morning: {
    url: "https://images.pexels.com/photos/13975/pexels-photo-13975.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene backyard captured at sunrise with lens flare through trees.",
    credit: "Anders Kristensen",
  },
  mornings: {
    url: "https://images.pexels.com/photos/10680816/pexels-photo-10680816.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person holding a coffee mug while relaxing in bed, covered with a white sheet.",
    credit: "Xeniya Kovaleva",
  },
  motherinlaw: {
    url: "https://images.pexels.com/photos/8790748/pexels-photo-8790748.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Three senior women enjoying a beautiful wedding moment outdoors in Portugal.",
    credit: "Kampus Production",
  },
  nap: {
    url: "https://images.pexels.com/photos/269141/pexels-photo-269141.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Person napping under a blue blanket on a comfortable couch in a modern living room setting.",
    credit: "Pixabay",
  },
  narrow: {
    url: "https://images.pexels.com/photos/11805687/pexels-photo-11805687.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Explore a narrow alleyway with rustic brick walls and a distant couple, capturing urban charm.",
    credit: "Helena Jankovičová Kováčová",
  },
  nevertheless: {
    url: "https://images.pexels.com/photos/21926921/pexels-photo-21926921.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish urban fashion shot featuring two models with a truck in the background.",
    credit: "Kenneth Surillo",
  },
  niece: {
    url: "https://images.pexels.com/photos/28532115/pexels-photo-28532115.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Portrait of a happy woman with braided hair smiling outdoors in a natural setting.",
    credit: "Tony Meyers",
  },
  night: {
    url: "https://images.pexels.com/photos/29047032/pexels-photo-29047032.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A captivating view of the starry night sky showcasing the Milky Way.",
    credit: "9 Shots",
  },
  notes: {
    url: "https://images.pexels.com/photos/8386753/pexels-photo-8386753.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Overhead view of a desk with blue sticky notes, crumpled paper, and a green pen.",
    credit: "Tara Winstead",
  },
  octagon: {
    url: "https://images.pexels.com/photos/39064515/pexels-photo-39064515.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Looking up inside a multi-level octagonal courtyard with dark and light geometric contrasts.",
    credit: "Diptadip Roy",
  },
  october: {
    url: "https://images.pexels.com/photos/28679550/pexels-photo-28679550.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A rustic pumpkin resting on vibrant autumn leaves, capturing the essence of fall season.",
    credit: "Ylanite Koppens",
  },
  old: {
    url: "https://images.pexels.com/photos/38882670/pexels-photo-38882670.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vintage rusty lantern hanging from a tree branch against a blurred leafy background.",
    credit: "Сокіл Sokil",
  },
  opens: {
    url: "https://images.pexels.com/photos/6956129/pexels-photo-6956129.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of an 'Open for Business' sign on a textured brown paper background.",
    credit: "Eva Bronzini",
  },
  opposite: {
    url: "https://images.pexels.com/photos/17151674/pexels-photo-17151674.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Abstract composition featuring red and blue pencils on contrasting red and blue backgrounds.",
    credit: "Marta Nogueira",
  },
  oval: {
    url: "https://images.pexels.com/photos/32355718/pexels-photo-32355718.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Contemporary interior design featuring an oval window and a hanging plant, creating a minimalist aesthetic.",
    credit: "🇻🇳🇻🇳 Việt Anh Nguyễn 🇻🇳🇻🇳",
  },
  oversized: {
    url: "https://images.pexels.com/photos/9558246/pexels-photo-9558246.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish outfit featuring a pink oversized t-shirt and blue denim jeans in a studio setting.",
    credit: "MART  PRODUCTION",
  },
  pack: {
    url: "https://images.pexels.com/photos/5195144/pexels-photo-5195144.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Scenic view of a mountain lake with a blue backpack in the foreground, perfect for travel and adventure enthusiasts.",
    credit: "Akhter Jan",
  },
  parties: {
    url: "https://images.pexels.com/photos/5175593/pexels-photo-5175593.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Energetic nightclub scene with crowd dancing under confetti and colorful lights.",
    credit: "Maor Attias",
  },
  pay: {
    url: "https://images.pexels.com/photos/50987/money-card-business-credit-card-50987.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up shot of a hand offering a blue debit card for payment.",
    credit: "Pixabay",
  },
  pentagon: {
    url: "https://images.pexels.com/photos/38612875/pexels-photo-38612875.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Abstract view of an intricate geometric glass roof from below, showcasing modern architectural design in Washington, D.C.",
    credit: "Zion Smith",
  },
  people: {
    url: "https://images.pexels.com/photos/36729918/pexels-photo-36729918.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A diverse group of friends taking a joyful selfie outdoors during sunset.",
    credit: "Vitaly Gariev",
  },
  plane: {
    url: "https://images.pexels.com/photos/126621/pexels-photo-126621.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of vintage airplanes in flight, displaying a captivating aerial formation.",
    credit: "Inge Wallumrød",
  },
  play: {
    url: "https://images.pexels.com/photos/31864406/pexels-photo-31864406.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A young child playing with educational toys in a classroom setting, fostering learning and development.",
    credit: "Bhupindra International Public School",
  },
  plays: {
    url: "https://images.pexels.com/photos/591652/play-fun-blocks-block-591652.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of colorful wooden blocks spelling 'PLAY', perfect for educational themes.",
    credit: "ClickerHappy",
  },
  point: {
    url: "https://images.pexels.com/photos/4468119/pexels-photo-4468119.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Tattooed hand pointing with a minimalistic arrow tattoo, symbolizing guidance and direction.",
    credit: "Sony Dude",
  },
  poor: {
    url: "https://images.pexels.com/photos/5590343/pexels-photo-5590343.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "From above of anonymous male sitting at shabby house while working in poor district near railroad on street with buckets",
    credit: "Tom Fisk",
  },
  princess: {
    url: "https://images.pexels.com/photos/31103093/pexels-photo-31103093.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stunning woman in a purple gown with a tiara posing elegantly outdoors against rocky background.",
    credit: "James Bat Barrera",
  },
  queen: {
    url: "https://images.pexels.com/photos/37066133/pexels-photo-37066133.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A joyful beauty queen seated elegantly indoors, adorned with a crown and sash, symbolizing grace and celebration.",
    credit: "Patricio Ledeill",
  },
  quiet: {
    url: "https://images.pexels.com/photos/15276666/pexels-photo-15276666.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Blurred silhouettes of two people reflected in water, creating a moody and abstract atmosphere.",
    credit: "Zechen Li",
  },
  rained: {
    url: "https://images.pexels.com/photos/3394939/pexels-photo-3394939.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Serene teal water surface with ripples and raindrops, perfect for backgrounds.",
    credit: "Matheus Natan",
  },
  raining: {
    url: "https://images.pexels.com/photos/3394939/pexels-photo-3394939.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Serene teal water surface with ripples and raindrops, perfect for backgrounds.",
    credit: "Matheus Natan",
  },
  rainy: {
    url: "https://images.pexels.com/photos/734785/pexels-photo-734785.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white image of a building seen through rain-covered window in Dhaka.",
    credit: "Hedaetul Islam",
  },
  read: {
    url: "https://images.pexels.com/photos/7034186/pexels-photo-7034186.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Serious female in eyeglasses and red sweater reading novel while lying on floor in light room at home during free time",
    credit: "George Milton",
  },
  reads: {
    url: "https://images.pexels.com/photos/11047071/pexels-photo-11047071.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A pile of old vintage books stacked in dim lighting, embodying history.",
    credit: "Bacho Grigolia",
  },
  receipt: {
    url: "https://images.pexels.com/photos/7680361/pexels-photo-7680361.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a five-dollar bill next to shopping receipts on a white background, ideal for finance and retail themes.",
    credit: "https://kaboompics.com/",
  },
  rectangle: {
    url: "https://images.pexels.com/photos/25626436/pexels-photo-25626436.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white abstract blocks on a white background, conceptual design.",
    credit: "Google DeepMind",
  },
  ride: {
    url: "https://images.pexels.com/photos/33253314/pexels-photo-33253314.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Experience the excitement of a high-speed roller coaster ride captured in Västra Götalands län, Sweden.",
    credit: "Nik Nikolla",
  },
  sad: {
    url: "https://images.pexels.com/photos/6669802/pexels-photo-6669802.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A young woman holds her head in distress while sitting indoors, capturing an emotional moment.",
    credit: "RDNE Stock project",
  },
  sale: {
    url: "https://images.pexels.com/photos/7986981/pexels-photo-7986981.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Multicolor letters spelling SALE on a textured black surface, perfect for promotional use.",
    credit: "Tamanna Rumee",
  },
  saleswoman: {
    url: "https://images.pexels.com/photos/3932739/pexels-photo-3932739.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Side view of smiling Asian female seller employee wearing apron taking notes on clipboard with pen during paperwork standing in stylish shop and looking at camera",
    credit: "Andrea Piacquadio",
  },
  saturday: {
    url: "https://images.pexels.com/photos/3944516/pexels-photo-3944516.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A hand holds an open book on a warm blanket, with Saturday card, evoking leisure.",
    credit: "cottonbro studio",
  },
  save: {
    url: "https://images.pexels.com/photos/34383953/pexels-photo-34383953.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A piggy bank on euro bills with 'save' text highlights money saving concepts.",
    credit: "Marta Branco",
  },
  shelves: {
    url: "https://images.pexels.com/photos/35632410/pexels-photo-35632410.png?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant fabric rolls neatly arranged in wooden shelves, showcasing a palette of colors.",
    credit: "Anandhu Arjunan",
  },
  short: {
    url: "https://images.pexels.com/photos/33042454/pexels-photo-33042454.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A relaxed person leaning on a rustic railing outdoors, exuding calmness.",
    credit: "🇻🇳🇻🇳Nguyễn Tiến Thịnh 🇻🇳🇻🇳",
  },
  slow: {
    url: "https://images.pexels.com/photos/2029478/pexels-photo-2029478.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a road with a slow sign in yellow, capturing a calm street scene in Singapore.",
    credit: "Song Kaiyue",
  },
  small: {
    url: "https://images.pexels.com/photos/38689219/pexels-photo-38689219.png?auto=compress&cs=tinysrgb&h=350",
    alt: "Rally car with vibrant decals races on a sunny, winding road in Greece.",
    credit: "Alex Ravvas",
  },
  snow: {
    url: "https://images.pexels.com/photos/20281802/pexels-photo-20281802.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A peaceful winter scene featuring a frozen lake, snow-covered trees, and a wooden fence under a blanket of fresh snow.",
    credit: "Eren Arıcı",
  },
  speak: {
    url: "https://images.pexels.com/photos/6878694/pexels-photo-6878694.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Four people in a studio setting with microphones, engaged in conversation.",
    credit: "cottonbro studio",
  },
  spend: {
    url: "https://images.pexels.com/photos/5849580/pexels-photo-5849580.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Cut out paper composition of stopwatch in hand of man waiting for money credited to credit card on blue background",
    credit: "Monstera Production",
  },
  spent: {
    url: "https://images.pexels.com/photos/5849580/pexels-photo-5849580.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Cut out paper composition of stopwatch in hand of man waiting for money credited to credit card on blue background",
    credit: "Monstera Production",
  },
  sphere: {
    url: "https://images.pexels.com/photos/29822392/pexels-photo-29822392.png?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist composition of three white spheres on a bold red background.",
    credit: "Alp Mmiy",
  },
  square: {
    url: "https://images.pexels.com/photos/33923149/pexels-photo-33923149.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Abstract composition with colorful layered paper creating a geometric pattern.",
    credit: "Sóc Năng Động",
  },
  station: {
    url: "https://images.pexels.com/photos/29731398/pexels-photo-29731398.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A busy Paris metro station captured with commuters waiting for their train.",
    credit: "Artūras Kokorevas",
  },
  stepmother: {
    url: "https://images.pexels.com/photos/6163284/pexels-photo-6163284.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Mother and daughter bonding while baking a pie in a cozy home kitchen setting.",
    credit: "Maksim Goncharenok",
  },
  stomach: {
    url: "https://images.pexels.com/photos/11773868/pexels-photo-11773868.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up image of a man holding his bloated belly while wearing a red shirt.",
    credit: "Towfiqu barbhuiya",
  },
  stopping: {
    url: "https://images.pexels.com/photos/9696272/pexels-photo-9696272.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A worn 'STOP' sign placed on a cracked concrete pavement next to a yellow curb.",
    credit: "Francesco Ungaro",
  },
  storm: {
    url: "https://images.pexels.com/photos/37136429/pexels-photo-37136429.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A city skyline under a dramatic stormy sky with a vibrant sunset provides a powerful contrast.",
    credit: "TUAN PHAN",
  },
  straight: {
    url: "https://images.pexels.com/photos/6144284/pexels-photo-6144284.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Studio portrait of an Asian woman combing her straight black hair indoors with a white background.",
    credit: "cottonbro studio",
  },
  student: {
    url: "https://images.pexels.com/photos/31155018/pexels-photo-31155018.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of children taking a test with focus and concentration in a classroom setting.",
    credit: "This And No Internet 25",
  },
  study: {
    url: "https://images.pexels.com/photos/9159076/pexels-photo-9159076.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Students focused on laptops and notes in a bright classroom setting.",
    credit: "Mikhail Nilov",
  },
  suddenly: {
    url: "https://images.pexels.com/photos/13834312/pexels-photo-13834312.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A luxurious glass perfume bottle casting a dramatic shadow on a surface.",
    credit: "Hilal İlhan",
  },
  sum: {
    url: "https://images.pexels.com/photos/5877591/pexels-photo-5877591.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hands using a calculator and writing equations on a notebook, perfect for math concepts.",
    credit: "https://kaboompics.com/",
  },
  sun: {
    url: "https://images.pexels.com/photos/239861/pexels-photo-239861.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Captivating sun rays passing through trees creating a natural sunburst effect.",
    credit: "Erkan  Utu",
  },
  sunday: {
    url: "https://images.pexels.com/photos/39288006/pexels-photo-39288006.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letter blocks spelling 'Sunday' against fabric surface.",
    credit: "Ann H",
  },
  sunny: {
    url: "https://images.pexels.com/photos/16769502/pexels-photo-16769502.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Woman in a bikini poses on the beach at sunset, creating a warm and serene scene.",
    credit: "VANNGO Ng",
  },
  tax: {
    url: "https://images.pexels.com/photos/6963053/pexels-photo-6963053.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two people working together on tax forms using a calculator at a wooden desk.",
    credit: "Mikhail Nilov",
  },
  thick: {
    url: "https://images.pexels.com/photos/5317761/pexels-photo-5317761.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Crop anonymous plus size female in underwear relaxing on floor in studio on white background",
    credit: "Roberto Hund",
  },
  thin: {
    url: "https://images.pexels.com/photos/7558818/pexels-photo-7558818.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of an adult woman having her body fat measured with a caliper in a studio.",
    credit: "Daniel Dan",
  },
  three: {
    url: "https://images.pexels.com/photos/8533639/pexels-photo-8533639.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a textured running track with the number three, showcasing sport simplicity and earthy tones.",
    credit: "KoolShooters",
  },
  throw: {
    url: "https://images.pexels.com/photos/37600225/pexels-photo-37600225.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A young athlete prepares to throw a javelin outdoors on a sunny day, capturing the essence of competitive sports.",
    credit: "Bohdan Hyrovych",
  },
  thunder: {
    url: "https://images.pexels.com/photos/38117244/pexels-photo-38117244.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A powerful thunderstorm with vivid lightning strikes over a rural landscape at twilight, capturing the intensity of nature.",
    credit: "Guillaume Boulanger",
  },
  tidy: {
    url: "https://images.pexels.com/photos/7513100/pexels-photo-7513100.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A woman cleans shelves in a stylish living room with mirrors and decor.",
    credit: "SHVETS production",
  },
  time: {
    url: "https://images.pexels.com/photos/8573370/pexels-photo-8573370.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist hourglass filled with sand symbolizing time and patience, against a soft background.",
    credit: "Towfiqu barbhuiya",
  },
  tiny: {
    url: "https://images.pexels.com/photos/33629326/pexels-photo-33629326.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Cute long-haired Chihuahua puppy sitting on a soft backdrop. Perfect for pet lovers and dog enthusiasts.",
    credit: "Clarissa   Roley",
  },
  towering: {
    url: "https://images.pexels.com/photos/32752442/pexels-photo-32752442.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Impressive concrete water tower photographed from below with a bright blue sky backdrop.",
    credit: "Volker Braun",
  },
  travels: {
    url: "https://images.pexels.com/photos/2253445/pexels-photo-2253445.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "View of a sunset through an airplane wing window, flying over the sea.",
    credit: "Jeffrey Czum",
  },
  triangle: {
    url: "https://images.pexels.com/photos/7901490/pexels-photo-7901490.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A detailed view of a hand with a triangle tattoo holding delicate dried plant stems.",
    credit: "Joyal Thomas",
  },
  tuesday: {
    url: "https://images.pexels.com/photos/33094403/pexels-photo-33094403.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden blocks arranged to spell 'Tuesday' on a beige background.",
    credit: "Ann H",
  },
  twenty: {
    url: "https://images.pexels.com/photos/4040343/pexels-photo-4040343.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a vintage orange vehicle door featuring a bold number 20 in a circle.",
    credit: "Markus Spiske",
  },
  twentyone: {
    url: "https://images.pexels.com/photos/4147205/pexels-photo-4147205.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Symmetrical red building facade with minimalist design featuring two glass doors and circular lamps.",
    credit: "Morgan Sides",
  },
  underground: {
    url: "https://images.pexels.com/photos/10016029/pexels-photo-10016029.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An off-road vehicle with headlights on in a dark underground tunnel in BC, Canada.",
    credit: "Rhys Abel",
  },
  usually: {
    url: "https://images.pexels.com/photos/7353279/pexels-photo-7353279.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A piece of paper with handwritten text 'udas' partially engulfed in flames.",
    credit: "Amy Pointer",
  },
  vegetables: {
    url: "https://images.pexels.com/photos/5425794/pexels-photo-5425794.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A top-down view of a basket filled with fresh vegetables and produce, placed on a wooden table.",
    credit: "Nataliya Vaitkevich",
  },
  waiting: {
    url: "https://images.pexels.com/photos/28377781/pexels-photo-28377781.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "People waiting at a bus stop on a bustling city street during the day.",
    credit: "Selim Karadayı",
  },
  waitress: {
    url: "https://images.pexels.com/photos/36766731/pexels-photo-36766731.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Friendly waitress holding a notepad, ready to take orders in a modern cafe setting.",
    credit: "Vitaly Gariev",
  },
  wake: {
    url: "https://images.pexels.com/photos/9953382/pexels-photo-9953382.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Capturing the powerful splash of water on a serene lake, surrounded by lush trees.",
    credit: "Ron Lach",
  },
  wakes: {
    url: "https://images.pexels.com/photos/9953382/pexels-photo-9953382.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Capturing the powerful splash of water on a serene lake, surrounded by lush trees.",
    credit: "Ron Lach",
  },
  walk: {
    url: "https://images.pexels.com/photos/29698865/pexels-photo-29698865.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two people walking on a scenic pathway in Woodstock, UK, surrounded by lush greenery on a bright summer day.",
    credit: "Clément Proust",
  },
  wallet: {
    url: "https://images.pexels.com/photos/7952556/pexels-photo-7952556.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of assorted leather wallets and cardholders on a modern violet and green background.",
    credit: "Rann Vijay",
  },
  wash: {
    url: "https://images.pexels.com/photos/5198870/pexels-photo-5198870.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Side view of crop unrecognizable ethnic person in colorful apparel washing hands with soap in sink",
    credit: "Omotayo Tajudeen",
  },
  washes: {
    url: "https://images.pexels.com/photos/4870724/pexels-photo-4870724.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of soap suds on a black car door during a wash, highlighting automotive care.",
    credit: "https://kaboompics.com/",
  },
  water: {
    url: "https://images.pexels.com/photos/27597007/pexels-photo-27597007.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene aerial shot capturing the tranquil turquoise waters of a lake under the sunlight.",
    credit: "Francesco Ungaro",
  },
  weak: {
    url: "https://images.pexels.com/photos/3769746/pexels-photo-3769746.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A bearded man wearing glasses looks down, expressing sadness against a gray background.",
    credit: "Andrea Piacquadio",
  },
  weather: {
    url: "https://images.pexels.com/photos/19825643/pexels-photo-19825643.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Raindrops scattered on a window pane with a soft, cloudy sky in the background, creating a moody atmosphere.",
    credit: "Michaela St",
  },
  wednesday: {
    url: "https://images.pexels.com/photos/3944483/pexels-photo-3944483.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Aesthetic flatlay featuring dried grasses on woolen blankets with a text card reading 'Wednesday'.",
    credit: "cottonbro studio",
  },
  week: {
    url: "https://images.pexels.com/photos/19825316/pexels-photo-19825316.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letter tiles arranged to spell 'week' on a wooden background.",
    credit: "Markus Winkler",
  },
  weekend: {
    url: "https://images.pexels.com/photos/14399/pexels-photo-14399.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene picnic setup with a book, sunglasses, and an apple on a plaid blanket.",
    credit: "Valeria Boltneva",
  },
  widow: {
    url: "https://images.pexels.com/photos/7317728/pexels-photo-7317728.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A grieving woman wipes tears during a heartfelt funeral ceremony in a somber indoor setting.",
    credit: "Pavel Danilyuk",
  },
  wife: {
    url: "https://images.pexels.com/photos/12415621/pexels-photo-12415621.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A happily married couple shares a joyful moment at a colorful Indian wedding ceremony.",
    credit: "Radhika Sharma",
  },
  wind: {
    url: "https://images.pexels.com/photos/14462069/pexels-photo-14462069.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Gloomy silhouette of windswept trees against a twilight sky by the sea in Kretek, Indonesia.",
    credit: "Fajak Studio",
  },
  windy: {
    url: "https://images.pexels.com/photos/36864975/pexels-photo-36864975.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Tall palm tree swaying in the breeze under a blue sky with scattered clouds.",
    credit: "Enzo Cetrangolo",
  },
  withdraw: {
    url: "https://images.pexels.com/photos/5849549/pexels-photo-5849549.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Decorative cardboard illustration of hand of person withdrawing pile of dollar banknotes from automated teller machine",
    credit: "Monstera Production",
  },
  wives: {
    url: "https://images.pexels.com/photos/8790749/pexels-photo-8790749.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Three senior women in elegant attire enjoying a sunny outdoor wedding in Portugal surrounded by nature.",
    credit: "Kampus Production",
  },
  women: {
    url: "https://images.pexels.com/photos/4834133/pexels-photo-4834133.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of women joyfully dancing in a park on a summer day, exuding happiness.",
    credit: "Elina Fairytale",
  },
  works: {
    url: "https://images.pexels.com/photos/18833779/pexels-photo-18833779.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant multicolored background featuring the text 'PORTFOLIO' in pink font on colorful paper.",
    credit: "Ann H",
  },
  wouldnt: {
    url: "https://images.pexels.com/photos/5807320/pexels-photo-5807320.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black graffiti reading 'Why Not?' on a rough wall texture, inspiring curiosity.",
    credit: "Markus Winkler",
  },
  write: {
    url: "https://images.pexels.com/photos/921716/pexels-photo-921716.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A spiral notebook with a pen placed on a heart-shaped box, symbolizing love and writing.",
    credit: "Samer Daboul",
  },
  wrong: {
    url: "https://images.pexels.com/photos/4623522/pexels-photo-4623522.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Five young adults working together on a project, looking concerned and focused at a computer screen.",
    credit: "Ketut Subiyanto",
  },
  year: {
    url: "https://images.pexels.com/photos/6224827/pexels-photo-6224827.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Happy couple celebrating New Year's Eve with cupcakes and 2021 candles.",
    credit: "RDNE Stock project",
  },
  young: {
    url: "https://images.pexels.com/photos/37861762/pexels-photo-37861762.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up portrait of a child wearing a striped beanie in Quito, capturing an emotional gaze.",
    credit: "DΛVΞ GΛRCIΛ",
  },
};
