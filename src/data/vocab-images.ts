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
  "a break": {
    url: "https://images.pexels.com/photos/8386568/pexels-photo-8386568.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Blue sticky notes on a wall with handwritten motivational message 'Take a Break'.",
    credit: "Tara Winstead",
  },
  "a chance": {
    url: "https://images.pexels.com/photos/7594376/pexels-photo-7594376.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A hand holding poker chips on a roulette table, showcasing gambling and casino gaming.",
    credit: "Pavel Danilyuk",
  },
  "a conversation": {
    url: "https://images.pexels.com/photos/10029802/pexels-photo-10029802.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women gesturing and communicating with sign language at a brightly lit table indoors.",
    credit: "RDNE Stock project",
  },
  "a decision": {
    url: "https://images.pexels.com/photos/31999629/pexels-photo-31999629.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters on marble background spell 'YES OR NO' symbolizing choices.",
    credit: "Ann H",
  },
  "a difference": {
    url: "https://images.pexels.com/photos/539/man-person-legs-grass.jpg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person wearing mismatched shoes stands on green grass, highlighting differences and individuality.",
    credit: "Gratisography",
  },
  "a favour": {
    url: "https://images.pexels.com/photos/26576975/pexels-photo-26576975.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist design showcasing Favour Media logo on folded textured paper with copyspace.",
    credit: "Solomon Essien",
  },
  "a hidden benefit": {
    url: "https://images.pexels.com/photos/39415803/pexels-photo-39415803.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Gold Bitcoin on stock market graph background with puzzle pieces, symbolizing financial strategy.",
    credit: "Rafael Minguet Delgado",
  },
  "a look": {
    url: "https://images.pexels.com/photos/20543944/pexels-photo-20543944.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A detailed close-up of a brown eye showing a reflection, focused on lashes.",
    credit: "Orhan Pergel",
  },
  "a mistake": {
    url: "https://images.pexels.com/photos/8363153/pexels-photo-8363153.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright square and speech bubble sign with motivational quotes about mistakes and learning.",
    credit: "RDNE Stock project",
  },
  "a new language": {
    url: "https://images.pexels.com/photos/29556472/pexels-photo-29556472.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A flat lay of Arabic newspapers in Fès, Morocco, showcasing diverse articles.",
    credit: "Moussa Idrissi",
  },
  "a past habit": {
    url: "https://images.pexels.com/photos/38484624/pexels-photo-38484624.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A smoldering cigarette butt resting in an ashtray surrounded by smoke and ash.",
    credit: "Alexas Fotos",
  },
  "a reasoned opinion": {
    url: "https://images.pexels.com/photos/20021278/pexels-photo-20021278.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letter tiles on a table spelling 'Talk', ideal for language and communication themes.",
    credit: "Markus Winkler",
  },
  "a risk": {
    url: "https://images.pexels.com/photos/187333/pexels-photo-187333.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant red dice stacked with poker chips, ideal for gambling themes.",
    credit: "Sascha Düser",
  },
  accept: {
    url: "https://images.pexels.com/photos/7723792/pexels-photo-7723792.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of an acceptance letter with a pen and planner on a white surface.",
    credit: "Tara Winstead",
  },
  "accept enthusiastically": {
    url: "https://images.pexels.com/photos/7723792/pexels-photo-7723792.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of an acceptance letter with a pen and planner on a white surface.",
    credit: "Tara Winstead",
  },
  "accept something unpleasant": {
    url: "https://pixabay.com/get/g6334fc35c516c6f145113ebf919059c4670529d6fd03fd32d85982437f5836de6571ea6ae046db2a8abb9e4dd51fdfa2a1cd2f7108d55839185bcc2c3472e884_640.jpg",
    alt: "i accept, yes, alliances, married, marriage, casal, accept it, to confirm, symbol, love",
    credit: "dbkatayama",
  },
  account: {
    url: "https://images.pexels.com/photos/164686/pexels-photo-164686.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a vintage handwritten ledger detailing financial records and accounts.",
    credit: "Pixabay",
  },
  "account for": {
    url: "https://images.pexels.com/photos/164686/pexels-photo-164686.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a vintage handwritten ledger detailing financial records and accounts.",
    credit: "Pixabay",
  },
  acerbic: {
    url: "https://images.pexels.com/photos/13534603/pexels-photo-13534603.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed image of oblong tablets from a container, showcasing their texture and color.",
    credit: "Odin Mcraig",
  },
  achievement: {
    url: "https://images.pexels.com/photos/33802245/pexels-photo-33802245.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters spelling 'ACHIEVE' on a textured brown surface, conveying motivation and success.",
    credit: "Ann H",
  },
  acknowledges: {
    url: "https://images.pexels.com/photos/8250916/pexels-photo-8250916.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A minimalist thank you card with a ring binder on white background for gratitude messages.",
    credit: "PNW Production",
  },
  acoustics: {
    url: "https://images.pexels.com/photos/33596987/pexels-photo-33596987.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elegant concert hall interior with empty seats and stage, ready for performance.",
    credit: "Noura Zaher",
  },
  across: {
    url: "https://pixabay.com/get/g074872c811fb3da11fcd32318954941661254a52d6320d05ed11a680c1cbe1bb8553ca9b2ebf92e2b2555eb46b4f902a651ab466c2893e65e17a59468bd57201_640.jpg",
    alt: "reed, sunrise, across, landscape, atmospheric, morgenstimmung, morning, frozen, nature",
    credit: "FotoRieth",
  },
  "act too soon": {
    url: "https://images.pexels.com/photos/6896223/pexels-photo-6896223.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Actors in a dramatic rehearsal on a theater stage, showcasing emotion and performance.",
    credit: "cottonbro studio",
  },
  action: {
    url: "https://images.pexels.com/photos/5104548/pexels-photo-5104548.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Full body of faceless male in outerwear jumping on high hill slope against foggy highlands with trees at daylight",
    credit: "Trung Nguyen",
  },
  adapted: {
    url: "https://images.pexels.com/photos/6763809/pexels-photo-6763809.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a wheelchair and prosthetic leg on a basketball court emphasizing adaptive sports.",
    credit: "Kampus Production",
  },
  address: {
    url: "https://images.pexels.com/photos/9459189/pexels-photo-9459189.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of an old house number plate reading 140½ with a black decorative element.",
    credit: "Erik Mclean",
  },
  addressed: {
    url: "https://images.pexels.com/photos/7462692/pexels-photo-7462692.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Macro shot of a Royal Mail stamp on a document highlighting postal delivery.",
    credit: "Brett Jordan",
  },
  addresses: {
    url: "https://images.pexels.com/photos/31045814/pexels-photo-31045814.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Blue street sign on a rustic stone wall in Talas, Kayseri, Turkey.",
    credit: "Nezaket",
  },
  admitted: {
    url: "https://images.pexels.com/photos/37795323/pexels-photo-37795323.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "University student wearing a red cap studying in an empty classroom in Buenos Aires.",
    credit: "Eduard Perez",
  },
  admittedly: {
    url: "https://images.pexels.com/photos/19853752/pexels-photo-19853752.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person in casual wear relaxes on a beach with a comic book over their face.",
    credit: "lance he",
  },
  adopted: {
    url: "https://images.pexels.com/photos/16652369/pexels-photo-16652369.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A friendly dog wearing an 'Adopt Me' bandana at a park, seeking a new home.",
    credit: "Matheus Bertelli",
  },
  advantage: {
    url: "https://images.pexels.com/photos/38748838/pexels-photo-38748838.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters spelling 'Value Creation' on dark marble background, perfect for business themes.",
    credit: "Ann H",
  },
  advice: {
    url: "https://images.pexels.com/photos/8962677/pexels-photo-8962677.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A young couple consults with a real estate agent about documents inside an apartment.",
    credit: "Ivan S",
  },
  advisable: {
    url: "https://images.pexels.com/photos/5697261/pexels-photo-5697261.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Inspirational word 'Advice' written in white chalk on blackboard.",
    credit: "Anna Tarazevich",
  },
  affect: {
    url: "https://images.pexels.com/photos/32240613/pexels-photo-32240613.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters spelling 'IMPACT' against a textured pink watercolor backdrop, symbolizing influence and change.",
    credit: "Ann H",
  },
  agree: {
    url: "https://images.pexels.com/photos/5439046/pexels-photo-5439046.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Unrecognizable cheerful colleagues in formal clothes showing thumbs up gesture while standing in modern office during teamwork on blurred background",
    credit: "Atlantic Ambience",
  },
  agreement: {
    url: "https://images.pexels.com/photos/4963359/pexels-photo-4963359.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of two businessmen shaking hands outside, symbolizing partnership and agreement.",
    credit: "Ketut Subiyanto",
  },
  air: {
    url: "https://images.pexels.com/photos/38809875/pexels-photo-38809875.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Passenger airplane in mid-air with landing gear extended against a vibrant blue sky.",
    credit: "ZhiCheng Zhang",
  },
  airmail: {
    url: "https://images.pexels.com/photos/2635829/pexels-photo-2635829.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Airmail envelope with red and blue stripes, perfect for postal themes or stationery mockups.",
    credit: "Ann H",
  },
  albeit: {
    url: "https://images.pexels.com/photos/37401983/pexels-photo-37401983.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Artistic flat lay of colorful craft supplies with thank you cards on a black marble surface.",
    credit: "Seljan  Salimova",
  },
  alcohol: {
    url: "https://images.pexels.com/photos/17893132/pexels-photo-17893132.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A bartender mixes drinks with fresh ingredients and juice indoors, showcasing beverage preparation.",
    credit: "ulrich Keutchatang",
  },
  "all the same": {
    url: "https://images.pexels.com/photos/4707126/pexels-photo-4707126.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Top view of black signboard with phrase We All Bleed Same Color on surface on black background",
    credit: "Brett Sayles",
  },
  allergic: {
    url: "https://images.pexels.com/photos/29702937/pexels-photo-29702937.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of an adult using an inhaler for asthma management.",
    credit: "Cnordic Nordic",
  },
  allowance: {
    url: "https://images.pexels.com/photos/4968398/pexels-photo-4968398.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hands exchanging a 50 Polish zloty note, highlighting financial transaction.",
    credit: "https://kaboompics.com/",
  },
  along: {
    url: "https://images.pexels.com/photos/21316043/pexels-photo-21316043.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A lone person walking down a peaceful forest path surrounded by autumn trees in sepia tones.",
    credit: "Budget Bizar",
  },
  alongside: {
    url: "https://images.pexels.com/photos/28540959/pexels-photo-28540959.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white photo of a narrow alleyway in Amsterdam showcasing traditional architecture.",
    credit: "Eqlixir Photos",
  },
  although: {
    url: "https://images.pexels.com/photos/38459013/pexels-photo-38459013.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letter tiles spelling 'Almost There' on a wooden grid, conveying progress and motivation.",
    credit: "Ann H",
  },
  among: {
    url: "https://images.pexels.com/photos/36815932/pexels-photo-36815932.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of a lush green pine tree branch with sharp needles in a forest setting.",
    credit: "Reinis Brūzītis",
  },
  "an argument": {
    url: "https://images.pexels.com/photos/5711598/pexels-photo-5711598.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A couple arguing passionately in their living room, expressing emotions and gestures.",
    credit: "Diva Plavalaguna",
  },
  "an effort": {
    url: "https://images.pexels.com/photos/8363571/pexels-photo-8363571.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of motivational speech bubbles on a brown background inspiring perseverance.",
    credit: "RDNE Stock project",
  },
  "an impact": {
    url: "https://images.pexels.com/photos/32240613/pexels-photo-32240613.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters spelling 'IMPACT' against a textured pink watercolor backdrop, symbolizing influence and change.",
    credit: "Ann H",
  },
  "an impression": {
    url: "https://images.pexels.com/photos/6290133/pexels-photo-6290133.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful abstract artwork showcasing layers of mixed media with striking textures.",
    credit: "Steve A Johnson",
  },
  anaesthesia: {
    url: "https://images.pexels.com/photos/13697927/pexels-photo-13697927.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of surgeons operates in a hospital's sterile environment, focusing on a complex procedure.",
    credit: "Jonathan Borba",
  },
  analysed: {
    url: "https://images.pexels.com/photos/8460377/pexels-photo-8460377.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two healthcare professionals in scrubs examining a medical x-ray image, discussing diagnosis.",
    credit: "Los Muertos Crew",
  },
  analysis: {
    url: "https://images.pexels.com/photos/16960261/pexels-photo-16960261.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a scientist handling a beaker with precision in a laboratory setting.",
    credit: "Carla Rubi Valda Trujillo",
  },
  analysts: {
    url: "https://images.pexels.com/photos/7876668/pexels-photo-7876668.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Business professionals discussing financial graphs on a flipchart during a daylight meeting.",
    credit: "https://kaboompics.com/",
  },
  ancient: {
    url: "https://images.pexels.com/photos/30910182/pexels-photo-30910182.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of ancient stone columns and arches in Athens, showcasing Greek architecture.",
    credit: "Efrem  Efre",
  },
  anger: {
    url: "https://images.pexels.com/photos/7927530/pexels-photo-7927530.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An adult man expressing frustration while sitting in front of a laptop in an indoor setting.",
    credit: "Nicola Barts",
  },
  ankle: {
    url: "https://images.pexels.com/photos/4015742/pexels-photo-4015742.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of feet wading through gentle waves along a sunny beach shoreline.",
    credit: "Michael Dupuis",
  },
  "anticipate happily": {
    url: "https://images.pexels.com/photos/39392821/pexels-photo-39392821.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A family moment captured with baby shoes held by parents at an Italian beach.",
    credit: "Stefan Daniel Vacarescu",
  },
  anxiety: {
    url: "https://images.pexels.com/photos/8458813/pexels-photo-8458813.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A woman metaphorically trapped in a spider web depicting anxiety and entrapment.",
    credit: "MART  PRODUCTION",
  },
  apology: {
    url: "https://images.pexels.com/photos/6633006/pexels-photo-6633006.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A flat lay of a 'Sorry Not Sorry' card with an envelope on a wooden surface.",
    credit: "Cup of  Couple",
  },
  "appear to": {
    url: "https://images.pexels.com/photos/36698389/pexels-photo-36698389.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Smiling businessman in a suit taking a selfie outdoors against modern architecture.",
    credit: "Vitaly Gariev",
  },
  appears: {
    url: "https://images.pexels.com/photos/6270283/pexels-photo-6270283.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Alluring female with dark hair in stylish outfit with bare back leaning on leather sofa in dark room",
    credit: "Inna Mykytas",
  },
  application: {
    url: "https://images.pexels.com/photos/8441786/pexels-photo-8441786.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a business professional reviewing an application form at a desk.",
    credit: "Kampus Production",
  },
  apply: {
    url: "https://images.pexels.com/photos/8441817/pexels-photo-8441817.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a hand signing insurance documents in an office setting.",
    credit: "Kampus Production",
  },
  approach: {
    url: "https://images.pexels.com/photos/7688440/pexels-photo-7688440.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of marketing strategy notes and colorful trends sheet on a table for planning session.",
    credit: "Kindel Media",
  },
  approved: {
    url: "https://images.pexels.com/photos/8850721/pexels-photo-8850721.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a red check mark on a crisp white paper with black boxes, symbolizing completion.",
    credit: "Tara Winstead",
  },
  approximate: {
    url: "https://images.pexels.com/photos/13335164/pexels-photo-13335164.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two men leaning on a railing, enjoying a scenic urban riverside view.",
    credit: "Mizuno K",
  },
  area: {
    url: "https://images.pexels.com/photos/19061849/pexels-photo-19061849.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Aerial cityscape of Alba, Italy showcasing overpasses, roads, and railway tracks.",
    credit: "K",
  },
  "aren't": {
    url: "https://images.pexels.com/photos/39376186/pexels-photo-39376186.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Daylight view of historic European architecture with street signs and rooftop details.",
    credit: "Naz Kurtuluş",
  },
  arguably: {
    url: "https://images.pexels.com/photos/8780508/pexels-photo-8780508.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A couple engaged in a heated argument at home, expressing strong emotions.",
    credit: "Afif Ramdhasuma",
  },
  arguing: {
    url: "https://images.pexels.com/photos/6532738/pexels-photo-6532738.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "From below of ethnic female with short curly hair standing and arguing with boyfriend on street in daylight",
    credit: "Budgeron Bach",
  },
  argument: {
    url: "https://images.pexels.com/photos/7640807/pexels-photo-7640807.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A stressed woman in an office surrounded by arguing coworkers highlighting workplace tension.",
    credit: "Yan Krukau",
  },
  arm: {
    url: "https://images.pexels.com/photos/8187679/pexels-photo-8187679.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A tattooed man with short hair stretches his arms in a grayscale studio shoot.",
    credit: "Daria Liudnaya",
  },
  around: {
    url: "https://images.pexels.com/photos/7181492/pexels-photo-7181492.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Top view of a spiral parking ramp in Jakarta, Indonesia, showcasing steel and concrete design.",
    credit: "Tom Fisk",
  },
  arrange: {
    url: "https://images.pexels.com/photos/5410122/pexels-photo-5410122.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Side view of happy female in apron arranging flowers while working in cozy floral shop",
    credit: "Amina Filkins",
  },
  arrangements: {
    url: "https://images.pexels.com/photos/32763241/pexels-photo-32763241.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A stunning floral chandelier decor with roses and crystals under elegant ceiling lights, perfect for weddings.",
    credit: "Miff Ibra",
  },
  arrested: {
    url: "https://images.pexels.com/photos/7785088/pexels-photo-7785088.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Police officer handcuffing a suspect during an arrest against an urban backdrop.",
    credit: "Kindel Media",
  },
  arrive: {
    url: "https://images.pexels.com/photos/1719490/pexels-photo-1719490.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright arrivals sign with airplane symbol in an airport terminal.",
    credit: "Harm Jakob Tolsma",
  },
  arrived: {
    url: "https://images.pexels.com/photos/32418439/pexels-photo-32418439.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white photo of an airport arrivals sign in Buenos Aires, Argentina.",
    credit: "Alex Dos Santos",
  },
  arrives: {
    url: "https://images.pexels.com/photos/1719490/pexels-photo-1719490.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Bright arrivals sign with airplane symbol in an airport terminal.",
    credit: "Harm Jakob Tolsma",
  },
  artistic: {
    url: "https://images.pexels.com/photos/31052377/pexels-photo-31052377.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a colorful artist's palette with various paint blobs and textures.",
    credit: "Huy Nguyễn",
  },
  artists: {
    url: "https://images.pexels.com/photos/8382693/pexels-photo-8382693.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An eye peers through a vibrant artist's palette, symbolizing creativity and art exploration.",
    credit: "Pavel Danilyuk",
  },
  "as yet": {
    url: "https://images.pexels.com/photos/5699727/pexels-photo-5699727.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Young black couple in casual outfit sitting on bed with sad face and thinking at home",
    credit: "Alex Green",
  },
  ask: {
    url: "https://images.pexels.com/photos/4646079/pexels-photo-4646079.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A loving couple shares an intimate moment outdoors near ancient ruins, illustrating romance and connection.",
    credit: "ArtHouse Studio",
  },
  assert: {
    url: "https://images.pexels.com/photos/7640491/pexels-photo-7640491.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Adult man confidently standing as multiple fingers point at him, conveying defiance and confrontation.",
    credit: "Yan Krukau",
  },
  assist: {
    url: "https://images.pexels.com/photos/8415896/pexels-photo-8415896.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person in a wheelchair playing basketball with a friend outdoors on a court.",
    credit: "SHVETS production",
  },
  "assume control": {
    url: "https://images.pexels.com/photos/7047617/pexels-photo-7047617.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Conceptual image of hands in chains holding a game controller symbolizing gaming addiction.",
    credit: "Tima Miroshnichenko",
  },
  assumption: {
    url: "https://images.pexels.com/photos/16449839/pexels-photo-16449839.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Ornate and detailed statue of Virgin Mary inside Gozo's Cathedral, showcasing religious artistry.",
    credit: "Sybe's Search",
  },
  "at best": {
    url: "https://images.pexels.com/photos/5748508/pexels-photo-5748508.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A captivating red neon sign illuminating a building facade at night, creating a vibrant and moody atmosphere.",
    credit: "Maksim Goncharenok",
  },
  atm: {
    url: "https://images.pexels.com/photos/6132753/pexels-photo-6132753.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person using a CoinCloud Bitcoin ATM to insert cash for cryptocurrency transactions.",
    credit: "Elise",
  },
  attention: {
    url: "https://images.pexels.com/photos/31464027/pexels-photo-31464027.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Engaged group of children in a thoughtful moment captured in black and white.",
    credit: "Chris John",
  },
  attraction: {
    url: "https://images.pexels.com/photos/29410928/pexels-photo-29410928.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful carousel swing ride outdoors with joyful riders at a carnival park.",
    credit: "Zaur Hajizada",
  },
  attribute: {
    url: "https://images.pexels.com/photos/270488/pexels-photo-270488.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of HTML code lines highlighting web development concepts and techniques.",
    credit: "Pixabay",
  },
  audacious: {
    url: "https://images.pexels.com/photos/27658411/pexels-photo-27658411.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of young adults posing in a stylish and moody indoor setting with dark tones and vintage accents.",
    credit: "Wolrider YURTSEVEN",
  },
  "avoid doing work": {
    url: "https://images.pexels.com/photos/8296036/pexels-photo-8296036.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A 'Do Not Disturb' sign above a black keyboard on a brown surface, creating an office atmosphere.",
    credit: "Nothing Ahead",
  },
  awards: {
    url: "https://images.pexels.com/photos/10435675/pexels-photo-10435675.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Golden trophy with ribbons and medals on a checkered table, symbolizing victory and achievement.",
    credit: "Josiah Matthew",
  },
  awareness: {
    url: "https://images.pexels.com/photos/7005410/pexels-photo-7005410.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Be Aware wording on brown textured perforated surface, offering copyspace.",
    credit: "Vie Studio",
  },
  back: {
    url: "https://images.pexels.com/photos/36813305/pexels-photo-36813305.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A motorcyclist wearing a helmet and gloves enjoys the tranquility of a forest environment.",
    credit: "Nandish Kumar",
  },
  "bag for life": {
    url: "https://images.pexels.com/photos/914930/pexels-photo-914930.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A fashionable woman with shopping bags in a charming urban street alleyway lined with shops.",
    credit: "Andrea Piacquadio",
  },
  bail: {
    url: "https://images.pexels.com/photos/6065141/pexels-photo-6065141.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A tense interrogation scene in a prison room with officials and a prisoner.",
    credit: "RDNE Stock project",
  },
  balanced: {
    url: "https://images.pexels.com/photos/13231553/pexels-photo-13231553.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Serene stone stack by the seaside, evoking tranquility and balance.",
    credit: "Mohan Nannapaneni",
  },
  bank: {
    url: "https://images.pexels.com/photos/11284045/pexels-photo-11284045.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man wearing a mask using an ATM machine outdoors for cash withdrawal.",
    credit: "Centre for Ageing Better",
  },
  bargain: {
    url: "https://images.pexels.com/photos/39457826/pexels-photo-39457826.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elderly man browsing at a bustling street market stall with various tools and goods displayed.",
    credit: "Ahe -",
  },
  basket: {
    url: "https://images.pexels.com/photos/15222236/pexels-photo-15222236.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A colorful assortment of fresh fruits on display in a market, showcasing abundance and variety.",
    credit: "Artem Zhukov",
  },
  battery: {
    url: "https://images.pexels.com/photos/7019805/pexels-photo-7019805.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Top view of two AA batteries with yellow tops on a dark surface.",
    credit: "Simon Gough",
  },
  "be exactly right": {
    url: "https://images.pexels.com/photos/4570696/pexels-photo-4570696.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Crop anonymous activist demonstrating placard with racism is taught text while protesting for Black Lives Matter movement in evening",
    credit: "K",
  },
  "be sceptical": {
    url: "https://images.pexels.com/photos/8727519/pexels-photo-8727519.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Portrait of a skeptical man with red hair and freckles, showcasing a doubtful expression.",
    credit: "Tima Miroshnichenko",
  },
  "be very expensive": {
    url: "https://images.pexels.com/photos/4475468/pexels-photo-4475468.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of an adult counting dollar bills at a desk with a notebook.",
    credit: "https://kaboompics.com/",
  },
  beat: {
    url: "https://images.pexels.com/photos/15786284/pexels-photo-15786284.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a classic Roland TR-909 drum machine in a studio setting.",
    credit: "Giuseppe  Di Maria",
  },
  began: {
    url: "https://images.pexels.com/photos/8895358/pexels-photo-8895358.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of a classic vintage Kodak camera held in a gentle hand, evoking nostalgia.",
    credit: "Mario Amé",
  },
  behaviour: {
    url: "https://images.pexels.com/photos/14571360/pexels-photo-14571360.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Young boy poses with arms crossed, wearing a gray sweater against a white backdrop.",
    credit: "Vika Glitter",
  },
  belabour: {
    url: "https://images.pexels.com/photos/2525714/pexels-photo-2525714.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Impressive French chateau surrounded by lush greenery under a moody, cloudy sky.",
    credit: "Bruce Reyes-Chow",
  },
  belief: {
    url: "https://images.pexels.com/photos/32368861/pexels-photo-32368861.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Inspirational word 'Believe' crafted on a textured pink watercolor background. Ideal for motivation.",
    credit: "Ann H",
  },
  bell: {
    url: "https://images.pexels.com/photos/15835089/pexels-photo-15835089.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of traditional bronze church bells hanging outdoors in Magharoskari, Georgia.",
    credit: "Genadi Yakovlev",
  },
  beneath: {
    url: "https://images.pexels.com/photos/11576456/pexels-photo-11576456.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Dark and mysterious underwater scene with branches and debris creating an eerie atmosphere.",
    credit: "Alfo Medeiros",
  },
  best: {
    url: "https://images.pexels.com/photos/7005032/pexels-photo-7005032.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Simple white mug with 'BEST DAD' text, perfect for Father's Day gifts.",
    credit: "RDNE Stock project",
  },
  better: {
    url: "https://images.pexels.com/photos/35748827/pexels-photo-35748827.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Rustic wall art with an inspirational message 'NEXT YEAR WAS BETTER' stenciled on a textured surface.",
    credit: "Stephen Leonardi",
  },
  bigger: {
    url: "https://images.pexels.com/photos/5912579/pexels-photo-5912579.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Minimalist image of Scrabble tiles spelling 'BIG' on blue surface.",
    credit: "Tima Miroshnichenko",
  },
  biggest: {
    url: "https://images.pexels.com/photos/2133122/pexels-photo-2133122.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful giant rubber duck sculpture in sunny park, Hồ Chí Minh City.",
    credit: "Quang Nguyen Vinh",
  },
  bike: {
    url: "https://images.pexels.com/photos/37858364/pexels-photo-37858364.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two vintage bicycles parked against a rustic beige wall, creating a nostalgic urban scene.",
    credit: "Sebastian Tyszka",
  },
  binding: {
    url: "https://images.pexels.com/photos/8391471/pexels-photo-8391471.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of antique leather book bindings with ornate texture and golden text.",
    credit: "Mikhail Nilov",
  },
  blackout: {
    url: "https://images.pexels.com/photos/38802712/pexels-photo-38802712.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white photo of a window with blinds, a plant, and a lantern.",
    credit: "Kamil Čičila",
  },
  blizzard: {
    url: "https://images.pexels.com/photos/18199328/pexels-photo-18199328.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Aerial view of Gwangju, South Korea during a heavy winter snowfall.",
    credit: "Asia Culture Center",
  },
  board: {
    url: "https://images.pexels.com/photos/13180520/pexels-photo-13180520.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Aerial shot of neatly arranged surfboards on a sandy beach awaiting surfers.",
    credit: "Lio Voo",
  },
  "board games": {
    url: "https://images.pexels.com/photos/37983582/pexels-photo-37983582.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "High-quality close-up photo of dice on a classic Monopoly board game, highlighting the gaming experience.",
    credit: "Annashoots 📷",
  },
  boils: {
    url: "https://images.pexels.com/photos/36227428/pexels-photo-36227428.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up view of a cracked brown egg boiling in water, showcasing texture and cooking process.",
    credit: "Fino Tereno",
  },
  book: {
    url: "https://images.pexels.com/photos/34260873/pexels-photo-34260873.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Open book with pages forming a heart, symbolizing love for reading and literature.",
    credit: "Veronika Andrews",
  },
  booked: {
    url: "https://images.pexels.com/photos/19248668/pexels-photo-19248668.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Unique architectural structure made entirely of books, showcasing creativity and literature in an urban outdoor location.",
    credit: "Masood Aslami",
  },
  books: {
    url: "https://images.pexels.com/photos/8762862/pexels-photo-8762862.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Hands reaching upwards holding a stack of hardbound books against a plain background.",
    credit: "Alexandra Krainyukhova",
  },
  boredom: {
    url: "https://images.pexels.com/photos/19945280/pexels-photo-19945280.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A young woman in a library naps on an open book with eyes closed, wearing a beret hat.",
    credit: "Vika Glitter",
  },
  bottle: {
    url: "https://images.pexels.com/photos/31699476/pexels-photo-31699476.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Focused view of three clear plastic bottles with green caps outdoors.",
    credit: "Patrick",
  },
  branch: {
    url: "https://images.pexels.com/photos/4185169/pexels-photo-4185169.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Beautiful silhouette of tree branches at sunset with vivid colors in the sky.",
    credit: "Damian Apanasowicz",
  },
  break: {
    url: "https://images.pexels.com/photos/8386568/pexels-photo-8386568.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Blue sticky notes on a wall with handwritten motivational message 'Take a Break'.",
    credit: "Tara Winstead",
  },
  brings: {
    url: "https://images.pexels.com/photos/30542853/pexels-photo-30542853.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Beautiful canal view with historic bridge and colorful buildings in Bruges, Belgium.",
    credit: "Rajkumar Bhandari",
  },
  broadly: {
    url: "https://images.pexels.com/photos/9588216/pexels-photo-9588216.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colleagues discussing blockchain technology with a laptop in a modern office setting.",
    credit: "Morthy Jameson",
  },
  "broadly speaking": {
    url: "https://images.pexels.com/photos/4331578/pexels-photo-4331578.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Closeup of black modern microphone on stand placed in spacious meeting room with chairs",
    credit: "Borta",
  },
  broke: {
    url: "https://images.pexels.com/photos/8515596/pexels-photo-8515596.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hands holding an empty wallet, highlighting financial struggles and economic crisis.",
    credit: "Towfiqu barbhuiya",
  },
  brought: {
    url: "https://images.pexels.com/photos/34136628/pexels-photo-34136628.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A charming red panda playfully climbing bamboo stalks in its natural habitat.",
    credit: "Lukász  Szabó",
  },
  bruise: {
    url: "https://images.pexels.com/photos/6643074/pexels-photo-6643074.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of a bruise on skin showing purplish discoloration and texture.",
    credit: "https://kaboompics.com/",
  },
  budget: {
    url: "https://images.pexels.com/photos/6964105/pexels-photo-6964105.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A couple reviewing household bills and budget using a calculator and laptop at their kitchen table.",
    credit: "Mikhail Nilov",
  },
  build: {
    url: "https://images.pexels.com/photos/15456627/pexels-photo-15456627.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "View of wooden roof trusses during construction with clear blue sky background.",
    credit: "Ulrick Trappschuh",
  },
  bus: {
    url: "https://images.pexels.com/photos/4774659/pexels-photo-4774659.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A busy city street with traffic and a bus showing 'SORRY' on its display under an overpass.",
    credit: "Oliver Boese",
  },
  busier: {
    url: "https://images.pexels.com/photos/22743642/pexels-photo-22743642.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Motion-blurred black and white image of a bustling urban crowd indoors.",
    credit: "İrem Dur",
  },
  busiest: {
    url: "https://images.pexels.com/photos/39468937/pexels-photo-39468937.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "View of the majestic Forbidden City in Beijing under clear blue skies with tourists exploring the historic site.",
    credit: "BI ravencrow",
  },
  business: {
    url: "https://images.pexels.com/photos/13801799/pexels-photo-13801799.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Businessman in a suit using a laptop and smartphone in an urban setting, blending technology with business.",
    credit: "Mizuno K",
  },
  busy: {
    url: "https://images.pexels.com/photos/23224912/pexels-photo-23224912.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A woman multitasking with a phone and laptop while her child plays in the background.",
    credit: "Vitaly Gariev",
  },
  "by the river": {
    url: "https://images.pexels.com/photos/34532669/pexels-photo-34532669.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Beautiful scenic view of River Tummel with lush greenery in Pitlochry, Scotland, perfect for tranquil holidays.",
    credit: "Bob Jenkin",
  },
  cab: {
    url: "https://images.pexels.com/photos/15067166/pexels-photo-15067166.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Classic yellow taxi in New York City street, symbolizing urban transport and life.",
    credit: "Artem Velychko",
  },
  café: {
    url: "https://images.pexels.com/photos/17501702/pexels-photo-17501702.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Cozy outdoor city café bustling with people enjoying leisure time under umbrellas and trees.",
    credit: "Darya Sannikova",
  },
  cakes: {
    url: "https://images.pexels.com/photos/5691261/pexels-photo-5691261.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Stylish yellow birthday cake adorned with macarons and golden accents, perfect for celebrations.",
    credit: "Itay Weissman",
  },
  call: {
    url: "https://images.pexels.com/photos/8526710/pexels-photo-8526710.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a person holding a smartphone, calling a depression hotline.",
    credit: "Ron Lach",
  },
  calorie: {
    url: "https://images.pexels.com/photos/12499380/pexels-photo-12499380.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A wooden table setup with apple slices, a calorie chart, and a glass of water for a healthy diet plan.",
    credit: "Spencer Stone",
  },
  came: {
    url: "https://images.pexels.com/photos/32574417/pexels-photo-32574417.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Security gate with no pedestrian sign and intercom, view from a car window.",
    credit: "Bingqian Li",
  },
  campaign: {
    url: "https://images.pexels.com/photos/34162720/pexels-photo-34162720.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Schoolgirls advocate for period awareness and support in Africa.",
    credit: "Tosin Olowoleni",
  },
  camping: {
    url: "https://images.pexels.com/photos/8985295/pexels-photo-8985295.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A serene campsite with tents in a misty forest clearing in Russia.",
    credit: "Евгения Егорова",
  },
  "can't": {
    url: "https://images.pexels.com/photos/1003103/pexels-photo-1003103.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Tin can resting on a gravel surface near rural railroad tracks under cloudy skies.",
    credit: "Nico Brüggeboes",
  },
  cancel: {
    url: "https://images.pexels.com/photos/18464998/pexels-photo-18464998.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a vintage typewriter with paper reading 'Cancel Culture', signifying social media trends.",
    credit: "Markus Winkler",
  },
  candid: {
    url: "https://images.pexels.com/photos/26056321/pexels-photo-26056321.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "An elegant woman adjusts a dress outdoors while a cameraman films in grayscale.",
    credit: "A  PHOTOGRAPHER एक यात्री",
  },
  capricious: {
    url: "https://images.pexels.com/photos/12273676/pexels-photo-12273676.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed photograph of pink cherry blossoms in full bloom showcasing vibrant colors and delicate petals.",
    credit: "Александр Лич",
  },
  car: {
    url: "https://images.pexels.com/photos/38368169/pexels-photo-38368169.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Aerial view of a yellow car on a road with directional arrows, highlighting urban transport.",
    credit: "wal_ 172619",
  },
  "card games": {
    url: "https://images.pexels.com/photos/269630/pexels-photo-269630.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A vibrant display of casino chips, dice, and playing cards set on a table, embodying chance and excitement.",
    credit: "Pixabay",
  },
  cardio: {
    url: "https://images.pexels.com/photos/6285195/pexels-photo-6285195.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Woman exercising on treadmill in gym promoting healthy lifestyle and fitness.",
    credit: "Gustavo Fring",
  },
  cards: {
    url: "https://images.pexels.com/photos/6940926/pexels-photo-6940926.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Hand selecting cards from deck on glass table reflects playful and recreational theme.",
    credit: "cottonbro studio",
  },
  carriage: {
    url: "https://images.pexels.com/photos/12911166/pexels-photo-12911166.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Beautiful horse-drawn carriages on a historic street in Kraków, Poland, perfect capturing the old town charm.",
    credit: "Janusz Mitura",
  },
  carry: {
    url: "https://images.pexels.com/photos/6969972/pexels-photo-6969972.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Adult holding several paper bags representing delivery service indoors.",
    credit: "Mikhail Nilov",
  },
  cash: {
    url: "https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person wearing denim and a checked shirt holds folded dollar bills in their hand indoors.",
    credit: "Lukas Blazek",
  },
  "cash machine": {
    url: "https://images.pexels.com/photos/6132753/pexels-photo-6132753.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A person using a CoinCloud Bitcoin ATM to insert cash for cryptocurrency transactions.",
    credit: "Elise",
  },
  cashier: {
    url: "https://images.pexels.com/photos/11358072/pexels-photo-11358072.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man in a vintage setting, leaning on a wooden counter beside a cash register in a store.",
    credit: "Mehmet Turgut  Kirkgoz",
  },
  caught: {
    url: "https://images.pexels.com/photos/4830329/pexels-photo-4830329.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A live fish caught on a line breaks the water's surface in a calm lake setting.",
    credit: "cottonbro studio",
  },
  caution: {
    url: "https://images.pexels.com/photos/9696272/pexels-photo-9696272.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A worn 'STOP' sign placed on a cracked concrete pavement next to a yellow curb.",
    credit: "Francesco Ungaro",
  },
  centre: {
    url: "https://images.pexels.com/photos/5547846/pexels-photo-5547846.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A directional sign pointing towards the city centre under a clear blue sky.",
    credit: "Elizabeth Iris",
  },
  challenge: {
    url: "https://images.pexels.com/photos/32255990/pexels-photo-32255990.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Text 'CHALLENGE' in bold on textured pink watercolor background for motivation.",
    credit: "Ann H",
  },
  changed: {
    url: "https://images.pexels.com/photos/39462749/pexels-photo-39462749.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a solitary orange leaf clinging to a bare branch, symbolizing fall.",
    credit: "Сокіл Sokil",
  },
  chatting: {
    url: "https://images.pexels.com/photos/4901947/pexels-photo-4901947.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women enjoying a friendly conversation while sitting in a vibrant waiting area.",
    credit: "Ketut Subiyanto",
  },
  "cheap or stingy": {
    url: "https://images.pexels.com/photos/30893271/pexels-photo-30893271.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful assortment of fruits and vegetables on display at a vibrant market stall.",
    credit: "Matheus Bertelli",
  },
  "check in": {
    url: "https://images.pexels.com/photos/3943950/pexels-photo-3943950.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Passenger using self-service check-in kiosk at airport for convenient travel experience.",
    credit: "Anna Shvets",
  },
  "check-up": {
    url: "https://images.pexels.com/photos/11412596/pexels-photo-11412596.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a checklist with green checkmarks on white paper using a marker.",
    credit: "Towfiqu barbhuiya",
  },
  checkout: {
    url: "https://images.pexels.com/photos/4173320/pexels-photo-4173320.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Side view of young woman in trendy clothes weighing peaches on scales while  shopping in supermarket during purchase food",
    credit: "Gustavo Fring",
  },
  cheeks: {
    url: "https://images.pexels.com/photos/7136606/pexels-photo-7136606.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Serene close-up portrait of a woman lying down, capturing gentle emotions.",
    credit: "Abbat .",
  },
  chemistry: {
    url: "https://images.pexels.com/photos/8851786/pexels-photo-8851786.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Scientists in lab coats work with test tubes in a modern laboratory.",
    credit: "Mikhail Nilov",
  },
  chill: {
    url: "https://images.pexels.com/photos/4881611/pexels-photo-4881611.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Friends enjoying a relaxed evening picnic on a rooftop with string lights and snacks.",
    credit: "cottonbro studio",
  },
  choice: {
    url: "https://images.pexels.com/photos/8965138/pexels-photo-8965138.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Colorful depiction of healthy and sweet food choices on pink backdrop.",
    credit: "Nataliya Vaitkevich",
  },
  choose: {
    url: "https://images.pexels.com/photos/8396309/pexels-photo-8396309.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women browsing colorful clothing racks in a modern boutique.",
    credit: "Ron Lach",
  },
  chop: {
    url: "https://images.pexels.com/photos/7225537/pexels-photo-7225537.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Sliced green onions neatly arranged on a cutting board with a knife, perfect for cooking themes.",
    credit: "Eva Bronzini",
  },
  chose: {
    url: "https://images.pexels.com/photos/8965132/pexels-photo-8965132.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant foam letters spelling 'YOUR CHOICE' on a pink background. Perfect for concepts of decision-making.",
    credit: "Nataliya Vaitkevich",
  },
  cinematography: {
    url: "https://images.pexels.com/photos/9808180/pexels-photo-9808180.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Group of teens pretending a movie scene in an indoor setting, showcasing diversity and creative teamwork.",
    credit: "Ron Lach",
  },
  clarify: {
    url: "https://images.pexels.com/photos/4812657/pexels-photo-4812657.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a young man applying a clay face mask with a mirror.",
    credit: "cottonbro studio",
  },
  classical: {
    url: "https://images.pexels.com/photos/165973/pexels-photo-165973.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up view of a violin scroll with elegant wood finish, highlighting musical craftsmanship.",
    credit: "Méline Waxx",
  },
  classify: {
    url: "https://images.pexels.com/photos/8540125/pexels-photo-8540125.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Lush green coniferous needles form a dense, evergreen texture.",
    credit: "Sonny Sixteen",
  },
  clean: {
    url: "https://images.pexels.com/photos/39338456/pexels-photo-39338456.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Contemporary kitchen counter setup with a sink, soap dispenser, and electric kettle.",
    credit: "Mateusz Pielech",
  },
  "clear up": {
    url: "https://images.pexels.com/photos/5591907/pexels-photo-5591907.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A woman cleaning a glass table using a spray bottle and cloth indoors.",
    credit: "RDNE Stock project",
  },
  climbed: {
    url: "https://images.pexels.com/photos/17270017/pexels-photo-17270017.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A man skillfully climbs a rock under a dramatic sky in a mountainous landscape.",
    credit: "Dylan Flying",
  },
  close: {
    url: "https://images.pexels.com/photos/5961722/pexels-photo-5961722.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black-framed 'Sorry We're Closed' sign against a dark backdrop, ideal for business themes.",
    credit: "Thirdman",
  },
  closing: {
    url: "https://images.pexels.com/photos/942304/pexels-photo-942304.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A close-up of a 'Closed' sign hanging against a blurred, bokeh background, creating a warm, inviting atmosphere.",
    credit: "Tim Mossholder",
  },
  coach: {
    url: "https://images.pexels.com/photos/32101180/pexels-photo-32101180.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two soccer coaches reviewing strategies on the field during the day.",
    credit: "Franco Monsalvo",
  },
  collect: {
    url: "https://images.pexels.com/photos/33305381/pexels-photo-33305381.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A detailed collection of vintage postage stamps neatly organized in albums, showcasing diverse themes.",
    credit: "Berna",
  },
  combine: {
    url: "https://pixabay.com/get/gc973417489be57cb636c5fe0acd510aadb112283bef14418cfe6b0a90b15a1af099dc706b99505778df3986178602ef6b17f6dfebd2c30bbcfb393082ab65384_640.jpg",
    alt: "combine harvester, harvest, farm, combine, barley, crop, field, agriculture, rural, landscape, agricultural machinery, combine harvester, combine harvester, combine harvester, agricultural machinery, agricultural machinery, agricultural machinery, agricultural machinery, agricultural machinery",
    credit: "orko46",
  },
  commence: {
    url: "https://images.pexels.com/photos/29229906/pexels-photo-29229906.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Group of graduates in gowns posing outdoors in front of university building.",
    credit: "clmcdk fejcn",
  },
  communication: {
    url: "https://images.pexels.com/photos/3811108/pexels-photo-3811108.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A multicultural group of women talking and laughing together on a couch, showcasing friendship and togetherness.",
    credit: "RF._.studio _",
  },
  community: {
    url: "https://images.pexels.com/photos/37495850/pexels-photo-37495850.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A large group of people sitting outdoors under a tree, showcasing diversity and unity.",
    credit: "Mr.Rabindra Bagh",
  },
  compassionate: {
    url: "https://images.pexels.com/photos/5875109/pexels-photo-5875109.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two women offering support through gentle hand holding on a red couch.",
    credit: "RDNE Stock project",
  },
  compelling: {
    url: "https://images.pexels.com/photos/7243061/pexels-photo-7243061.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden scrabble tiles forming the word 'accomplishments' on a white background.",
    credit: "Brett Jordan",
  },
  complete: {
    url: "https://images.pexels.com/photos/8850706/pexels-photo-8850706.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A simple white paper checklist with one red checkmark, ideal for concepts like completion or approval.",
    credit: "Tara Winstead",
  },
  completed: {
    url: "https://images.pexels.com/photos/8850706/pexels-photo-8850706.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A simple white paper checklist with one red checkmark, ideal for concepts like completion or approval.",
    credit: "Tara Winstead",
  },
  compromise: {
    url: "https://images.pexels.com/photos/6899143/pexels-photo-6899143.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Symbolic handshake wrapped in barbed wire on a white background representing restriction and unity.",
    credit: "Anna Shvets",
  },
  compromised: {
    url: "https://images.pexels.com/photos/6899143/pexels-photo-6899143.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Symbolic handshake wrapped in barbed wire on a white background representing restriction and unity.",
    credit: "Anna Shvets",
  },
  conceited: {
    url: "https://images.pexels.com/photos/8360630/pexels-photo-8360630.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Black and white portrait of a stylish man with dreadlocks, sitting against a wooden wall.",
    credit: "Diego Ramirez",
  },
  concern: {
    url: "https://images.pexels.com/photos/12449967/pexels-photo-12449967.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A child is depicted covering their ear, suggesting discomfort or concern.",
    credit: "Towfiqu barbhuiya",
  },
  concerted: {
    url: "https://images.pexels.com/photos/7095718/pexels-photo-7095718.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A group of professional musicians performing a classical symphony on stage.",
    credit: "cottonbro studio",
  },
  conclusion: {
    url: "https://images.pexels.com/photos/11141706/pexels-photo-11141706.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Elegant 'The End' text on a textured pink background, perfect for closure or transition concepts.",
    credit: "Ann H",
  },
  conclusions: {
    url: "https://images.pexels.com/photos/11022645/pexels-photo-11022645.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden letters arranged to spell 'Conclusion' on a brown cardboard background.",
    credit: "Ann H",
  },
  concur: {
    url: "https://images.pexels.com/photos/10330108/pexels-photo-10330108.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a card reader generating a TAN code on a laptop for secure online banking.",
    credit: "REINER  SCT",
  },
  conduct: {
    url: "https://images.pexels.com/photos/12867544/pexels-photo-12867544.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Sunset glow on railway tracks creating a dramatic reflection, highlighting the lines.",
    credit: "Olavi Anttila",
  },
  conducted: {
    url: "https://images.pexels.com/photos/15096575/pexels-photo-15096575.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed view of hands interacting with electronic device, showcasing technology and collaboration.",
    credit: "Muhammad Jawadur Rahman",
  },
  confidence: {
    url: "https://images.pexels.com/photos/7109063/pexels-photo-7109063.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A diverse group of professionals posing confidently in a modern office environment.",
    credit: "Tiger Lily",
  },
  confidential: {
    url: "https://images.pexels.com/photos/8371715/pexels-photo-8371715.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of hand holding top secret document folder in a box.",
    credit: "cottonbro studio",
  },
  confirm: {
    url: "https://images.pexels.com/photos/32327868/pexels-photo-32327868.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Wooden blocks aligned to spell 'CHECK' with a checkmark symbol on a neutral background.",
    credit: "Ann H",
  },
  confirmed: {
    url: "https://images.pexels.com/photos/8831814/pexels-photo-8831814.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A 3D animated hand giving a thumbs up gesture on a black background, suitable for various positive themes.",
    credit: "cottonbro CG studio",
  },
  confusion: {
    url: "https://images.pexels.com/photos/33715994/pexels-photo-33715994.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Adult man in white t-shirt shrugs in studio, expressing confusion against a plain background.",
    credit: "Will Oliveira",
  },
  conscientious: {
    url: "https://images.pexels.com/photos/39037911/pexels-photo-39037911.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Two volunteers collect litter in a park, promoting environmental awareness and community service.",
    credit: "Galib Rahman Nadim",
  },
  consent: {
    url: "https://images.pexels.com/photos/30918011/pexels-photo-30918011.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of Scrabble tiles spelling 'Consent' on a wooden surface, focusing on ethics and communication.",
    credit: "Markus Winkler",
  },
  conserve: {
    url: "https://images.pexels.com/photos/6588431/pexels-photo-6588431.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A jar of homemade orange marmalade with fresh oranges in a cozy kitchen setting.",
    credit: "ROMAN ODINTSOV",
  },
  consider: {
    url: "https://images.pexels.com/photos/5452255/pexels-photo-5452255.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A male doctor in deep thought, holding a pen and wearing a stethoscope indoors.",
    credit: "Tima Miroshnichenko",
  },
  considered: {
    url: "https://images.pexels.com/photos/12320842/pexels-photo-12320842.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Close-up of a tattooed arm, bracelet visible in a relaxed pose.",
    credit: "stayhereforu",
  },
  considering: {
    url: "https://images.pexels.com/photos/5999818/pexels-photo-5999818.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "High angle of crop female entrepreneur in formal wear touching chin with pen while thinking on solution in park",
    credit: "Ono  Kosuki",
  },
  constitute: {
    url: "https://images.pexels.com/photos/8850742/pexels-photo-8850742.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A law book with bold letters placed beside a red, white, and black decorative ribbon.",
    credit: "Tara Winstead",
  },
  constrained: {
    url: "https://images.pexels.com/photos/8458948/pexels-photo-8458948.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Woman enclosed in a cardboard box, showing signs of stress and fear.",
    credit: "MART  PRODUCTION",
  },
  construed: {
    url: "https://images.pexels.com/photos/18080900/pexels-photo-18080900.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A view of concrete and wooden scaffolding at a construction site under the clear blue sky.",
    credit: "Ridwan Nugraha",
  },
  contentment: {
    url: "https://images.pexels.com/photos/6711848/pexels-photo-6711848.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A cheerful woman relaxing on a sunlit outdoor couch with colorful pillows, enjoying leisure time.",
    credit: "Anna Tarazevich",
  },
  continue: {
    url: "https://images.pexels.com/photos/258525/pexels-photo-258525.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "A wide covered pedestrian bridge with geometric design elements in a modern urban setting.",
    credit: "Pixabay",
  },
  continuous: {
    url: "https://images.pexels.com/photos/8475350/pexels-photo-8475350.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Vibrant neon infinity symbol glowing in blue and pink against a dark backdrop, evoking endless possibilities.",
    credit: "Nothing Ahead",
  },
  contract: {
    url: "https://images.pexels.com/photos/7841818/pexels-photo-7841818.jpeg?auto=compress&cs=tinysrgb&h=350",
    alt: "Detailed close-up of a patent agreement document on a polished wooden table.",
    credit: "RDNE Stock project",
  },
  "contrary to": {
    url: "https://pixabay.com/get/g96b37a3d73e817dd7fc26c1e40a05c80bf629f707e8c7144c657956b68a8809256893abd408ccbf70b3f81b62098a807_640.jpg",
    alt: "men, arrow, red, contrary, group, action, protester, vector, freedom, arrow, arrow, arrow, action, action, action, action, action",
    credit: "sardenacarlo",
  },
  "controlled for": {
    url: "https://pixabay.com/get/g99b671a6159cf799361d13fcb12df90c9b1511cfdb608d5a9a921ba994d2ea92c9b6bad582210f2d86d8a758ed0652d83728c7fa64fe26150c7cf49ba488e916_640.jpg",
    alt: "magnifying glass, seek, detective, looking for, enlarge, zoom, glass, magnification, lens, examination, control, security, find, view, data search, magnifying glass, seek, detective, detective, detective, detective, detective, find, find",
    credit: "viarami",
  },
  conversation: {
    url: "https://pixabay.com/get/g09fb5cce40feb46a9d78284bf28d29c8d02ee944fc7a44823056c7dc5071a96588d49cafa082e8cda78f2ea4f005c41982edb6836851a54219e4bd9adf075a45_640.jpg",
    alt: "people, students, university, campus, classmates, friends, discuss, nature, discussing, group work, groupmates, grass, field, friendship day",
    credit: "naassomz1",
  },
  conversely: {
    url: "https://pixabay.com/get/g85f2d8503a236c35b59ef4a0e4a53c95abdbbd8dd3603847bab93b0eea0f6e774a94462aeec96547d2735883b7180338cf6ebfdc4f78d36b1bf761935e779aa6_640.jpg",
    alt: "shoes, sneakers, converse, footwear, casual, canvas, super hero, pair, lace, fashionable, limited edition, shoes, shoes, shoes, shoes, shoes, sneakers",
    credit: "cegoh",
  },
  convincing: {
    url: "https://pixabay.com/get/ge5cd2a2f96072d27507cbefa876d9afab9ec5c120438724dabd679632176782cd5235c5d4eb4f6eae8c29d5bf105bf8088a76ec4ac86fa821c29bca9949346aa_640.jpg",
    alt: "trust, man, hood, map, prompt, darkness, blind trust, saying, truth, reality, dark, conviction, convince, politics, business, deep web, dark web, hidden, trust, trust, trust, trust, trust, truth, truth, truth, convince, politics, dark web, dark web, dark web, hidden",
    credit: "geralt",
  },
  cooking: {
    url: "https://pixabay.com/get/gd90feb6a7c22d6ad905d9411e77b4525317ad766090cc41bc22f8824657baab5a0bd75a56277ac0ba0850fd533703dac84d28d80917a9d6c3e4f48dd12608e7a_640.jpg",
    alt: "campfire, burning, camping, close up, cooking, cooking pots, fire, firewood, hot, pots, smoke, wood, embers, heat, campfire, camping, camping, camping, camping, camping, cooking, fire",
    credit: "Pexels",
  },
  cool: {
    url: "https://pixabay.com/get/g7ad599fa5a62b2596d9e8e7df45e25d7503ea508acfb00bcd58d003e6a6febe9148b737bb3946e421e78aa448e87abed267aea0d67374d54fa909f46c26f9cc5_640.jpg",
    alt: "cafe, outside, japan, peaceful, cool, cafe, cafe, cafe, cafe, cafe, japan",
    credit: "Takatoshikun",
  },
  cost: {
    url: "https://pixabay.com/get/g31f0dec9c9e32612768d4aa784412c6b2e94373d0c051b69f6b1eccb643f1fa7318c33d7786da1d11979da9c4b68f3be31f52fe0c6d1ee776ba314b3db925e2b_640.jpg",
    alt: "zucchini, garden, vegetables, vegetable garden, food, organic, power, nature, eat, yellow, health, costs, zucchini, zucchini, zucchini, vegetables, vegetables, vegetable garden, food, power, health, health, health, health, health",
    credit: "YALEC",
  },
  cough: {
    url: "https://pixabay.com/get/g750fe325122cdf889baad7e65c32f51f5161f197845cda5da5649dcf3eab7c2f714219cf7a8872be86c591d664e085071f7aa819b3b79ac8d3243054db099038_640.png",
    alt: "hustelinchen, cough drops, storage jar, can, container, rifle, store, decorative, tin can, packaging, company villosa, villosa, against cough, cold, isolated, health, old, antique, packaging, packaging, packaging, packaging, packaging",
    credit: "NoName_13",
  },
  crafted: {
    url: "https://pixabay.com/get/gf95ddd9597c9433c207536a5f198ac2bd4f0736bbb3de608014f88c0ebc2a31b8459326bb5990836f6e100d5db089ad0363fa8ab8924f92879560fff9c4b3d46_640.jpg",
    alt: "crafted copper, handmade crafted coppers, hand crafted copper, hand crafted solid, copper products, handmade products, homemade copper jewelry, copper products, copper products, copper products, copper products, copper products, handmade products",
    credit: "CatherineEarnshaw",
  },
  crashes: {
    url: "https://pixabay.com/get/gb78fe07f8877221856ed75821eb1e69f61644e08d6a2db0f650519e366f3d4d214556c27a953d9c586eb985223b06fb3_640.jpg",
    alt: "water, nature, splash, spume, crash, crashing waves, waves, ocean, sea, ocean waves, sputtering, azure, thailand",
    credit: "thestorychef",
  },
  crashing: {
    url: "https://pixabay.com/get/gf4bd9620ac0cda30f00c9deb979ca0ae137ecb765d39cd2a1f5430c4813112a3d5c887a64452d11ce558856ff136e417_640.jpg",
    alt: "water, nature, splash, spume, crash, crashing waves, waves, ocean, sea, ocean waves, sputtering, azure, thailand",
    credit: "thestorychef",
  },
  credit: {
    url: "https://pixabay.com/get/g2b33eadc0482889eab7c8d286c06ec2316247e1db2b4a29ef889af95617d4dad9a92beabc74c64ecd69eb12a6e877444256c6c7c27a581dfb1f58b6f4f275aa6_640.jpg",
    alt: "credit card, credit cards, cards, money, credit card, credit card, credit card, credit card, credit card, credit cards, credit cards",
    credit: "ron2025",
  },
  criticised: {
    url: "https://pixabay.com/get/gfe4a42a7bcebdf23a454efed35ecbce0b7b9de29c16c54ec0bc1e43d6a5eec9cba01943ab6df56fb1b0ad4f87f0861c63a5e742ce57d6b3a440dc0576c122b53_640.jpg",
    alt: "man, cap, an eye, critical, masculine, portrait, critical, critical, critical, critical, critical",
    credit: "422737",
  },
  curiosity: {
    url: "https://pixabay.com/get/ge0b4f73152cbec1d31dce9f7f8e254972513ed4139c90dd8b221b719d883050844e1f4ad05741bdb2b4a0ebd97d9678da96e7dad4b69274416b5da667786f81a_640.jpg",
    alt: "lemur, animal, wilderness, nature, wildlife, forest, lemur, lemur, lemur, lemur, lemur",
    credit: "jansedlon",
  },
  cut: {
    url: "https://pixabay.com/get/g99b3543b8fc9c2081079d3fd456fe97ec74dd1b505030f15ef40921b4d77371cd0ebe0dd65b94d7a8df24876fb1eba55_640.jpg",
    alt: "vegetables, knife, paprika, traffic light vegetables, leek, food, meal, yellow pepper, red pepper, healthy, cut, cook, preparation, to cut, vegetables, vegetables, vegetables, knife, knife, knife, knife, knife, cut, cook, cook",
    credit: "congerdesign",
  },
  cyclone: {
    url: "https://pixabay.com/get/gaee18f92986bb73f1bf8058e138a178cb7ae9d6e8b5084043917e4fbff7af9c595bbf0833e0e350f3958f5622a56c000_640.jpg",
    alt: "cyclone, catarina, hurricane, tropical cyclone, clouds, typhoon, nature, storm, aerial view, satellitenbid, satellite image",
    credit: "WikiImages",
  },
  "dairy section": {
    url: "https://pixabay.com/get/gacf652a76b3f7a9b761c3d4d7b4ae41c3ea0014c312a2a516d345ed48d2cdff9e457ee795f7796e413b0de5f1ecf4d81_640.jpg",
    alt: "soft cheese, camembert, mold cheese, cheese, mould, white, dairy product, dairy, cheese factory, food, unwrapped, enjoy the meal, section, cut off, piece, cheese corner, soft cheese, soft cheese, soft cheese, soft cheese, soft cheese, camembert",
    credit: "EME",
  },
  dancing: {
    url: "https://pixabay.com/get/g5686fad5fe2a8a4ea638e91b5755ef18eb67266db66d646719b3465fafb3780cec95bc03a94f53ff73f3394f686e5b2143a3d8317341e02602ddb44a7848adbf_640.jpg",
    alt: "crowd, wallpaper 4k, concert, music festival, party, people, 4k wallpaper 1920x1080, people dancing, laptop wallpaper, cool backgrounds, disco, music, club, nightlife, 4k wallpaper, hd wallpaper, free wallpaper, mac wallpaper, entertainment, beautiful wallpaper, free background, event, dance club, celebration, concert crowd, full hd wallpaper, wallpaper hd, windows wallpaper, night, festival, dance party, desktop backgrounds, festival crowd, night club, nightclub, discotheque, rock concert, people celebrating, wallpaper",
    credit: "Activedia",
  },
  date: {
    url: "https://pixabay.com/get/gc0cec5edab006abcd488e81da5ae4a1a438ff4d203e3be80496806c3e95d9fc1135054f28af12f1430f0d781cb3bd4aef27a09602f1f3988ec7353b477b483df_640.jpg",
    alt: "hands, people, couple, man, woman, love, date, union, gray love, happyvalentine's, couple, date, date, date, date, date",
    credit: "mina6120",
  },
  day: {
    url: "https://pixabay.com/get/gf49f37f9e357cb894ae2798eccb6233d2777bbb943e4a1909c8cfd491f5859de7009c8d1433607f254fd838ec00b8dd368b004511fd145eea32945ddb1635029_640.jpg",
    alt: "valentine's day, happy mothers day, beautiful flowers, flower wallpaper, roses, heart, romantic, flowers, beauty, nature, flower background, love, romance, flora",
    credit: "NoName_13",
  },
  deadline: {
    url: "https://pixabay.com/get/g317c60f3488f43c41f1553f6b79b956a4b7a5601dd47aaf5c4152acc9f1ba79662eb671a79d68ae721609e7f5af1fd84fca1d6a7b3ffd057ee5685b3950f72bc_640.jpg",
    alt: "time, alarm clock, clock, watch, hours, minutes, old, seconds, alarm, deadline, midnight, analog clock, retro, vintage, timepiece, time, time, time, time, time, clock, clock, clock, watch, watch",
    credit: "JESHOOTS-com",
  },
  deal: {
    url: "https://pixabay.com/get/g2e8c559c9b0bab1ce3f3035ee60b1521b35bdc85c2c0487f5b4cb33e26e390efcb548c9bb663f362c56684601009992c5a0f9eca0d1398c38da956ae1894fad4_640.jpg",
    alt: "handshake, agreement, trade, business, profit, sale, commercial, money, contract, concept, gesture, handshake, trade, money, money, money, money, money",
    credit: "Ralphs_Fotos",
  },
  debate: {
    url: "https://pixabay.com/get/g678dc7e6d377d5ed70cd283f1ab96a0d80653fa09454c3afabf0c108200be87678932cb70dc207af699592083766c6a547e52843e75d5dc2952930fc70a4fd15_640.jpg",
    alt: "partner, men, to speak, debate, communicate, people, debate, debate, debate, debate, debate",
    credit: "fsHH",
  },
  debit: {
    url: "https://pixabay.com/get/gce78b4e8912fea64d17f6135013e84278289a6f74a75549ebb9dd4f9cf2ad6b4981f62a6f6d6b7bc1279589dfd1838d2c50195729caa86751ab5df9f1181089b_640.jpg",
    alt: "credit cards, denim, jeans, blue jeans, debit cards, cards, money, bank account, bank, mastercard, pocket, credit cards, money, money, money, money, money, bank, bank, bank",
    credit: "TheDigitalWay",
  },
  debt: {
    url: "https://pixabay.com/get/ga3060f9685e6ee90708f1f3bc876220799eb2159096bd8b2e1db554d6e3215c0fa480ef38b7fef7e1af14ff19f336fe3044cb939778149a04c7e40322176dd48_640.jpg",
    alt: "berlin, sculpture, statue, people, debt, forgiveness, forgiveness, forgiveness, forgiveness, forgiveness, forgiveness",
    credit: "HarryStueber",
  },
  decide: {
    url: "https://pixabay.com/get/ge52c2c9ee72e267136f20a779b37b3f747f4a856bed230f167797089b8a61de0283f7d2956022d11dc09f55905137b91bd850b85985617223313033e5858a3fb_640.jpg",
    alt: "choice, select, decide, decision, vote, politics, board, writing, school, chalk, choice, choice, choice, choice, choice, decision, vote, politics",
    credit: "geralt",
  },
  decision: {
    url: "https://pixabay.com/get/gbb95de9d9472b67328695251632986ac9f44d6e5d8dfb40f3e683892f46200362cb061a02daa2083b6fa89978eed1745dd3c3659844ba6d5d9b08cd2eabd43d9_640.jpg",
    alt: "doors, choices, choose, decision, opportunity, choosing, option, entrance, decide, doorway, select, alternative, future, entering, chance, exit, confusion, labyrinth, complexity, maze, wayout, doors, doors, doors, doors, doors, choices, decision, opportunity, future, future, future, future, maze",
    credit: "qimono",
  },
  decline: {
    url: "https://pixabay.com/get/g14fe790340e779610aca58fdbf2c6728e1f1ff99ef590090be304fcddd27099b08b2ccb806a6125b5d8e04ed49166c8a_640.jpg",
    alt: "notes, paper, ball of paper, memo, office, write down, spiral binding, datailaufnahme, note, idea, discard, planning, decline, notes, memo, idea, idea, idea, idea, idea, planning, planning, planning, planning",
    credit: "congerdesign",
  },
  declined: {
    url: "https://pixabay.com/get/g43f413acf3be5d20697d69246b74747802406e61a4069f44089e3bcb276fc56f9307ba7f226e30e2b67e4463666bb847_640.jpg",
    alt: "notes, paper, ball of paper, memo, office, write down, spiral binding, datailaufnahme, note, idea, discard, planning, decline, notes, memo, idea, idea, idea, idea, idea, planning, planning, planning, planning",
    credit: "congerdesign",
  },
  decorate: {
    url: "https://pixabay.com/get/g0f97e8c6e6baa0940d6c30b421a629bd015853ecf2947fd2d5541c9e721107f92ae9560e4178178d9f9bb7960546b43e217c1818bef32e8bc9831dd2bdd0f32e_640.jpg",
    alt: "lantern, festival, lamp, decorate, new year, lantern, lantern, lantern, festival, festival, lamp, lamp, new year, new year, new year, new year, new year",
    credit: "ymyphoto",
  },
  deemed: {
    url: "https://pixabay.com/get/g67478047617b4c4c6b437a0a91c8d8db2fccf7a09f0da63cf043066742e088b047494ae9882697d00a843fec3a85ab8f_640.jpg",
    alt: "lamp, idea, pear, opinion, thought, hunch, electricity, energy, economical, creativity, invention, solution, knowledge, know, science, savings, save, voltage, flow, power supply, deem, to think, think it over, meditate, intelligent, smart, lighten up, light, luminous, brilliant, genius, wonderful, creation, intelligence, thought out, creatively, efficiency, durable, inspiration, opinion, know, know, know, know, know",
    credit: "niekverlaan",
  },
  degree: {
    url: "https://pixabay.com/get/g0a7e34c3135a4d1c029f31867e5f484e0a6bf57064a8d85877a34bfec3f1a7c973abfb9eece41e607286f039acadf6d7b6ad8cd7d85e003314878dbbc6cea038_640.jpg",
    alt: "dortmund, phoenix lake, panorama, night, night shot, houses, light, architecture, lake, water, 360 °, little planets, spherical panorama, nature, 360-degree panorama, spherical projection, projection, panoramic shot, 360-degree panoramic shooting, 360-degree recording, photo technology",
    credit: "EvgeniT",
  },
  delicious: {
    url: "https://pixabay.com/get/g903961f255b9ba5661f23f9b445f7f55bb3489e0c1b3e9441ec881bc865cd420d09857a38f780af42f02dfba6c0a7b5a_640.jpg",
    alt: "apple, red, delicious, fruit, vitamins, apple, apple, apple, apple, apple",
    credit: "jarmoluk",
  },
  delineate: {
    url: "https://pixabay.com/get/gb1e444fa3e9194b13a2bd85cf9e929661b336b2ada4f69d00d3f05ee7db2486db421613646063e768ade105c63e99b4bd6477781fbe4c51de108cd739f5ca6c4_640.jpg",
    alt: "delineator posts, country road, traffic",
    credit: "torstensimon",
  },
  delivery: {
    url: "https://pixabay.com/get/ga25bad49d373f008332eda04f41de959b59d143105ec41971b6de9505087fd475b02dbfb23b5cd4ff842f7f8be5eb74594b5f8a2cf6ff82beb60220ad1e31d71_640.jpg",
    alt: "packages, delivery, delivery man, parcel, boxes, custom boxes, service, delivery, delivery, delivery, delivery, delivery, delivery man, delivery man, delivery man, delivery man, parcel",
    credit: "romeosessions",
  },
  demonstrate: {
    url: "https://pixabay.com/get/g3f736172936e53eedd120361ab6ece9ec57ec05da2299f0f0dddde1e8c5c6f0413fb7d8af0352d78a364fe1221580177_640.jpg",
    alt: "demonstration, sign, poster, people, against, demonstrate, women, men",
    credit: "Broadmark",
  },
  departure: {
    url: "https://pixabay.com/get/ge2ed83e2be124e3a4d67c4ada6adc5dac3e514a294c603abf722f4d299876fe4ecd7d5d2fe71bd848ccda3c71cad162a57b77b5d5c9abcccb6ee61e4023ebe76_640.jpg",
    alt: "travel, flight, schedule, ad, plan, departure, airport, time, traffic, transport, airport, airport, airport, airport, airport",
    credit: "wal_172619",
  },
  deposit: {
    url: "https://pixabay.com/get/g044208ddc9e9581a20d6fa6e064ba5c3e5bdbb7adcb1907468eeac42876e0388ac096bf31e91fe8047e08c7f2e01cff0_640.jpg",
    alt: "euro, coin, currency, europe, money, wealth, business, finance, profit, revenue, bank, deposit, incentive, investments, euro, euro, euro, euro, euro, coin, coin",
    credit: "stux",
  },
  description: {
    url: "https://pixabay.com/get/g1f1319f48fba42e49b537b3e72091033bd57c623ea51954d1b5948da246b1700fd2ed5de55d8dbfdf2251020f5e43aba3474fb825aafd496985a699088c935dd_640.jpg",
    alt: "food decoration, ingredients description, a top view shooting",
    credit: "hsu027",
  },
  designed: {
    url: "https://pixabay.com/get/g18d1b8b2fb9f780c6ab857014052ed0ed5953dfacabacdb4d9a564a3f3550dd6f0cfd1b9055f2fd0e0c439e568d00a10_640.jpg",
    alt: "radiator, old, ancient, designed, metal, object, warm, heating",
    credit: "PublicDomainPictures",
  },
  desks: {
    url: "https://pixabay.com/get/g1087d61c1a97c25f1a9c4a932dd49698b1428a91d3bca94aeaa5f25069d71ee935e877053326209c75f8d5881602c2f6351c883db80936e2686ece893f1550a3_640.jpg",
    alt: "notebook, desk, paper, desktop, flat lay, office, business, table, work, space, note, workplace, pencil, workspace, creative, writing, texture, notepad, modern, rose gold, desk, desk, desktop, office, office, office, business, business, business, business, business, work, writing, writing",
    credit: "JessBaileyDesign",
  },
  detailed: {
    url: "https://pixabay.com/get/g6e8c8499a4c26ef36ee3f1b19136b628a625c52f376148a99a9127b93d50af0b0fd71f38a12b5a21fd5139de2d433bb04f53d74a7f0852394f552ab424fefcb8_640.jpg",
    alt: "iguana, reptile, animal, nature, lizard, wildlife, closeup, portrait",
    credit: "edofs1",
  },
  detour: {
    url: "https://pixabay.com/get/g4b917970014f40f8908f3fbbc8dcc583ecdb1005e635d271ae2775756e4c8d8e09918f331e4ee8af26b25db746f9121cb3606dfc13aa37733b6fef3f35cb68ce_640.jpg",
    alt: "signpost, closed, road-sign, end, stop, barrier, end, stop, stop, stop, barrier, barrier, barrier, barrier, barrier",
    credit: "00luvicecream",
  },
  developed: {
    url: "https://pixabay.com/get/g013fe7f8f9b51c523fdb234d18bb90618a2dd3831ba84ad451071e45c3e8af1c47e0ee8da6fec9e58a98c1ff080d4063_640.jpg",
    alt: "photos, hands, hold, old, old photographs, photography, reminisce, memories, vintage, nostalgia, souvenir, black and white photography, photographer, developed photos, photos, photography, memories, memories, memories, memories, memories",
    credit: "jarmoluk",
  },
  development: {
    url: "https://pixabay.com/get/g000498876fb0e6478f8a48ca227c16b844632669940508467e76a487c2b66b501b156e459b9ce852d29859159d34c7e77fe05cc6f5abdbc872317b36403688d0_640.png",
    alt: "programming, html, css, javascript, php, website development, code, html code, computer code, coding, digital, computer programming, pc, www, cyberspace, programmer, web development, computer, technology, developer, computer programmer, internet, ide, lines of code, hacker, hacking, gray computer, gray technology, gray laptop, gray website, gray internet, gray digital, gray web, gray code, gray coding, gray programming, programming, programming, programming, javascript, code, code, code, coding, coding, coding, coding, coding, digital, web development, computer, computer, computer, technology, technology, technology, developer, internet, hacker, hacker, hacker, hacking",
    credit: "Boskampi",
  },
  diagnosed: {
    url: "https://pixabay.com/get/g58ffbad7e724fed5fb424f9ff355637d3a7db492ce97f8fb9fdcdf1a5f3453526e7f533863a1f69aa0eb0b39fac6a4a798b56637d2c3fed13184851f2fa7c8c7_640.jpg",
    alt: "adult, ambulance, background, care, cheerful, clinic, complaints, consultant, beautiful wallpaper, consulting, diagnose, free wallpaper, full hd wallpaper, laptop wallpaper, diagnosis, discussion, doctor, equipment, wallpaper 4k, exam, expertise, hd wallpaper, female, hand, desktop backgrounds, mac wallpaper, health, cool backgrounds, healthcare, healthy, history, hospital, blue health, blue hospital, blue healthy, blue doctors, blue history, wallpaper hd, windows wallpaper, free background, 4k wallpaper, 4k wallpaper 1920x1080, blue care, blue healthcare",
    credit: "ckstockphoto",
  },
  dice: {
    url: "https://pixabay.com/get/g2916306022d13206b4826622363e0ed8a908b9815f817d834e3a0b6f83735eb8c89e32260732a3618f7455453370ae758dda49a2c0a67aac0919262ac2419909_640.jpg",
    alt: "dice, dice cup, happiness, gambling, gesellschaftsspiel, to play, roll the dice, win, profit, instantaneous speed, lucky dice, lucky number, probability, dice, dice, dice, gambling, lucky number, probability, probability, probability, probability, probability",
    credit: "Alexas_Fotos",
  },
  "didn't": {
    url: "https://pixabay.com/get/g6f00d9d9f4e8e5eb25a94651bc49aff3c4cf2c9caac777afcb497f2f4f5cdfeec4143c66d21d982479e41b96758c08b3e19f982b8731bed6c1fab2a4d202b64f_640.jpg",
    alt: "łódź, steering, river, crew, swimming, sail boat didn't, the fisherman",
    credit: "DUOTONE_",
  },
  die: {
    url: "https://pixabay.com/get/gd85891e7d6dd35fd00afa358b01762fd517aab8c1f078e856058d13e861aee056f179e770a25616a5ebb044416fa6c92dc98291959cc78df60893432a4362747_640.jpg",
    alt: "die, pm",
    credit: "PagArt_",
  },
  differ: {
    url: "https://pixabay.com/get/g9a76f0e86aa40ca79ba31f17d71aae9ced0ee7ad95daf5de013c4ab58bf1ea69217f0f120f5518c378c7dfbe000427eead793e53b36a6616320786299948ac77_640.jpg",
    alt: "marigold, cornflowers, sunny, flower meadow, beautiful flowers, meadow, flower, plant, individual, stand out, alone, different, flower background, flower wallpaper, yellow, blue, idyllic, nature, tea, tincture, naturopathy, medicinal plant, envelope, oil, resin, ointment, composites, blossoms, calendula officinalis, garden, jewellery, buttercup, yolk flower, golden rose, centaurea cyanus, blue cap, knapweed, grain eater, imperial flower, happy, flower bed, bed, unique selling point, unique, anders, exception, contrast, not compliant, be different, nonconformist, differ, difference, noticeable",
    credit: "MonikaP",
  },
  differentiate: {
    url: "https://pixabay.com/get/g27aa20327c6235b2b24065575dbee596ae961d49b171e685924bf370075274015f0af885205ef705a95d29b583f172ca06737d53b91c886f2c4663280a7d5f4a_640.jpg",
    alt: "difference, differentiate, anders, be different, goal, different, delimit, desired image, delimitation, awareness, perception, self, psyche, umbrellas, courage, pull out, differentiate, differentiate, differentiate, differentiate, differentiate, be different, be different, be different, be different, different, different, perception, perception, perception",
    credit: "RosZie",
  },
  "dining room": {
    url: "https://pixabay.com/get/g48744bc6c44a4b27b787d53096ff8d161187685a4478da2e3155c90ff369e35b4843e82e603a5581d0b470349f48f630ebf0a823d19a5756cf8c37b55ee9eb52_640.jpg",
    alt: "dinner, table, home, table setting, dining, celebration, elegant, interior, candles, dinner, dinner, dinner, dinner, dinner",
    credit: "JillWellington",
  },
  dinner: {
    url: "https://pixabay.com/get/gad53b79cc9dbf07be067af96aeabe0e487bcd813779060d67e490451db73711422a1e684f00b976e0bfaf876134c3bda40e7cc47ec35f86ec58b4624f6d876c3_640.jpg",
    alt: "table, glassware, cutlery, silverware, stemware, dining table, nature, dinner table, table setting, table set-up, dinner, luxury, restaurant, sunset",
    credit: "JoelFazhari",
  },
  dip: {
    url: "https://pixabay.com/get/g62a44d9826c28b692a4342f8592bb5e8343ada759eca07196bc3dd21d34133917be39f9c990cae8eba6dd0f24d90f329930bfdb7645a8d301645b62ca75dc8ee_640.jpg",
    alt: "spread, dip, food, flower background, flowers, snack, nature, flower wallpaper, cream cheese, vegetarian, salty, sheep cheese, tasty, delicious, beautiful flowers, bowl, gourmet",
    credit: "Einladung_zum_Essen",
  },
  diploma: {
    url: "https://pixabay.com/get/g2ddeb24d2693dce5d19847ef308c1e4daf0eace7a37120e8d8b62c6a8135b67857f9e455878bd12301c996e17f82ead7_640.jpg",
    alt: "cup, medal, diploma, medal, medal, medal, medal, medal, diploma, diploma",
    credit: "alex1983",
  },
  directions: {
    url: "https://pixabay.com/get/gc5f1129008ce3bc65ea092a367af77fd72fe2fbf71590eec941a2a2361e14c53ccb2f9fd52ed32d43df78e83dd90e977e490a1b5ed7967e73ee7648b49841ea9_640.jpg",
    alt: "compass, map, retro, geography, navigation, orientation, old, antique, nautical, vintage, direction, compass direction, map, map, map, map, map, geography, geography, geography, geography, navigation, navigation, direction, direction, direction",
    credit: "Ghinzo",
  },
  disabled: {
    url: "https://pixabay.com/get/g5eca88ce4f4f6ef258bd8996fefd7d80e56f2b8b9235b44d1c5b36fb01026ab8016f96bcb649c31a36eac2b93865a4dc85ef401768361d0d731916d2714080e0_640.jpg",
    alt: "disabled vehicle, maintenance, wheel, chair, disabled, damage, help, maintenance, disabled, disabled, disabled, disabled, disabled",
    credit: "malikubra",
  },
  disagree: {
    url: "https://pixabay.com/get/g441e30472f9e0ef97a7030c645d9afbfc8a304eef96c64d35726b4835c945a643b1bf9c15a9b2f9a681326122c7131641d2cbe9ac589dc058fa4ebd47bc06e33_640.jpg",
    alt: "disagree, different, deleted, disagree, disagree, disagree, disagree, disagree",
    credit: "Wensbos",
  },
  disappoint: {
    url: "https://pixabay.com/get/gac6b2d080cbea85aea11e7b85be95f45166fe3243fb205de513b03670b5a214fceb4a726940ea4925589f2fe9d62ada39fee37a44f88d54f19b203e12b3523de_640.jpg",
    alt: "man, board, drawing, muscles, strong, weak, chalk, disappointment, biceps, hood, disappointed, fitness, muscle, training, hope, pose, power, bodybuilding, poor, hardness, masculine, upper arm, weight training, forearm, interleaving, beard, hair, dream, presentation, man, man, man, man, man, strong, fitness, fitness, hope, power, power",
    credit: "Schäferle",
  },
  disappointment: {
    url: "https://pixabay.com/get/g9513e3574dee156ad0992f6c8b8401e998c5aa7f8f17c4f6be95c4aed688482123c7b6128618acc61cac712a951e3b23206a08b6a5519a95b8d0c2b8833677fa_640.jpg",
    alt: "man, board, drawing, muscles, strong, weak, chalk, disappointment, biceps, hood, disappointed, fitness, muscle, training, hope, pose, power, bodybuilding, poor, hardness, masculine, upper arm, weight training, forearm, interleaving, beard, hair, dream, presentation, man, man, man, man, man, strong, fitness, fitness, hope, power, power",
    credit: "Schäferle",
  },
  discontinued: {
    url: "https://pixabay.com/get/g6145cd797f7040dc8cda82116bdbbe85d367e58fb3530938c1e86c6ad1524cc4b8cc8beb1f12a6e72ada931337c23c55c3edb4b909550a19053895901eb5cae8_640.jpg",
    alt: "landscape, line, discontinued line",
    credit: "aorenka",
  },
  discover: {
    url: "https://pixabay.com/get/gdefb206a3753185097192678368c7c13815c4f5638608f66b15dad5756e80fcc79431f622891dba971a01b4fbb0376c8cebac974c31a4148fd5cbdd2323893bf_640.jpg",
    alt: "discover, discovery, find, discover, discover, discover, discover, discover, discovery, find, find, find",
    credit: "bluehouseskis",
  },
  discovery: {
    url: "https://pixabay.com/get/g66921c9d076ec07b55e477566451060127cf360ee1779fda0fc913eb28f67e26618a3f84f87ab93af4294d8a2abd53d2509739a90609b68633e1d26e9f9ac740_640.jpg",
    alt: "house, children, discoveries, children, children, children, children, children",
    credit: "Dieterich01",
  },
  "discuss it later": {
    url: "https://pixabay.com/get/g4d8b60c4b77244449b7b8a92366396387239039abd5f225a41d12e8a24da284aa87c85f31005a0bf958f8aa6401930577870ce5b943c96ab18daf8cb7c9e71f0_640.jpg",
    alt: "gallery, pictures, peace, war, destruction, visitors, picture gallery, look at, to discuss, contrast, before, later, gallery, gallery, gallery, gallery, gallery, war, destruction, destruction, destruction, to discuss, before",
    credit: "Alexas_Fotos",
  },
  discussion: {
    url: "https://pixabay.com/get/g02b20bb769e93c76c971165ad76e9dda942145080f47cd59f2231d2c8280058127a603d8215be78ea1dd72d4cfa8dea799138de2e7cd80ac86d7e3ce74826127_640.jpg",
    alt: "people, girls, women, students, friends, talking, meeting, study, group, activity, homework, group work, brainstorming, group study, people, people, people, students, students, students, friends, friends, friends, talking, meeting, meeting, meeting, meeting, meeting, study, study, group",
    credit: "StockSnap",
  },
  dish: {
    url: "https://pixabay.com/get/g1f1fee1f89441c4a7e282ae23917cb64653db475e2c7e9d8ab939fe906c61f148ae9ae4f2b002fabef051074e584c8c95335d9540406bbc84ba111decf4da6a7_640.jpg",
    alt: "cake, cakes, cream cake, cream, yummy, sweet dish, calories, piece of cake, sweetness, black forest cake, cake, cake, cake, cake, cake, cakes",
    credit: "Couleur",
  },
  dismantled: {
    url: "https://pixabay.com/get/g978a63ed80b35789cda76fb5226832b1ac0993be4649f6cec8d78234bb10f95597e01f61ba6d22dde2eb63e9a108d3c9_640.jpg",
    alt: "bits, pieces, broken, dismantled, pocket knife, bits, bits, broken, broken, dismantled, dismantled, dismantled, dismantled, dismantled, pocket knife, pocket knife, pocket knife",
    credit: "StockSnap",
  },
  dismissed: {
    url: "https://pixabay.com/get/g30ab9afc54efdff49ab66d16cf233c1308a000195dbff0833e7528b11f2046a69140c4c6f7f3da93cb077ef12051155f9609e32c465d2a8a9f52572aa452c877_640.jpg",
    alt: "termination, dismissal, unemployed, job loss, farewell, office, cancel, sacking, fluctuation, employees, dismissal, dismissal, dismissal, dismissal, dismissal, unemployed, job loss, job loss",
    credit: "RosZie",
  },
  disposal: {
    url: "https://pixabay.com/get/g27712b5e41425ad9202228c16487fb7a25c695a1457fd87d4c9af5f994bc99f4dc734d4accdb80b75eb8093b66bf9a956872bede94a106edc14e2a8cb29e7392_640.jpg",
    alt: "the bottle, plastic, segregation, processing, recycling, reflection, container, waste, garbage, responsibility, throw, blue, services, pollution, empty, shine, wet, problem, to treat with, transparent, plastic waste, earth day, plastic, plastic, plastic, plastic, plastic, recycling, waste, plastic waste",
    credit: "pasja1000",
  },
  disputes: {
    url: "https://pixabay.com/get/g57ecab1b403884ecd645dccbeec39b142aadb363ce6015eacbe93ff0794f4a0c824602555e732b4f0c03aae8cef9b4414d07ecfc28b73769f53b3f4b249b93ec_640.jpg",
    alt: "sheep, bleat, communication, communicate, to speak, talk, conversations, fun, naughty, animal, wool, nature, to quarrel, dispute, discussion, to discuss, sheep, sheep, sheep, communication, communication, communication, communication, communication, talk, talk, discussion",
    credit: "suju-foto",
  },
  distance: {
    url: "https://pixabay.com/get/g3e8d82e347cf7689aa38600f7ada26221d9eb39ee8f5b9b68824c82af35e3e340181fb92ea4f07d23345e2aac348fa6f74c08db4ab31f29083f5c8fb092cfcce_640.jpg",
    alt: "church, christianity, religion, christian, catholic, altar, church pews, distance markers, church, church, church, church, church, christianity, christian, catholic, altar",
    credit: "Paul_Henri",
  },
  distil: {
    url: "https://pixabay.com/get/g6eb9db9414d1b151e0701c01d3f0980fd4adff4bcb711bab28b70715bd0aa22173610e593f7fd9085ce2d4461a0d13cc2c8aa75cb1fa980f7a50f9c63685c788_640.jpg",
    alt: "mie prefecture, oil, plant, manufacturing, pipe, nature, tank, atmospheric distillation equipment, atmospheric distillation, distillation, distiller, chimney, topper, main distillation column, yokkaichi",
    credit: "kentoshima1984",
  },
  diverge: {
    url: "https://pixabay.com/get/gf644452ae095dca35be13c84f97a1e3387ee3d8534a111dc116af44915b8ccbbeef9d6309ad13fa9f14c64f80697ee7f86a394daedcfb3644ecaa3f2de235636_640.jpg",
    alt: "anders, different, opposition, contrariety, deviation, difference, contrary, discrepancy, yin yang, divergence, different, different, different, different, different, opposition, deviation, deviation, deviation, deviation, difference, contrary, discrepancy, discrepancy, yin yang, yin yang, yin yang, yin yang, yin yang, divergence",
    credit: "berkemeyer",
  },
  dizzy: {
    url: "https://pixabay.com/get/gabaff2285aa9c082cdf380815d42b296f31ca17f547688ac3dd34234db2239cbfbccbf75e8fe26eb77dbe2b6e74fde04749206a3fab74c4863f730d86421e119_640.jpg",
    alt: "mushrooms, horsehair dizzy, helmetlings, branch, weathered, forest, fall, nature",
    credit: "jggrz",
  },
  "do not necessarily": {
    url: "https://pixabay.com/get/g5ad6c6e42988b6f6b03b9cd07adff5c412b05fc0b194bd5b0ec50bb4a4bb2bea418a9e6ff2333f42f32af0f80e3fe2f933f8d7711af500067542a19e72c1af21_640.jpg",
    alt: "please, do, not, download, this, picture, anymore, please, download, download, picture, picture, picture, picture, picture",
    credit: "FotografieLink",
  },
  "do nothing": {
    url: "https://pixabay.com/get/g928b5e114cb1f0501dc6d6e7e89f7abc65c8f5d32bb693ecfe1fea20c21df29e978f11970fe1f58ee543f89dc68c86f7be0e6f60d826f129d625d3d107717cac_640.jpg",
    alt: "lemurs, primates, animals, mammals, sleeping, zoo, zoology, biology, wildlife, nature, madagascar, portrait, two animals, bored, nothing to do, lazy, laziness, captivity, monkeys, ape, 2 animals, animal photographer, free animal pictures, editors pic, free animal pics",
    credit: "ArtisticOperations",
  },
  "doesn't": {
    url: "https://pixabay.com/get/g94b0f353a1e69c90786ce486240fd404c37029c834444fb6d4db57c727e4ae7ea9df3fc70a9281f42f9b429664786da43f74fa3c86402404e4cacf74f42dbefa_640.jpg",
    alt: "kookaburra, york bird of prey, doesn't like snakes, wildlife, green like, green snake, kookaburra, kookaburra, kookaburra, kookaburra, kookaburra",
    credit: "CountryGirl1",
  },
  doggy: {
    url: "https://pixabay.com/get/gb76fbc8d7b380c68e75ec5a15118911e73a7a650ff3cebabbf0e30e4aa9514ca491899bef9963debb49c69fe12bd515dad13e851a6e155740a25a58c81053b0d_640.jpg",
    alt: "dog, puppy, cute, animal, young animal, doggy, canine, mammal, nature, pet, domestic, domestic dog, portrait, dog portrait",
    credit: "HuyNgan",
  },
  doing: {
    url: "https://pixabay.com/get/gd2a8420db377960219435bec6808c6bc81db7815c8d545581e2cf3dffe160263bad6f0ecfe041431af5036f308682212ecc00f47dc4f6978f5f8ddc16574d01f_640.jpg",
    alt: "lettering, begin, doing, red, wall, begin, begin, doing, doing, doing, doing, doing",
    credit: "Peggy_Marco",
  },
  "don't": {
    url: "https://pixabay.com/get/g0c80962059ae757c50a36c653010371bf1ef575efb106691ff5857336b99b4123d00eb09e11cc81043430c794d10315291e769f221a3b59f8f03609b41959dc1_640.jpg",
    alt: "pocket, handkerchief, node, don't forget, memory, remember, handkerchief, handkerchief, handkerchief, handkerchief, handkerchief, don't forget, remember, remember, remember, remember",
    credit: "congerdesign",
  },
  doubt: {
    url: "https://pixabay.com/get/gb7b672c68aa027f1bbd7657ca438c937bb89f98daa0d97b2f27c2fa3690968fcabb4f6ecfbaf5d2a13b072b25a4411ffb8c33b8dc3515d29d181a70f16da31c0_640.jpg",
    alt: "doubt, portrait, doubts, idea, think, thinking, person, pondering, life, posing, doubt, think, thinking, thinking, thinking, thinking, thinking",
    credit: "danymena88",
  },
  doubts: {
    url: "https://pixabay.com/get/g722faeedacecf01989d052128859e9139cbdbe3123a8cd4f1f9dfba5a0588f26db68f139b019b559eb7fb92c5d59d05ed0b71dc0de406908fb48dd01a76020b2_640.jpg",
    alt: "doubt, portrait, doubts, idea, think, thinking, person, pondering, life, posing, doubt, think, thinking, thinking, thinking, thinking, thinking",
    credit: "danymena88",
  },
  downpour: {
    url: "https://pixabay.com/get/g978b2c6b0b75a30c2cf9976ee98a164b275fa3e2296253aa92adfb27aba4c62b4e6368dccb412e3ceff457ba0ccb95af0cf69c1137a80c187b7dc68ecf3a5566_640.jpg",
    alt: "rain shower, downpour, meadow, fog, forest, raining, landscape, nature",
    credit: "WalterBieck",
  },
  drain: {
    url: "https://pixabay.com/get/gfa34be03423995219bea7d9003a08ba514b281c36053e6fd539a369204df5a75558cc06dcf28c43b11862ac22268c10c_640.jpg",
    alt: "water, drainage, flowing, drain, nature, flow, storm drain",
    credit: "Greyerbaby",
  },
  drank: {
    url: "https://pixabay.com/get/g6db57fa5efe50bed08ad7df6c6ff177d5c29c82d096408263789b00f5255382243ee920eeacb4d713e4e767fe8fee477855e5a600b63e37f939c70ddc7901b84_640.jpg",
    alt: "seemed to be drank, heaven, human, tracks, threshold",
    credit: "hmauck",
  },
  draw: {
    url: "https://pixabay.com/get/gb1d6aa0289ab87369a0e9b2c06426189a3ee03118e401ca64522eaa230770f0fd97b560a325ae86ac14d22bfe33095ac3e183c4bd7c982b822a74df383f6526b_640.jpg",
    alt: "child, school, draw, to learn, teaching, drawing, art lessons, school, school, school, drawing, drawing, drawing, drawing, drawing",
    credit: "Tho-Ge",
  },
  dreaming: {
    url: "https://pixabay.com/get/g2b945b3a913b81928de097dce8a9157edbe4d576a2b177190904b207b0ae243d22911a10ddfc1a60b618a753a548e89f1aedc1c1ddf37bf46d0153af1e746b18_640.jpg",
    alt: "giraffe, child, nature, dream, fantasy, feeding, boy, fairytale, dreaming, nature wallpaper, giraffe, giraffe, giraffe, giraffe, giraffe, dream, dream, fantasy, fantasy",
    credit: "4144132",
  },
  dressed: {
    url: "https://pixabay.com/get/ga2611f33c1172b71fb91b6c70c121a5d095821aab6b71761a6de83f6c7d9484fdc115e8aa90a6cde7b39f171c0133bb8230bd81b012d9214e64efdf7e0beef13_640.jpg",
    alt: "flower girl, wedding, little girl, toddler girl in wedding, dressed up, dressy, wedding hall",
    credit: "JillWellington",
  },
  driving: {
    url: "https://pixabay.com/get/g2924d89e9181ce46fce53410dd75bde97f15cb0cca7e98b09589c562e90cbd526f4ba35ab1a5b80bf86ebe13984ab4163841de8efedea238ee4309fead92fc16_640.jpg",
    alt: "driver's license, driving school, driving licence, cardboard, driving instructor, traffic, road, control, driving lessons, driver's license, driving school, driving school, driving school, driving school, driving school, driving licence, driving licence, driving licence, driving licence, driving instructor",
    credit: "andibreit",
  },
  drop: {
    url: "https://pixabay.com/get/g0d63546d1376953e8d9e9bb2e1e09578fa68354a4779258099482b452ab5aa1a87b2c051eaab1763cf8874edf11c017710a540f561dab43e84f76f728c9d24ea_640.jpg",
    alt: "water drop, water, nature, drop, liquid",
    credit: "KarenPouls",
  },
  dropped: {
    url: "https://pixabay.com/get/gce6fcf12980773691f94e1cc753cd61006766f3d7225f6cdd59f8393f34f31d63e2208e4880c630698e705a89d685077_640.jpg",
    alt: "accidental slip, oops, slip, mistake, error, wrong, problem, accident, blunder, dropped, woman, girl, failure, blooper, bumbler, goof, whimsical, icre cream, cone, fail, sad girl, mess, spill, sad, brunette, pavement, ground, people",
    credit: "RyanMcGuire",
  },
  drops: {
    url: "https://pixabay.com/get/g7651f6d9829dc015d2760823876cf616e89283655b52b2f828d33d5b20d117fee9cf64d56e3c0dac27e68bb911e049267b935ce7bbcdc75af115cec95005b30a_640.jpg",
    alt: "water drop, water, nature, drop, liquid",
    credit: "KarenPouls",
  },
  drought: {
    url: "https://pixabay.com/get/g8d0eb7bbe821da270dcd6dd7a0c398fe37feecfe51a91e79779ad575d681f9df487c2b4f42f662aa0d52721f27dc1bb820100f8643bd9db65f68555605cf5159_640.jpg",
    alt: "sand, desert, dryness, hot, dry, beige, brown, nature, morocco, africa, texture, cracks, drought, earth, broken up, cracked, sand, sand, sand, sand, sand, desert, desert, africa, africa, texture, drought, drought, earth, earth",
    credit: "linaberlin",
  },
  drove: {
    url: "https://pixabay.com/get/g3743638866446a8ce67fff0f33ffe96e72044fca5dc6c23d01d064fd16548daa21d199dda6534a9b4c6e4fb5281ad0ccf28c1483f5afb2cf5b6873522bd1f32e_640.jpg",
    alt: "growth, plant, drove, young drove, branches, spring, boy shoots, plug, smaller branch, green, scion, grow, tree, close up, nature",
    credit: "Antranias",
  },
  "drug addiction": {
    url: "https://pixabay.com/get/ge986694864991f7df0de7a07d98ad5168e21bbf812345e7934aae2283faf5d3a59a1dd66df1c13efb8555382439da5edcfa662a33273c320c54c812178cfb7a7_640.png",
    alt: "stop, drug addiction",
    credit: "jorono",
  },
  "due to": {
    url: "https://pixabay.com/get/g04d3e8a79fb72c81c60ff38923e2b20487d4aa24e0476554fcab23f9b1af7c86c13c9c2b6100ef9a4a39156711c6f7629546aa6e98f867a1389ab76f0160f933_640.jpg",
    alt: "due, water, sea, nature, old, piles",
    credit: "F_Thimeradh",
  },
  earlier: {
    url: "https://pixabay.com/get/g4cc5db67313be83c3e528b0661fdc9b6e32771f445af38127d35540fb112b4af650b05cce2414cd16969c3a6aa798f5f4093037782c89a87e7457560edb3ee99_640.jpg",
    alt: "steam railway, retro, rail, historically, transport, locomotive, train, steam locomotive, nostalgic, life, earlier, rails, metal, earlier, earlier, earlier, earlier, earlier",
    credit: "kasjanf",
  },
  ears: {
    url: "https://pixabay.com/get/g726ac0c2051c0d311d14784812d4047e70d2765d60db58eaae18b63494c2171ea5ea7a28378a26d4059cec2e91bd925d5e18f842b1494528ac373d46ef1da851_640.jpg",
    alt: "rye, ear, grain, sunset, agriculture, cereal cultivation, nature, golden hour, rye, agriculture, agriculture, agriculture, agriculture, agriculture, nature",
    credit: "NickyPe",
  },
  earthquake: {
    url: "https://pixabay.com/get/g1afea97dde290dc4d372716988ed7e57e99ecb37a6729e6066605f75d6b9018cf5e1837f3447b43863b2d0d573176b36a61a1935d11ef32a3fa1202d4e1b42e4_640.jpg",
    alt: "earthquake, rubble, collapse, disaster, house, streets, onna, glimpse, alley, historical centre, earthquake, earthquake, earthquake, earthquake, earthquake",
    credit: "Angelo_Giordano",
  },
  easier: {
    url: "https://pixabay.com/get/g06727ced1fe5b23646e3292fb5f58cdc9b477f487784344bd116db099725de47a4965d9413452b5b5072ff5427af1077bd32951e236c92a8a8727213c1709b40_640.jpg",
    alt: "lawn mower, lawn, robotic lawnmower, green, nature, mow, robot, automatically, service robot, lawn robot, autonomous, grass, smart home, smart garden, vehicle, garden, green area, maintenance, maintained, rich green, tools, work easier, electric, ornamental lawn, english lawn, perfect, powerful, at work, technology, to cut, gardening, tool",
    credit: "MonikaP",
  },
  easy: {
    url: "https://pixabay.com/get/gd76d5296aea151ff691221e9fdfdd8249506ee2b14bf5659fa8d9deb3d7b561af52509c4f005c82669420a098f5dc4826944dd228b73c5faa39471be29fb6bec_640.jpg",
    alt: "soap bubbles, multicoloured, flying, make soap bubbles, soapy water, balls, hover, ease, easy, weightless, lots, soap bubbles, soap bubbles, soap bubbles, soap bubbles, soap bubbles, balls, balls, balls, hover, easy, easy, easy, lots, lots, lots, lots",
    credit: "Alexas_Fotos",
  },
  economical: {
    url: "https://pixabay.com/get/g3532ac8553d628bce0ffcd73a081ce58713d55f5ea1a0df516b0900a350896badc8c9df1d45f8c8f0b2bd841476377713d43b5c79be0a59f35f5a01ae11f3f41_640.jpg",
    alt: "people, woman, necklace, accessories, fashion, economical",
    credit: "StockSnap",
  },
  effect: {
    url: "https://pixabay.com/get/g94e6b120449581a0e23c9f9b240b629e2aa3375a28455c0f03e92f1f5493d35405c48a28aac7560434a04b997605f93b95884fd3ac4e6f724e4516cf848a507c_640.jpg",
    alt: "fantasy, light, mood, heaven, lovely, fairy tale, dream, mystical, fantasy picture, compose, atmospheric, photomontage, secret, man, effect, spiral, strange, surreal, representation, phenomenon, god, black hole, singularity, unearthly",
    credit: "KELLEPICS",
  },
  eggs: {
    url: "https://pixabay.com/get/gb87cf21517515e76fc8f578f284ab5938b060ea29989a579760c9e26189200e1efe3a24a6e9b15b569b18885ea788cbd99ab9a40f96692f4fecc6068ee93cb31_640.jpg",
    alt: "egg, egg holder, reproduction, chicken egg, food, storage, baking, cooking, egg, egg, egg, egg, egg",
    credit: "akirEVarga",
  },
  elbow: {
    url: "https://pixabay.com/get/g56beb089b1131e850178c5881209e180809091c2af18cc7f61823d7a362a73fa1ac0077fadf891a28a92b50108c343fd5f07147b36f3d9569c749eff47a94896_640.jpg",
    alt: "cafe, street, netherlands, europe, amersfoort, elbow-church, cafe, amersfoort, amersfoort, amersfoort, amersfoort, amersfoort",
    credit: "3345557",
  },
  "elephant seal": {
    url: "https://pixabay.com/get/g5c0bea418544892f59dcf17845328a5b5f4020320ec73d380547f522d3d49167d0d1f55f09a5a7cb0a28da5a4c88d10a_640.jpg",
    alt: "elephant seal, south georgia, antarctic, southern ocean, elephant seal, elephant seal, elephant seal, elephant seal, elephant seal, south georgia",
    credit: "MartinFuchs",
  },
  embarrassment: {
    url: "https://pixabay.com/get/g7e3dbd76f64d95ac7aba713da33083595dec830440abd4d7d9a19304b9fa5dfd5b022468ae8c52a41f87c6b56e9b1ed02b61a3d9644234b120a76120df70caa0_640.jpg",
    alt: "woman, model, people, nature, person, posture, embarrassment, emotions, happiness, thuja, trees, park, smile, gray smile, gray park, gray happiness",
    credit: "Sunriseforever",
  },
  emissions: {
    url: "https://pixabay.com/get/ge76e3e68b04407c47ead9c73ad253929581f61b92b40cb34678c1dbf0f281c047b3a32cb8494cd4058e52a4ea2946919_640.jpg",
    alt: "christmas background, orion nebula, emission nebula, constellation orion, nature, orion, galaxy, starry sky, space, universe, night sky, sky, astronautics, nasa, space travel, astronomy, science, research, space wallpaper, space background",
    credit: "WikiImages",
  },
  emotional: {
    url: "https://pixabay.com/get/g2900f0fe1fe5205b20da7237726fa6a8038756c96efe4df68f0585c3df901620b8797384090be3957ecf74643e31686ee106daf11646f591f45a49ec93549067_640.jpg",
    alt: "people, emotion, dramatic, female, woman, person, emotional, stress, black, sad, depressed, unhappy, tumblr wallpaper, stress, stress, stress, stress, stress, sad, sad, sad",
    credit: "1388843",
  },
  end: {
    url: "https://pixabay.com/get/g3cd78dd4ccd5d77658dfb66d5b431e6af118b818fed79e93ca922b0ec1a1a3642254ac99198a93445eaa3bce27fe859c61c2d299aef4a918aecddcca0cb0acdf_640.jpg",
    alt: "apocalypse, catastrophe, end time, armageddon, end of the world, explosion, destroyed, devastation, destruction, flame, force of nature, fire, destroy, natural disaster, big bang, atomic, atomic bomb, bomb, smoke, heat, world war, battle, explosion, fire, fire, fire, fire, fire, smoke",
    credit: "ds-grafikdesign",
  },
  endangered: {
    url: "https://pixabay.com/get/g230fc65320fa7a214a69471e238fa667dc14b0993660c07600a046d2cdff0797b116d6ef4e3042ad5d4f109bf2a1df5029a59c2929e5f8894db468354d89777d_640.png",
    alt: "tamarin, nature, cotton-top tamarin, monkey, primate, new world monkey, arboreal, diurnal, mammal, animal, wildlife, critically endangered",
    credit: "ambquinn",
  },
  endorse: {
    url: "https://pixabay.com/get/g70fcb22bc8838a02a6e86763f4eefb42381037b427a4693fa011af7568f190180da90d723c8ba8b50fc7051fa8a4edb6079fa744ac4f33ef524ca3c6327f7dcc_640.jpg",
    alt: "leather, fashion, man, escalator, monochrome, model, endorse",
    credit: "Michael_Kastelic",
  },
  energy: {
    url: "https://pixabay.com/get/g32f25158dcd739e130209583cc0a4bdb10217668f6f19d4f3035471b7831977e225188f7361817a95aece694c4fb4f22c109365c4eaac8cca18fc3e1711de3e1_640.jpg",
    alt: "windmills, fields, sunset, nature, clouds, sky, cloudsscape, dusk, twilight, wind turbines, renewable energy, horizon, wind power, wind energy, alternative energy, green energy, field, sunrise",
    credit: "Pexels",
  },
  enhance: {
    url: "https://pixabay.com/get/g4d54aa0f081f341e1bba850d29f496dd694a51dcdbe29c8ace569d08b65eaef739052c47296c75d4d992a5216ce8d3a00d50600e0c3a36634bb8774431c4acbd_640.jpg",
    alt: "eyeglasses, keyboard, workplace, e-book, laptop, computer, technology, business, desk, modern, still life, design, write, table, magnification",
    credit: "slightly_different",
  },
  ensure: {
    url: "https://pixabay.com/get/geca512e4986a0abaa663d9be1593035bb7ce2cbe822bc2a3e704b0346597b76b00509670941c35368e95f70581a59163_640.jpg",
    alt: "escalation, climb, grigri, ensure, hands, string, harness, ensure, ensure, ensure, ensure, ensure, harness",
    credit: "Ana_M",
  },
  entertain: {
    url: "https://pixabay.com/get/g555f674f8e2c45af1ca2301e406b5145ed36f02e8cd149ad171fbc99322b7091552957fdc576febf051ad6f1ecf51863ada45eb72bafb57cff8561d1ef306827_640.jpg",
    alt: "roller coaster, scare game, entertain park, fun",
    credit: "ignartonosbg",
  },
  equipped: {
    url: "https://pixabay.com/get/g1cd1f664c8d58b6ad07f92f14fbe669374846244c1460fcfbd14de7892bf832692763744dac126c4cbc4d1e4c4e992b54f6d9b6573b300068987d286cbfc283d_640.jpg",
    alt: "nikon, photo, lens, camera, slr, photographer, photographers, lenses, equipped, photography",
    credit: "Pavellllllll",
  },
  eruption: {
    url: "https://pixabay.com/get/g2400b3c5a983458b9fe5f07f0ca9c11a57c92c745895591638fcd411894cf2bd1db300c16f5d4323560432d7e16a2f2017a6684c6719889acdbe90290cb258a6_640.jpg",
    alt: "volcanic eruption, ash cloud, dramatic, geologic activity, ashes, volcano, eruption, landscape, outdoors, smoke, crater, explosion, disaster, catastrophe, smoke, smoke, smoke, smoke, smoke",
    credit: "Pexels",
  },
  escape: {
    url: "https://pixabay.com/get/g96a3600b8bdc87609ebbbbc8a308a3296b1aed0a5b2ee60ae7c452a33cd79bed822b13bc2271bb3bdd9812228a2a7e10_640.jpg",
    alt: "drink, cocktail, beach, beverage, nature, refreshment, alcoholic drink, alcoholic beverage, glass, coast, sand, shore, seashore, paradise, tropical, caribbean sea, caribbean",
    credit: "PublicDomainPictures",
  },
  establish: {
    url: "https://pixabay.com/get/g8786f98d1c99722f00c42e0d742de812187fc3734eefd2ec3318c9293652955730c5b5a895b0ce0c26e2f8c6d4ac27f1_640.jpg",
    alt: "necklace, connection, cable, to establish",
    credit: "JanvanWinsen",
  },
  establishment: {
    url: "https://pixabay.com/get/g4de60d22287f7dc40f126ec197aae4f3567745ede4d03ac596fe948f8a1cba6867dd22d712f6ecc3e73896931d2cd1d5f91f2d45426dfda442aca8c160c9efea_640.jpg",
    alt: "alcoholic beverages, bar, beer, bottles, glass bottles, liquors, alcoholic drinks, drinks, counter, pub, shelves, bar, bar, bar, bar, bar, beer",
    credit: "Pexels",
  },
  estimate: {
    url: "https://pixabay.com/get/g4cdeaeff28f543208de674dcc8e0939554323f216ab18d5f1885904fd9e39a0ba9e49edb7098a2efc25a5bce27ca584fb8183441a912381b1371189ecd6076c2_640.jpg",
    alt: "mom, girl, mother's love, care, happiness, laughter, hug, entertainment, excursion, walk, nature, joy, estimate, laughter, laughter, laughter, laughter, laughter",
    credit: "Petrucy",
  },
  "even so": {
    url: "https://pixabay.com/get/g23c7267c207294de2c617aab2db62564a7fd263baee0157e6e637f3cc720cfef47f89a93d5b3a4988cd8fb206d56f9f6453c4b5080ea8a687f759f6cf8dbd9ea_640.jpg",
    alt: "evening atmosphere, nature, water, so, sunset, romance, lake",
    credit: "minka2507",
  },
  evening: {
    url: "https://pixabay.com/get/g4ef6dcbda4d68a7c096dfef8b80e8df4e13795ac3911e0f9845007b5a1c5b580ab71c70597a0232984e0a3c0f7b5efa92672b9af3dbcac45c783becb1b8abf18_640.jpg",
    alt: "sunset, sun, evening sky, clouds, evening atmosphere, setting sun, panorama, heaven, afterglow, trees, romance, mood, sunlight, romantic, evening hours, evening, dusk, distance, atmospheric, horizon, the atmosphere, landscape, nature, red, quiet, orange, sun, evening sky, evening sky, heaven, heaven, romance, romance, romance, romance, romantic, evening, evening, evening, evening, evening, red",
    credit: "NoName_13",
  },
  evenly: {
    url: "https://pixabay.com/get/g7888519334450bdbafffc008c08e59cd264962fe9e55e734d30d7c30ee710552a9a11fe10156016310528394dc19ced76ce8e947b689ddeccd397127bb77e9ed_640.jpg",
    alt: "rattan, braid, plastic, braided, basket weave, structure, wattle, template, evenly, texture, weave, close up, regularly, garden furniture, rattan, rattan, rattan, rattan, rattan, braid, weave, weave, weave, weave",
    credit: "Alexas_Fotos",
  },
  eventually: {
    url: "https://pixabay.com/get/ge3b8a28185f3e626bc79ba92bffe23bbe603450abfabf70a826ddb0d7f237e253f72c63fed172d3ad66d6cdf8fdd1c2909b7b135719ae1fb314903b271eb82be_640.jpg",
    alt: "corn, vegetable, food, agriculture, green, yellow, eventually, background, natural, organic, sweet, fresh, farm, summer, plant, healthy, leaf, kitchen",
    credit: "outsideclick",
  },
  ever: {
    url: "https://pixabay.com/get/gb76f7627c67e882ae2033f1e9707ef5c3605a02d0c1e4c9f0bced25bfc46a967442550368af2ad2d5bb6fac66c71cb0dea1774c7d02323f37746621b84c14528_640.jpg",
    alt: "park, attraction, army, historical, soldiers, history, land of the ever",
    credit: "Pier52",
  },
  evidence: {
    url: "https://pixabay.com/get/gb3163a82c9175bbdc247a6ead6726b0ec469a8e715c0e98ae95a4ba6da2a7dabb10b264c0c66a5fac72db3fda46a24520dd20302bf7c333a34deb67bddc8632c_640.jpg",
    alt: "magnifying, glass, detective, looking, lens, proof, lead, investigate, research, eyeball, focus, vision, eye, surprise, evidence, examine, see, funny, 404, error, page, not found, inspection, gray funny, gray eye, gray zoom, gray glass, gray research, gray glasses, gray surprise, gray vision, gray focus, detective, detective, detective, detective, detective, proof, proof, investigate, research, research, research, research, focus, focus, focus, surprise, surprise, surprise, evidence, evidence, see, see, funny, inspection, inspection",
    credit: "Tumisu",
  },
  examine: {
    url: "https://pixabay.com/get/gd6d08c99f9119f8f4f06a050df5cf4b5c19ead5a4eac5748bb63c0a841bc7d7b9a02eceb909a503970899a92f7b87dc3d19aa7380757c1a375b59a54fa60e6c0_640.jpg",
    alt: "chemistry, lab, experiment, chemist, researcher, microscope, examine, experiments, laboratory, equipment, doctor, hospital, medic, chemical, examination, treatment, health, research, test, chemistry, chemistry, chemistry, chemistry, chemistry, lab, laboratory, chemical, chemical, chemical",
    credit: "deepakrit",
  },
  excitement: {
    url: "https://pixabay.com/get/g2222f4a6b62718c005fbac7169b05cd7bb9db72f4204f905b4fdd4b476b4b4b62223e23a5bc1e395334bca00f519f7afb9fad9989d8865abfd69f4d2f93ebc0b_640.jpg",
    alt: "blonde, girl, bridge, fun, happy, joy, jumping, jump, backpack, outdoors, schoolbag, happiness, excitement, bridge, bridge, bridge, bridge, bridge, fun, fun, happy, joy, joy, joy, joy, jumping, jumping, jump, jump, jump, backpack, backpack, happiness, excitement, excitement, excitement, excitement",
    credit: "Pexels",
  },
  exercise: {
    url: "https://pixabay.com/get/g3e247bc44c9600029a73b8a00a411393c235203345fff1b2ba2d7f7ec70cc40351cbad694a8869477dd89dbe3df58f839b204aabd3fe4800566452a4eb988d52_640.jpg",
    alt: "dumbbells, shoes, sneakers, rubber shoes, fitness, gym, training, workout, exercise, health, fit, strength, bodybuilding, pilates, trainer, running shoes, cardio vascular, physio therapy, wellness, shoes, shoes, fitness, fitness, fitness, fitness, gym, gym, gym, gym, workout, exercise, exercise, exercise, exercise, exercise, health, health",
    credit: "stevepb",
  },
  exhibition: {
    url: "https://pixabay.com/get/g878c825d384c59348b40f4f57d3750f37b8b288b0a1c8ceb62c0d8fc67b0e0a5cf76fbdc1c4eab1c88c60d994b5e6203623200d775c0491ceaf4b8f95bd1b0ea_640.jpg",
    alt: "visitors, exhibition, see, museum, art, gallery, exhibition, museum, museum, museum, museum, museum, gallery, gallery, gallery",
    credit: "Peggy_Marco",
  },
  exit: {
    url: "https://pixabay.com/get/g2674c16ff371be1b08df6b99ec71ffcbef858577d991bfc93e2820ba42b574fd82ed38d9dfdd1bde32cd7a11940bde9e_640.jpg",
    alt: "emergency exit, exit, escape route, web, exit, exit, exit, exit, exit",
    credit: "Riedelmeier",
  },
  expand: {
    url: "https://pixabay.com/get/g5061e0bbf94b7623799741a61d41cf7a3e68b8df3240b58474f0b06e62312e61e4469ffe943d39102b95303af3f6163cd8d7cb5006adde9a175b499848611d28_640.jpg",
    alt: "laundry, dry, sun, wind, expand, nature, dangle, air free, tea towel",
    credit: "siala",
  },
  expansion: {
    url: "https://pixabay.com/get/gc8b3886740e88f06a6210c1cb6859a7df3cdcaf82d27001b2c553cc59b02fce0f192f189669e5c95fbc2048ed60cd218b8e3752d881c1d51743de85c80349b0a_640.jpg",
    alt: "travel, flight, schedule, ad, plan, departure, airport, time, traffic, transport, airport, airport, airport, airport, airport",
    credit: "wal_172619",
  },
  experience: {
    url: "https://pixabay.com/get/gcf0c8352affaf8c8509d18dcba99cf23d592f144bef203fe0630fcaa7af1652ee6cab4c1bd4881063b6cde22aab6b680a5892f5d2643801033fdb37dbc0f1252_640.jpg",
    alt: "camping, picnic, lunch, dining, travel, tour, experience, vietnam, nature, landscape",
    credit: "xuanduongvan87",
  },
  explanation: {
    url: "https://pixabay.com/get/gedd3d7fa02b095a5bd78392451174c6acfcd7d3b826790743ce9dce589117acc04a07a1742e7eea2843b07ba0e5915960f2394af1852efb9b834202634b112cf_640.jpg",
    alt: "parents and sons, curiosity, explanation, beach, nature, vacation, beira mar, cottage, support, answer",
    credit: "taniadimas",
  },
  express: {
    url: "https://pixabay.com/get/g21a2e8d3bb2a45e38fa45d43d4263136f737368b47f883e481a94bbc86d0fe05e8701c53b4607d036b452a269729fc568b5ccfbe818d68c6adf6a1b7d7bb2cd5_640.jpg",
    alt: "express pot, pressure cooker, express cooking pot, steamer, pressure cooker, pressure cooker, pressure cooker, pressure cooker, pressure cooker",
    credit: "AnnRve",
  },
  extend: {
    url: "https://pixabay.com/get/gb2adae53552d12d89c0257e6cc3fa325ee265abbbe15fcea67ffddad5141c63ae5c485c820acfebd0ea588ce9b294f04517e9090b432a5f19616b57bc5413c10_640.jpg",
    alt: "hefei, sky, building, green, city, living foods, nature, extend, develop, prosperity, heifei city",
    credit: "qxiaofeixia2016",
  },
  extinction: {
    url: "https://pixabay.com/get/g5bf0ed3a0edec88baed29cf3f6687863cd321b4ceed2ffb0e7b9024656eeef479d442958447172b966bfc4659a28ef1b2b34dae0525e09dacd17bec9848dc95a_640.jpg",
    alt: "feline, lynx, canadian lynx, mammal, biodiversity, extinction, nature, lynx, lynx, lynx, lynx, lynx, canadian lynx, canadian lynx",
    credit: "NathalieBurblis",
  },
  eyebrow: {
    url: "https://pixabay.com/get/ga450baaa4dc7963a72520759dfc401dd6d0255d58e3f5f357eae9f36156b92a9ac36fc0929631e43e9d4ef96aa9359f5c0fbc0bae01268bef291242e23a26027_640.jpg",
    alt: "children's eyes, eyes, blue eyes, emotion, feelings, expression, small child, sadness, cry, sad, eyelashes, eyebrows, cry, cry, cry, cry, cry",
    credit: "Myriams-Fotos",
  },
  eyes: {
    url: "https://pixabay.com/get/ge952ba44688f02267eb5f1451ede36eae5de3f4c139718ecebc7ea716dc5bca73d712bcc0a2d71871d98a2bebf9c877b69361039a9071b15ec10dfb2b2cee335_640.jpg",
    alt: "eye, vision, sight, macrography, portrait, girl",
    credit: "jonaszara",
  },
  "face something unpleasant": {
    url: "https://pixabay.com/get/g862f5ce7ee5a902a92fbb040b7f461112d097471e5f6c33353ebc9595b6ce5d6731ebbeb08e45235d16b615875805d70_640.jpg",
    alt: "sneaky cat, looks, teeth or something",
    credit: "KingsRoz",
  },
  fails: {
    url: "https://pixabay.com/get/g337d4c73a24e18d8202f4e6e14a5f76e499bb138d8e1faa5d5a7efd059cb25dc66fa696c9a30883c6f972a3a42fe71f85e33bbf09259fb9fa08bbefd5ff9bcd4_640.jpg",
    alt: "fail, nature, water, wake-board, drop, young, sky, wash",
    credit: "nemo88",
  },
  failure: {
    url: "https://pixabay.com/get/g67564a89a795d892922ab1bb9b5430434eeb3b8e379626f97c863ad671ebff681e48b4af118a02097027460498ca7c3e6b9d3e546fd10a9e3e4c5572c8ae5c0e_640.jpg",
    alt: "blackout, power failure, electricity, energy, crisis, problem, failure, blackout, blackout, blackout, blackout, blackout, failure",
    credit: "Alexandra_Koch",
  },
  faint: {
    url: "https://pixabay.com/get/gdc3e6e3237fbf193153ed0f0b76751eaf044dfbca44513df806b65a3ba2404b3b147b40337e68350610987a31c3215c9e504d6b8be454d912c0af4291fa734c2_640.jpg",
    alt: "rocky road, route, wall, rock, a faint light, shade, rocky road, route, route, route, route, route",
    credit: "Yamadeen",
  },
  falling: {
    url: "https://pixabay.com/get/g0b08b2fe487d5bf8c111c419faabb9d61065378ad11140cb02ab2a8cd188042ddd1cbad8aee8465b27cff32a024b49f486e3ae979855277bb8495c601b385a6f_640.jpg",
    alt: "fall, leaves are falling, golden, landscape, church, houses, sunrise, forest, light, sunbeams, sunlight, black forest, nature, fall, church, church, church, church, church",
    credit: "Couleur",
  },
  farming: {
    url: "https://pixabay.com/get/g969d75250fa474ab7e939761e1a80e8cbce42d910d4d31f0470ec68dffbd443529527030652c0deb5b14854f0e049203edd224020f8b0ac5f899fb087bc19a4b_640.jpg",
    alt: "rice field, paddy field, agriculture, farming, farm, nature, green, rice field, agriculture, agriculture, agriculture, agriculture, agriculture, farming, farm",
    credit: "ignartonosbg",
  },
  fast: {
    url: "https://pixabay.com/get/g3913a0974a5aa5e99064cb0098f893d1ede4c7fe4ae8c2c1b72c76f232c2d3d871d31e1c8736eac0a9760bdcc70127a2e954aefcca823226124e5a06e842993f_640.jpg",
    alt: "french fries, potato, fast food, chips, chips, chips, chips, chips, chips",
    credit: "Fotorech",
  },
  feather: {
    url: "https://pixabay.com/get/g9ab0a48917e116b74291b32a4f7b96dec38ca5056bdf2f009e37cf6e8959351c8e38fd26e051f93628ed377aaacc0cca1036b63212e80d5842de742157d7a563_640.jpg",
    alt: "feather, nature wallpaper, ease, slightly, blue, airy, close up, featherweight, flying, nature background, wind, beautiful nature, hd wallpaper, lightweight, nature, ostrich feather, fluffy, swing, float, cool wallpaper",
    credit: "Sponchia",
  },
  fee: {
    url: "https://pixabay.com/get/g95ae4e95fcde0a1be4e5f448809cf41630cf0d1e149aa523510ab5cbd5863f72972be7b183525880de2ca15c79d0f2d2a3c96f811c06d1c84c8d39def83a3f45_640.jpg",
    alt: "mountain, nature, hiking, alps, glacier, switzerland, saas-fee",
    credit: "Der_Thiemo",
  },
  feedback: {
    url: "https://pixabay.com/get/g8f4f4187a03955812f3438b2c63b56a2ab6ff024ae15bb8176051aa24191bfc7f82f2237856ba98fa32711b8a16a584e79c48ee65e4bdc6655dfd072b3ff1a34_640.jpg",
    alt: "return, feedback, news, board, chalk, fonts, dialog, discussion, communicate, converse, communication, social, confirmation, support, conversation, feedback, feedback, feedback, feedback, feedback",
    credit: "geralt",
  },
  fell: {
    url: "https://pixabay.com/get/g09332225b4ae450a6319d98b2b2f1c76b558d9ff91b8933ff1f43adb8b4aa526905d615b44130b0abc629e63c2dbd8a1edda0de607dc1d4a1ed823f63f60baa8_640.jpg",
    alt: "cow, calf, cattle, brown cow, nature, brown calf, cub, brown fell, bovine, livestock farming, beef, animal, ruminant, the world of animals",
    credit: "NickyPe",
  },
  ferry: {
    url: "https://pixabay.com/get/gfa12c7faf42198ae4af16e8afd23e75d4e8705eb58a85085feea6f0c872ce3ed51160c0d9ff3b5793229e29e348d480f4b8f53660e2c89b6d2d31f84bf52cfab_640.jpg",
    alt: "boat, ferry, vessel, tourism, vacation, ship, transportation, twilight, nature, ocean, scenery, dock",
    credit: "KAMcMillan",
  },
  fever: {
    url: "https://pixabay.com/get/gc29ac01851629cd268bfb9e89d0cc6e4c5d79bf40f7e6f5e0c1b490bfe5f56bf0cd21bf784005af9a565956d5191b2399159c22bce62fac2ccdf9a8792d9f6a8_640.jpg",
    alt: "thermometer, medications, tablets, medicine, cure, pharmacy, medical, capsules, pharmaceutical, pharmacology, medical drugs, pills, prescription, prescription drugs, healthcare, pharmacist, temperature, antibiotics",
    credit: "stevepb",
  },
  field: {
    url: "https://pixabay.com/get/g93dac58e48ee98ae3d40f6a3fb4846e3408a7f6f6191ae9df5619fc7937006a8d4af3c728438a3d90d054fb9750c4eee3c6395c43596b2beb84269a19d815518_640.jpg",
    alt: "nature, landscape, field, grain field, expanse, contrast, color contrast, spring, spring landscape, nature, landscape, field, field, field, grain field, contrast, spring, spring, spring, spring, spring, spring landscape",
    credit: "shogun",
  },
  fierce: {
    url: "https://pixabay.com/get/gb70ad1e3d9bd92cd8849b1c0f095f6a59b27315b220abfe2b7086bf9fe6b6f05bb33c2adf7aaad0e58d7083078f8a115765986b3dfe27581baedf9bae2362a96_640.jpg",
    alt: "animal, mammal, species, fauna, fierce, nature, lemur",
    credit: "RaKr_2",
  },
  filing: {
    url: "https://pixabay.com/get/g46077beb106528df3c17545cfc358c4039a43498a8999f46d6bc76421c0d5d5fb08e8d5fb4df88e37fa2e200da91d161533b45dce1a3893a8ded0146edba4fd3_640.jpg",
    alt: "files, paper, office, paperwork, stack, work, data, folders, pile, organize, storage, archive, documentation, catalog, monochrome, black and white, files, files, files, paper, paper, paper, paper, paper, office, office, paperwork, paperwork, paperwork, paperwork, work, data, data, data, data",
    credit: "myrfa",
  },
  "fill in": {
    url: "https://pixabay.com/get/gcb4889d5e28ec2187798364b9b6140b2f923419b268fb88ad8de2286a5617b5c2af6da1133e42bfad265e441f4682bf53e7050ac92720eead98af1f080c07ff2_640.jpg",
    alt: "super, petrol, gas station, refuel, fuel, fill in, petrol, petrol, petrol, petrol, petrol, gas station, gas station, fuel, fuel, fuel",
    credit: "beejees",
  },
  films: {
    url: "https://pixabay.com/get/ga5331a4b5c9c604daf147da82922dfd8e7f4fe188ffec2b2aa42aad13a3c5e7d1002e4de01a1beba0870811c27c580de6b783c1633a3f3bd98add95b5fd79257_640.jpg",
    alt: "retro film, 35mm film, perforated, negative on pink background, with shadow, photo film, vintage film, film photography, analog film, vintage photography, retro photo",
    credit: "Kitos_LAB",
  },
  final: {
    url: "https://pixabay.com/get/gb1e52e19cd12ce9eada97f8d98ce5eda9711a9a24584f59fecc2d08e4ffb345eda0eab4b6d4739ed4a728e08e1dd33319d906b1f468306fdf8291b20be0b0810_640.jpg",
    alt: "dry leave, final, yellow, park, nature",
    credit: "fernandozhiminaicela",
  },
  finalise: {
    url: "https://pixabay.com/get/g7c983521936e3b77ba595cd3e6b06b30f6156b66a3f5fc12d8297e5ff2169acacb2bd02eb96275af6b1e8d5ff457b9dbdb6501eb123ec5b53ae65ce2d892b9cb_640.jpg",
    alt: "field hockey, 2016 olympics, rio, ladies, final, commit, field hockey, field hockey, field hockey, field hockey, field hockey, commit",
    credit: "Matthias_Lemm",
  },
  "find by chance": {
    url: "https://pixabay.com/get/g70ea1975d26797281b249c92fb52322a4b7b1b9cd7b9e64a42934b87eee800b8172e87707658c3d0b2471e6599f2e16d845fa0b8283ab769e99a5af5886f69e0_640.jpg",
    alt: "dice, game, monochrome, roll the dice, board game, random, lucky dice, play, gambling, cube, black and white, dice, dice, dice, dice, dice, game, game, game, random, random, gambling, gambling",
    credit: "955169",
  },
  finding: {
    url: "https://pixabay.com/get/ge31940e31bbfee5064f60826a64c483ca853282eee044ed2fe64cbaff7ea4b436c50bfc7223d777d0e6715762e4aa11776fe292598b2e560f115febd539ee0f0_640.jpg",
    alt: "sculpture, women, girl, statue, looking, finding, monument, finding, finding, finding, finding, finding",
    credit: "lecreusois",
  },
  finger: {
    url: "https://pixabay.com/get/g6ca97cbb86247a59adecaf0e692f1f3a5f2870d178b3feac526249f592309d398410b495d37b28bf0539b4d0d3721e31ef2f6d8a224d1fb10fe59f43ebced68a_640.jpg",
    alt: "hands, heart, finger, symbol, love, love, love, love, love, love",
    credit: "congerdesign",
  },
  fingers: {
    url: "https://pixabay.com/get/g9ed266ae169cea56086cafbd4e8d9f6119c5c754c15b626989282d95be60736dd8bbb1b7d4d0d6e6d1f0d15304c58b3177046b243af42cd0124ebf5e3b649cba_640.jpg",
    alt: "hands, heart, finger, symbol, love, love, love, love, love, love",
    credit: "congerdesign",
  },
  finished: {
    url: "https://pixabay.com/get/g3b5e552ad17997b39d10a8b2815462dd823ffd4599ab23bd1be7059c48f94a979ca29d0c9268aec8e5cba637ccfc475ff1e12fb63080426588296041033b4b56_640.jpg",
    alt: "hand, product, finished goods",
    credit: "KaweewatT",
  },
  fire: {
    url: "https://pixabay.com/get/ga2cbad89a1351cb7c72cb5d617798532f8d94290ad2fb54174082709320f00e742dec48e40bedd7bd3e22c3730cee29ee5c242781a7d9998e15a07bfc76004ea_640.jpg",
    alt: "fire, flames, red, hot, burn, orange, black fire, fire, fire, fire, fire, fire",
    credit: "RonaldPlett",
  },
  firm: {
    url: "https://pixabay.com/get/g868997dcaf6b400a7bd1e0c28fd063bfcf4403295aece724f93e1eb2ea68734a4e13e0160c601dd0c277328235d5d209896135cada7ab4b00898f12624918495_640.jpg",
    alt: "firm, contract, person signing a document, firm, contract, contract, contract, contract, contract",
    credit: "godoycordoba",
  },
  fit: {
    url: "https://pixabay.com/get/g1c200b358df6f9930138165b49757fba6d02db684335d50a37b14c177149f1e7f7b9e69338aedac2dc93a837b2ebfbc7_640.jpg",
    alt: "sports, gymnastics, frog, fun, fitness, fit, athletic, training, gymnastics, gymnastics, gymnastics, gymnastics, frog, frog, frog, frog, frog, fitness, fitness, fitness, training, training, training",
    credit: "Alexas_Fotos",
  },
  fits: {
    url: "https://pixabay.com/get/g74309a75e89a4ce1562a4d88508f90ded9474a1baac2ae9a58eda2defbe23d56f78f9740c8c6304ca77701ecf001121c_640.jpg",
    alt: "sports, gymnastics, frog, fun, fitness, fit, athletic, training, gymnastics, gymnastics, gymnastics, gymnastics, frog, frog, frog, frog, frog, fitness, fitness, fitness, training, training, training",
    credit: "Alexas_Fotos",
  },
  fix: {
    url: "https://pixabay.com/get/ge7edc38343c2bf0073ee9ec15013f7c7f9119db80cbb48c29620b12e7d924d391fc88b2da24ff2ee997b8eb447a76d95_640.jpg",
    alt: "tools, hammer, wrench, screw, nails, nut, kit, spanner, fix, objects, work, job, construction, isolated, tools, tools, tools, tools, tools, hammer, construction, construction",
    credit: "PublicDomainPictures",
  },
  fled: {
    url: "https://pixabay.com/get/g3e7942cfbac298b18d117d2db96f3851be5ecca39f45573c63322a2bb8a114c6cf745783f25279442fc2b1535d49697b987dd5e730daf88515822de7f3614627_640.jpg",
    alt: "woman, face, eye, iris, face mask, mouth guard, girl, young, female, macro, rebellion, resistance, escape, fled, show me, climate justice, leave no one behind, close up, refugee, refugees welcome, no one is illegal, humanity, justice, peace",
    credit: "citypraiser",
  },
  flew: {
    url: "https://pixabay.com/get/gde6fcece3657a62e18af946fd505fa987db14af1a93bc784b6d7f715a8eff1e31591955d6a6760be5169b9e700f55ae1d29330fb98799a6275f4c509b2b42db0_640.jpg",
    alt: "plane, jet, military, flew, eurofighter, fighter plane, air force, military maneuvers, military aircraft, eurofighter, eurofighter, eurofighter, eurofighter, eurofighter",
    credit: "Netloop",
  },
};
