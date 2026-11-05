// Authored translate questions, one per lesson: the prompt describes the idea (it never gives the
// sentence away) and `say` lists the accepted wordings, most canonical first. Reviewed by hand.
export type TranslateIdea = { idea: string; say: string[] };
export const TRANSLATE_IDEAS: Record<string, TranslateIdea> = {
  a1p10l1: {
    idea: "Say that it is sunny and warm today.",
    say: [
      "It's sunny and warm today.",
      "Today is sunny and warm.",
      "The weather is sunny and warm today.",
    ],
  },
  a1p10l2: {
    idea: "Say that it will rain tomorrow.",
    say: ["It will rain tomorrow.", "It's going to rain tomorrow.", "Tomorrow it will rain."],
  },
  a1p10l3: {
    idea: "Say that the wind is very strong tonight.",
    say: [
      "The wind is very strong tonight.",
      "It is very windy tonight.",
      "There is a strong wind tonight.",
    ],
  },
  a1p10l4: {
    idea: "Say that there is fog on the road.",
    say: ["There is fog on the road.", "The road is foggy.", "The road is covered in fog."],
  },
  a1p10l5: {
    idea: "Say that spring is warm and wet.",
    say: ["Spring is warm and wet.", "Spring is warm and rainy.", "The spring is warm and wet."],
  },
  a1p11l1: {
    idea: "Say that the book costs ten dollars.",
    say: ["The book costs ten dollars.", "The book is ten dollars.", "The book costs $10."],
  },
  a1p11l2: {
    idea: "Say that you do not have any change.",
    say: ["I don't have any change.", "I haven't got any change.", "I have no change."],
  },
  a1p11l3: {
    idea: "Say that you want to pay by card.",
    say: ["I want to pay by card.", "I'd like to pay by card.", "I'll pay by card."],
  },
  a1p11l4: {
    idea: "Say that you lost your wallet.",
    say: ["I lost my wallet.", "I've lost my wallet.", "My wallet is lost."],
  },
  a1p11l5: {
    idea: "Say that she saves a little money every month.",
    say: [
      "She saves a little money every month.",
      "Every month she saves a little money.",
      "She saves some money every month.",
    ],
  },
  a1p12l1: {
    idea: "Say that your father is a driver.",
    say: ["My father is a driver.", "My dad is a driver.", "My father drives for a living."],
  },
  a1p12l2: {
    idea: "Say that your friend works as a nurse.",
    say: [
      "My friend works as a nurse.",
      "My friend is a nurse.",
      "My friend works as a nurse in a hospital.",
    ],
  },
  a1p12l3: {
    idea: "Say that the teacher is in the classroom.",
    say: [
      "The teacher is in the classroom.",
      "The teacher is in class.",
      "The teacher is inside the classroom.",
    ],
  },
  a1p12l4: {
    idea: "Say that the pilot flies to Paris.",
    say: [
      "The pilot flies to Paris.",
      "The pilot is flying to Paris.",
      "The pilot flies a plane to Paris.",
    ],
  },
  a1p12l5: {
    idea: "Say that the plumber is coming tomorrow.",
    say: [
      "The plumber is coming tomorrow.",
      "The plumber comes tomorrow.",
      "The plumber will come tomorrow.",
    ],
  },
  a1p13l1: {
    idea: "Say that your cat sleeps all day.",
    say: ["My cat sleeps all day.", "My cat sleeps all day long.", "My cat sleeps the whole day."],
  },
  a1p13l2: {
    idea: "Say that the horse is running in the field.",
    say: [
      "The horse is running in the field.",
      "The horse runs in the field.",
      "The horse is running across the field.",
    ],
  },
  a1p13l3: {
    idea: "Say that the chicken is in the garden.",
    say: [
      "The chicken is in the garden.",
      "The hen is in the garden.",
      "There is a chicken in the garden.",
    ],
  },
  a1p13l4: {
    idea: "Say that you saw a big bear at the zoo.",
    say: [
      "I saw a big bear at the zoo.",
      "I saw a large bear at the zoo.",
      "At the zoo I saw a big bear.",
    ],
  },
  a1p13l5: {
    idea: "Say that the mouse is small and grey.",
    say: [
      "The mouse is small and grey.",
      "The mouse is little and grey.",
      "The mouse is grey and small.",
    ],
  },
  a1p14l1: {
    idea: "Say that your birthday is in March.",
    say: [
      "My birthday is in March.",
      "My birthday is in the month of March.",
      "I have my birthday in March.",
    ],
  },
  a1p14l2: {
    idea: "Say that there are sixty minutes in an hour.",
    say: [
      "There are sixty minutes in an hour.",
      "An hour has sixty minutes.",
      "An hour is sixty minutes long.",
    ],
  },
  a1p14l3: {
    idea: "Say that the shop is closed on Sundays.",
    say: [
      "The shop is closed on Sundays.",
      "The shop is closed on Sunday.",
      "The shop doesn't open on Sundays.",
    ],
  },
  a1p14l4: {
    idea: "Say that the lesson is on Thursday afternoon.",
    say: [
      "The lesson is on Thursday afternoon.",
      "We have the lesson on Thursday afternoon.",
      "On Thursday afternoon we have the lesson.",
    ],
  },
  a1p14l5: {
    idea: "Say that you go to bed at midnight on Saturdays.",
    say: [
      "I go to bed at midnight on Saturdays.",
      "On Saturdays I go to bed at midnight.",
      "I go to bed at midnight on Saturday.",
    ],
  },
  a1p15l1: {
    idea: "Say that the table is round.",
    say: ["The table is round.", "It is a round table.", "The table is a circle."],
  },
  a1p15l2: {
    idea: "Say that the box is big and square.",
    say: ["The box is big and square.", "The box is large and square.", "It is a big square box."],
  },
  a1p15l3: {
    idea: "Say that the road is long and narrow.",
    say: [
      "The road is long and narrow.",
      "It is a long, narrow road.",
      "The road is long and thin.",
    ],
  },
  a1p15l4: {
    idea: "Say that your bag is small but heavy.",
    say: [
      "My bag is small but heavy.",
      "My bag is small, but it is heavy.",
      "My bag is heavy, but small.",
    ],
  },
  a1p15l5: {
    idea: "Say that the lake is deep and wide.",
    say: [
      "The lake is deep and wide.",
      "It is a deep and wide lake.",
      "The lake is wide and deep.",
    ],
  },
  a1p16l1: {
    idea: "Say that you eat breakfast at eight o'clock.",
    say: [
      "I eat breakfast at eight o'clock.",
      "I have breakfast at eight o'clock.",
      "I eat breakfast at eight.",
    ],
  },
  a1p16l2: {
    idea: "Say that you leave home at half past eight.",
    say: [
      "I leave home at half past eight.",
      "I leave the house at half past eight.",
      "I leave home at 8:30.",
    ],
  },
  a1p16l3: {
    idea: "Say that you brush your teeth before bed.",
    say: [
      "I brush my teeth before bed.",
      "I brush my teeth before I go to bed.",
      "Before bed I brush my teeth.",
    ],
  },
  a1p16l4: {
    idea: "Say that she does the shopping on Saturdays.",
    say: [
      "She does the shopping on Saturdays.",
      "She goes shopping on Saturdays.",
      "On Saturdays she does the shopping.",
    ],
  },
  a1p16l5: {
    idea: "Say that you tidy your room on Sundays.",
    say: [
      "I tidy my room on Sundays.",
      "I clean my room on Sundays.",
      "On Sundays I tidy my room.",
    ],
  },
  a1p17l1: {
    idea: "Ask the teacher to repeat the question.",
    say: [
      "Can you repeat the question, please?",
      "Could you repeat the question, please?",
      "Please repeat the question.",
    ],
  },
  a1p17l2: {
    idea: "Say that you forgot your pencil case.",
    say: [
      "I forgot my pencil case.",
      "I have forgotten my pencil case.",
      "I left my pencil case at home.",
    ],
  },
  a1p17l3: {
    idea: "Say that the teacher is writing on the board.",
    say: [
      "The teacher is writing on the board.",
      "The teacher writes on the board.",
      "The teacher is writing on the whiteboard.",
    ],
  },
  a1p17l4: {
    idea: "Ask to borrow a ruler.",
    say: [
      "Can I borrow a ruler, please?",
      "Could I borrow a ruler, please?",
      "May I borrow a ruler?",
    ],
  },
  a1p17l5: {
    idea: "Say that the lesson starts at ten o'clock.",
    say: [
      "The lesson starts at ten o'clock.",
      "The lesson starts at ten.",
      "The lesson begins at ten o'clock.",
    ],
  },
  a1p18l1: {
    idea: "Say that the music is too loud.",
    say: ["The music is too loud.", "The music is very loud.", "This music is too loud."],
  },
  a1p18l2: {
    idea: "Say that your room is clean and quiet.",
    say: [
      "My room is clean and quiet.",
      "My room is quiet and clean.",
      "My room is clean, and it is quiet.",
    ],
  },
  a1p18l3: {
    idea: "Say that the coffee is hot and sweet.",
    say: [
      "The coffee is hot and sweet.",
      "The coffee is sweet and hot.",
      "This coffee is hot and sweet.",
    ],
  },
  a1p18l4: {
    idea: "Say that the street is dark at night.",
    say: [
      "The street is dark at night.",
      "The road is dark at night.",
      "It is dark on the street at night.",
    ],
  },
  a1p18l5: {
    idea: "Say that your bag is full of books.",
    say: ["My bag is full of books.", "My bag is full with books.", "My bag is full of my books."],
  },
  a1p19l1: {
    idea: "Say that you need milk and eggs.",
    say: ["I need milk and eggs.", "We need milk and eggs.", "I need some milk and some eggs."],
  },
  a1p19l2: {
    idea: "Say that the shop is open until ten.",
    say: [
      "The shop is open until ten.",
      "The shop is open until ten o'clock.",
      "The shop closes at ten.",
    ],
  },
  a1p19l3: {
    idea: "Ask where the bread is.",
    say: ["Where is the bread?", "Where can I find the bread?", "Which aisle is the bread in?"],
  },
  a1p19l4: {
    idea: "Say that the apples are on sale today.",
    say: [
      "The apples are on sale today.",
      "The apples are on sale this week.",
      "Apples are on sale today.",
    ],
  },
  a1p19l5: {
    idea: "Ask the cashier for a bag.",
    say: ["Can I have a bag, please?", "Could I have a bag, please?", "May I have a bag, please?"],
  },
  a1p1l1: {
    idea: "Say that there are three children in the garden.",
    say: [
      "There are three children in the garden.",
      "Three children are in the garden.",
      "In the garden there are three children.",
    ],
  },
  a1p1l2: {
    idea: "Say that there are two mice in the kitchen.",
    say: [
      "There are two mice in the kitchen.",
      "Two mice are in the kitchen.",
      "In the kitchen there are two mice.",
    ],
  },
  a1p1l3: {
    idea: "Say that there are four shelves in your room.",
    say: [
      "There are four shelves in my room.",
      "My room has four shelves.",
      "I have four shelves in my room.",
    ],
  },
  a1p1l4: {
    idea: "Say that you buy two boxes of tomatoes.",
    say: [
      "I buy two boxes of tomatoes.",
      "I'm buying two boxes of tomatoes.",
      "I bought two boxes of tomatoes.",
    ],
  },
  a1p1l5: {
    idea: "Say that the fish live in the river.",
    say: [
      "The fish live in the river.",
      "Fish live in the river.",
      "The fish are living in the river.",
    ],
  },
  a1p20l1: {
    idea: "Say that the bus is late again.",
    say: ["The bus is late again.", "The bus is late once more.", "The bus is late again today."],
  },
  a1p20l2: {
    idea: "Say that you go to school by bike.",
    say: ["I go to school by bike.", "I cycle to school.", "I ride my bike to school."],
  },
  a1p20l3: {
    idea: "Ask when the next train leaves.",
    say: [
      "When does the next train leave?",
      "When is the next train?",
      "What time does the next train leave?",
    ],
  },
  a1p20l4: {
    idea: "Say that you need a taxi to the station.",
    say: [
      "I need a taxi to the station.",
      "I need a taxi to get to the station.",
      "I need a cab to the station.",
    ],
  },
  a1p20l5: {
    idea: "Say that your plane lands at noon.",
    say: ["My plane lands at noon.", "My plane lands at twelve.", "My flight lands at noon."],
  },
  a1p21l1: {
    idea: "Say that you have a sore throat.",
    say: ["I have a sore throat.", "I've got a sore throat.", "My throat is sore."],
  },
  a1p21l2: {
    idea: "Say that your hands are very cold.",
    say: ["My hands are very cold.", "My hands are really cold.", "My hands are freezing."],
  },
  a1p21l3: {
    idea: "Say that your head hurts.",
    say: ["My head hurts.", "I have a headache.", "I've got a headache."],
  },
  a1p21l4: {
    idea: "Say that she has long hair and green eyes.",
    say: [
      "She has long hair and green eyes.",
      "She has got long hair and green eyes.",
      "She has green eyes and long hair.",
    ],
  },
  a1p21l5: {
    idea: "Say that your back hurts after work.",
    say: ["My back hurts after work.", "My back hurts after I work.", "After work my back hurts."],
  },
  a1p22l1: {
    idea: "Say that you like playing chess.",
    say: ["I like playing chess.", "I like to play chess.", "I enjoy playing chess."],
  },
  a1p22l2: {
    idea: "Say that you paint pictures on weekends.",
    say: [
      "I paint pictures on weekends.",
      "I paint pictures at weekends.",
      "On weekends I paint pictures.",
    ],
  },
  a1p22l3: {
    idea: "Say that your brother likes fishing.",
    say: ["My brother likes fishing.", "My brother likes to fish.", "My brother enjoys fishing."],
  },
  a1p22l4: {
    idea: "Say that you cook with your mother on Sundays.",
    say: [
      "I cook with my mother on Sundays.",
      "On Sundays I cook with my mother.",
      "I cook with my mum on Sundays.",
    ],
  },
  a1p22l5: {
    idea: "Say that you sing in a small choir.",
    say: ["I sing in a small choir.", "I sing in a little choir.", "I'm in a small choir."],
  },
  a1p2l1: {
    idea: "Say that your brother is a student.",
    say: [
      "My brother is a student.",
      "He is my brother and a student.",
      "My brother is at school.",
    ],
  },
  a1p2l2: {
    idea: "Say that your friends are at home.",
    say: ["My friends are at home.", "My friends are home.", "My friends are in the house."],
  },
  a1p2l3: {
    idea: "Ask if she has a brother.",
    say: ["Does she have a brother?", "Has she got a brother?", "Does she have any brothers?"],
  },
  a1p2l4: {
    idea: "Say that he does not have a car.",
    say: ["He doesn't have a car.", "He hasn't got a car.", "He has no car."],
  },
  a1p2l5: {
    idea: "Say that she works in a hospital.",
    say: ["She works in a hospital.", "She is a hospital worker.", "She works at a hospital."],
  },
  a1p3l1: {
    idea: "Say that your dog is old and very slow.",
    say: [
      "My dog is old and very slow.",
      "My dog is very old and slow.",
      "My dog is old and moves very slowly.",
    ],
  },
  a1p3l2: {
    idea: "Say that the soup is too hot.",
    say: ["The soup is too hot.", "The soup is very hot.", "This soup is too hot."],
  },
  a1p3l3: {
    idea: "Say that the bag is heavy.",
    say: ["The bag is heavy.", "This bag is heavy.", "The bag is very heavy."],
  },
  a1p3l4: {
    idea: "Say that the water is cold and the room is dry.",
    say: [
      "The water is cold and the room is dry.",
      "The water is cold but the room is dry.",
      "The room is dry and the water is cold.",
    ],
  },
  a1p3l5: {
    idea: "Say that your new phone is expensive.",
    say: [
      "My new phone is expensive.",
      "My new phone is very expensive.",
      "My new phone was expensive.",
    ],
  },
  a1p4l1: {
    idea: "Say that your keys are in the bag.",
    say: ["My keys are in the bag.", "The keys are in my bag.", "My keys are inside the bag."],
  },
  a1p4l2: {
    idea: "Say that you will meet on Monday morning.",
    say: [
      "We meet on Monday morning.",
      "We are meeting on Monday morning.",
      "We'll meet on Monday morning.",
    ],
  },
  a1p4l3: {
    idea: "Say that the lamp is above the table.",
    say: [
      "The lamp is above the table.",
      "The lamp is over the table.",
      "There is a lamp above the table.",
    ],
  },
  a1p4l4: {
    idea: "Say that the children are behind the house.",
    say: [
      "The children are behind the house.",
      "The kids are behind the house.",
      "The children are at the back of the house.",
    ],
  },
  a1p4l5: {
    idea: "Say that the post office is opposite the bank.",
    say: [
      "The post office is opposite the bank.",
      "The post office is across from the bank.",
      "The post office is facing the bank.",
    ],
  },
  a1p5l1: {
    idea: "Say that you take a bus to work.",
    say: ["I take a bus to work.", "I take the bus to work.", "I go to work by bus."],
  },
  a1p5l2: {
    idea: "Say that you listen to the radio in the car.",
    say: [
      "I listen to the radio in the car.",
      "I listen to the radio when I drive.",
      "In the car I listen to the radio.",
    ],
  },
  a1p5l3: {
    idea: "Say that you ride your bike on Sundays.",
    say: ["I ride my bike on Sundays.", "On Sundays I ride my bike.", "I cycle on Sundays."],
  },
  a1p5l4: {
    idea: "Say that she speaks English very well.",
    say: [
      "She speaks English very well.",
      "She speaks very good English.",
      "Her English is very good.",
    ],
  },
  a1p5l5: {
    idea: "Say that you make a cake on Friday.",
    say: ["I make a cake on Friday.", "I'm making a cake on Friday.", "On Friday I make a cake."],
  },
  a1p6l1: {
    idea: "Ask a new person what her name is.",
    say: ["What is your name?", "What are you called?", "Can you tell me your name?"],
  },
  a1p6l2: {
    idea: "Ask how old your friend is.",
    say: ["How old are you?", "How old is she?", "How old is he?"],
  },
  a1p6l3: {
    idea: "Ask what time the film starts.",
    say: ["What time does the film start?", "What time is the film?", "When does the film start?"],
  },
  a1p6l4: {
    idea: "Ask where the nearest shop is.",
    say: [
      "Where is the nearest shop?",
      "Where is the closest shop?",
      "Where can I find the nearest shop?",
    ],
  },
  a1p6l5: {
    idea: "Ask who is at the door.",
    say: ["Who is at the door?", "Who is there at the door?", "Who is standing at the door?"],
  },
  a1p7l1: {
    idea: "Say that your uncle lives in Canada.",
    say: ["My uncle lives in Canada.", "My uncle is in Canada.", "I have an uncle in Canada."],
  },
  a1p7l2: {
    idea: "Say that your grandfather is seventy years old.",
    say: [
      "My grandfather is seventy years old.",
      "My grandfather is seventy.",
      "My grandpa is seventy years old.",
    ],
  },
  a1p7l3: {
    idea: "Say that the actress is very famous.",
    say: [
      "The actress is very famous.",
      "That actress is famous.",
      "The actress is really famous.",
    ],
  },
  a1p7l4: {
    idea: "Say that your cousin has two sons.",
    say: [
      "My cousin has two sons.",
      "My cousin has got two sons.",
      "I have a cousin with two sons.",
    ],
  },
  a1p7l5: {
    idea: "Say that your sister-in-law is a nurse.",
    say: [
      "My sister-in-law is a nurse.",
      "My sister-in-law works as a nurse.",
      "My sister-in-law is a nurse by profession.",
    ],
  },
  a1p8l1: {
    idea: "Say that you want bread and butter for breakfast.",
    say: [
      "I want bread and butter for breakfast.",
      "I'd like bread and butter for breakfast.",
      "I'd like some bread and butter for breakfast.",
    ],
  },
  a1p8l2: {
    idea: "Say that you do not like fish.",
    say: ["I don't like fish.", "I don't eat fish.", "I dislike fish."],
  },
  a1p8l3: {
    idea: "Say that you drink a glass of water every day.",
    say: [
      "I drink a glass of water every day.",
      "Every day I drink a glass of water.",
      "I have a glass of water every day.",
    ],
  },
  a1p8l4: {
    idea: "Ask for the bill politely.",
    say: ["Could I have the bill, please?", "Can I have the bill, please?", "The bill, please."],
  },
  a1p8l5: {
    idea: "Say that the soup needs more salt.",
    say: [
      "The soup needs more salt.",
      "This soup needs more salt.",
      "The soup needs some more salt.",
    ],
  },
  a1p9l1: {
    idea: "Say that your new shoes are too small.",
    say: [
      "My new shoes are too small.",
      "My new shoes are too tight.",
      "These new shoes are too small.",
    ],
  },
  a1p9l2: {
    idea: "Say that you wear a hat when it is sunny.",
    say: [
      "I wear a hat when it is sunny.",
      "When it's sunny, I wear a hat.",
      "I put on a hat on sunny days.",
    ],
  },
  a1p9l3: {
    idea: "Say that you like his blue shirt.",
    say: ["I like his blue shirt.", "I like his shirt. It's blue.", "His blue shirt is nice."],
  },
  a1p9l4: {
    idea: "Say that she is wearing a long grey coat.",
    say: [
      "She is wearing a long grey coat.",
      "She wears a long grey coat.",
      "She has a long grey coat on.",
    ],
  },
  a1p9l5: {
    idea: "Say that your gloves are in your pocket.",
    say: [
      "My gloves are in my pocket.",
      "My gloves are in the pocket.",
      "I have my gloves in my pocket.",
    ],
  },
  a2p10l1: {
    idea: "Say that this is the tallest building in town.",
    say: [
      "This is the tallest building in town.",
      "This is the tallest building in the town.",
      "This is the tallest building in the city.",
    ],
  },
  a2p10l2: {
    idea: "Say that she is the youngest in her class.",
    say: [
      "She is the youngest in her class.",
      "She is the youngest student in her class.",
      "Nobody in her class is younger than her.",
    ],
  },
  a2p10l3: {
    idea: "Say that this is the cheapest hotel.",
    say: [
      "This is the cheapest hotel.",
      "This hotel is the cheapest.",
      "This is the cheapest hotel here.",
    ],
  },
  a2p10l4: {
    idea: "Say that today is the coldest day of the year.",
    say: [
      "Today is the coldest day of the year.",
      "Today is the coldest day this year.",
      "It's the coldest day of the year today.",
    ],
  },
  a2p10l5: {
    idea: "Say that he is the fastest runner in the club.",
    say: [
      "He is the fastest runner in the club.",
      "He runs the fastest in the club.",
      "Nobody in the club runs faster than him.",
    ],
  },
  a2p11l1: {
    idea: "Say that you would like a table for two.",
    say: [
      "I'd like a table for two.",
      "Could we have a table for two?",
      "A table for two, please.",
    ],
  },
  a2p11l2: {
    idea: "Say that you do not eat meat.",
    say: ["I don't eat meat.", "I'm a vegetarian.", "I never eat meat."],
  },
  a2p11l3: {
    idea: "Ask for a glass of water.",
    say: [
      "Could I have a glass of water, please?",
      "Can I have a glass of water, please?",
      "A glass of water, please.",
    ],
  },
  a2p11l4: {
    idea: "Say that the pasta is too salty.",
    say: ["The pasta is too salty.", "This pasta is too salty.", "The pasta is very salty."],
  },
  a2p11l5: {
    idea: "Say thank you to the waiter and ask for the bill.",
    say: [
      "Thank you. Could we have the bill, please?",
      "Thanks. Can we have the bill, please?",
      "Thank you. The bill, please.",
    ],
  },
  a2p12l1: {
    idea: "Say that you never eat breakfast.",
    say: ["I never eat breakfast.", "I never have breakfast.", "I don't ever eat breakfast."],
  },
  a2p12l2: {
    idea: "Say that you sometimes go to the gym.",
    say: ["I sometimes go to the gym.", "Sometimes I go to the gym.", "I go to the gym sometimes."],
  },
  a2p12l3: {
    idea: "Say that he is often late.",
    say: ["He is often late.", "He is late very often.", "He is frequently late."],
  },
  a2p12l4: {
    idea: "Say that it hardly ever snows here.",
    say: ["It hardly ever snows here.", "It rarely snows here.", "It almost never snows here."],
  },
  a2p12l5: {
    idea: "Say that she is always on time.",
    say: ["She is always on time.", "She is never late.", "She is always punctual."],
  },
  a2p13l1: {
    idea: "Tell someone to turn right at the lights.",
    say: [
      "Turn right at the lights.",
      "Turn right at the traffic lights.",
      "Take a right at the lights.",
    ],
  },
  a2p13l2: {
    idea: "Say that the museum is across the street.",
    say: [
      "The museum is across the street.",
      "The museum is on the other side of the street.",
      "The museum is across the road.",
    ],
  },
  a2p13l3: {
    idea: "Ask how to get to the library.",
    say: [
      "How do I get to the library?",
      "How can I get to the library?",
      "Which way is the library?",
    ],
  },
  a2p13l4: {
    idea: "Say that the station is a five-minute walk away.",
    say: [
      "The station is a five-minute walk away.",
      "The station is five minutes away on foot.",
      "The station is a five-minute walk from here.",
    ],
  },
  a2p13l5: {
    idea: "Tell someone to go straight and then turn left.",
    say: [
      "Go straight and then turn left.",
      "Go straight on, then turn left.",
      "Walk straight ahead and then turn left.",
    ],
  },
  a2p14l1: {
    idea: "Invite a friend to go to the cinema tonight.",
    say: [
      "Would you like to go to the cinema tonight?",
      "Do you want to go to the cinema tonight?",
      "Shall we go to the cinema tonight?",
    ],
  },
  a2p14l2: {
    idea: "Say that you are free on Friday evening.",
    say: [
      "I'm free on Friday evening.",
      "I'm free on Friday night.",
      "I have no plans on Friday evening.",
    ],
  },
  a2p14l3: {
    idea: "Say that you will call your friend tomorrow.",
    say: [
      "I'll call you tomorrow.",
      "I'm going to call you tomorrow.",
      "Tomorrow I will call you.",
    ],
  },
  a2p14l4: {
    idea: "Say that Sunday is not good for you.",
    say: ["Sunday is not good for me.", "Sunday doesn't suit me.", "I can't do Sunday."],
  },
  a2p14l5: {
    idea: "Say that you will confirm the time later.",
    say: [
      "I'll confirm the time later.",
      "I'll let you know the time later.",
      "Later I will tell you the time.",
    ],
  },
  a2p15l1: {
    idea: "Ask to send a letter to Italy.",
    say: [
      "I'd like to send a letter to Italy, please.",
      "Can I send a letter to Italy, please?",
      "I want to send a letter to Italy.",
    ],
  },
  a2p15l2: {
    idea: "Ask how long a parcel takes to arrive.",
    say: [
      "How long does a parcel take to arrive?",
      "How long will the parcel take to arrive?",
      "How long does it take for a parcel to arrive?",
    ],
  },
  a2p15l3: {
    idea: "Say that you want to pay in cash.",
    say: ["I'd like to pay in cash.", "I want to pay in cash.", "I'll pay in cash."],
  },
  a2p15l4: {
    idea: "Say that you need to change your PIN.",
    say: ["I need to change my PIN.", "I have to change my PIN.", "I must change my PIN."],
  },
  a2p15l5: {
    idea: "Ask to cancel your card.",
    say: [
      "I'd like to cancel my card, please.",
      "Can I cancel my card, please?",
      "I want to cancel my card.",
    ],
  },
  a2p16l1: {
    idea: "Say that you like your neighbours.",
    say: ["I like my neighbours.", "I like my neighbors.", "My neighbours are nice."],
  },
  a2p16l2: {
    idea: "Say that the park is five minutes from your home.",
    say: [
      "The park is five minutes from my home.",
      "The park is five minutes from my house.",
      "The park is a five-minute walk from my home.",
    ],
  },
  a2p16l3: {
    idea: "Say that you live near the city centre.",
    say: [
      "I live near the city centre.",
      "I live close to the city centre.",
      "I live near the town centre.",
    ],
  },
  a2p16l4: {
    idea: "Say that your street is quiet in the evening.",
    say: [
      "My street is quiet in the evening.",
      "My street is quiet in the evenings.",
      "It is quiet on my street in the evening.",
    ],
  },
  a2p16l5: {
    idea: "Say that the shops close at six.",
    say: ["The shops close at six.", "The shops close at six o'clock.", "The shops shut at six."],
  },
  a2p17l1: {
    idea: "Say that the book is on the desk.",
    say: [
      "The book is on the desk.",
      "The book is on top of the desk.",
      "There is a book on the desk.",
    ],
  },
  a2p17l2: {
    idea: "Say that the ball is between the chairs.",
    say: [
      "The ball is between the chairs.",
      "The ball is in between the chairs.",
      "There is a ball between the chairs.",
    ],
  },
  a2p17l3: {
    idea: "Say that the lamp is above the sofa.",
    say: [
      "The lamp is above the sofa.",
      "The lamp is over the sofa.",
      "There is a lamp above the sofa.",
    ],
  },
  a2p17l4: {
    idea: "Say that the school is next to the church.",
    say: [
      "The school is next to the church.",
      "The school is beside the church.",
      "The school is next door to the church.",
    ],
  },
  a2p17l5: {
    idea: "Say that the dog is lying under the tree.",
    say: [
      "The dog is lying under the tree.",
      "The dog is under the tree.",
      "The dog lies under the tree.",
    ],
  },
  a2p18l1: {
    idea: "Say that you were sleeping when the phone rang.",
    say: [
      "I was sleeping when the phone rang.",
      "I was asleep when the phone rang.",
      "When the phone rang, I was sleeping.",
    ],
  },
  a2p18l2: {
    idea: "Say that they were working when the lights went out.",
    say: [
      "They were working when the lights went out.",
      "When the lights went out, they were working.",
      "They were working when the power went out.",
    ],
  },
  a2p18l3: {
    idea: "Say that she was reading when you called.",
    say: [
      "She was reading when I called.",
      "She was reading when I phoned.",
      "When I called, she was reading.",
    ],
  },
  a2p18l4: {
    idea: "Say that he was running when it started to rain.",
    say: [
      "He was running when it started to rain.",
      "He was running when the rain started.",
      "When it started to rain, he was running.",
    ],
  },
  a2p18l5: {
    idea: "Say that you were watching TV when your friend came.",
    say: [
      "I was watching TV when my friend came.",
      "I was watching TV when my friend arrived.",
      "When my friend came, I was watching TV.",
    ],
  },
  a2p19l1: {
    idea: "Say that you can play the piano.",
    say: ["I can play the piano.", "I am able to play the piano.", "I know how to play the piano."],
  },
  a2p19l2: {
    idea: "Ask if you may open the window.",
    say: ["May I open the window?", "Can I open the window?", "Is it OK if I open the window?"],
  },
  a2p19l3: {
    idea: "Say that he could not find his keys.",
    say: [
      "He couldn't find his keys.",
      "He was unable to find his keys.",
      "He didn't manage to find his keys.",
    ],
  },
  a2p19l4: {
    idea: "Ask if she can help you carry the bags.",
    say: [
      "Can you help me carry the bags?",
      "Could you help me carry the bags?",
      "Can you help me with the bags?",
    ],
  },
  a2p19l5: {
    idea: "Say that you cannot come to the meeting.",
    say: [
      "I can't come to the meeting.",
      "I am not able to come to the meeting.",
      "I won't be able to come to the meeting.",
    ],
  },
  a2p1l1: {
    idea: "Say that you bought a new phone last week.",
    say: [
      "I bought a new phone last week.",
      "Last week I bought a new phone.",
      "I got a new phone last week.",
    ],
  },
  a2p1l2: {
    idea: "Say that she gave him a present.",
    say: ["She gave him a present.", "She gave him a gift.", "She gave a present to him."],
  },
  a2p1l3: {
    idea: "Say that you wrote a long email yesterday.",
    say: [
      "I wrote a long email yesterday.",
      "Yesterday I wrote a long email.",
      "I wrote a long e-mail yesterday.",
    ],
  },
  a2p1l4: {
    idea: "Say that the plane flew over the town.",
    say: [
      "The plane flew over the town.",
      "The plane flew over the city.",
      "The aeroplane flew over the town.",
    ],
  },
  a2p1l5: {
    idea: "Say that you slept for nine hours.",
    say: ["I slept for nine hours.", "I slept nine hours.", "I had nine hours of sleep."],
  },
  a2p20l1: {
    idea: "Say that this room is as big as that one.",
    say: [
      "This room is as big as that one.",
      "This room is as large as that one.",
      "This room is as big as that room.",
    ],
  },
  a2p20l2: {
    idea: "Say that her bag is as heavy as yours.",
    say: [
      "Her bag is as heavy as yours.",
      "Her bag is as heavy as your bag.",
      "Her bag weighs as much as yours.",
    ],
  },
  a2p20l3: {
    idea: "Say that the soup is as hot as the tea.",
    say: [
      "The soup is as hot as the tea.",
      "The soup is as hot as the tea is.",
      "The soup is just as hot as the tea.",
    ],
  },
  a2p20l4: {
    idea: "Say that the food is as good as last time.",
    say: [
      "The food is as good as last time.",
      "The food is as good as it was last time.",
      "The food is just as good as last time.",
    ],
  },
  a2p20l5: {
    idea: "Say that this chair is as comfortable as the sofa.",
    say: [
      "This chair is as comfortable as the sofa.",
      "This chair is as comfy as the sofa.",
      "This chair is just as comfortable as the sofa.",
    ],
  },
  a2p2l1: {
    idea: "Say that you were at the park yesterday.",
    say: [
      "I was at the park yesterday.",
      "I was in the park yesterday.",
      "Yesterday I was at the park.",
    ],
  },
  a2p2l2: {
    idea: "Say that you did not see him last week.",
    say: [
      "I didn't see him last week.",
      "Last week I didn't see him.",
      "I didn't meet him last week.",
    ],
  },
  a2p2l3: {
    idea: "Say that you were eating when he arrived.",
    say: [
      "I was eating when he arrived.",
      "I was eating when he came.",
      "When he arrived, I was eating.",
    ],
  },
  a2p2l4: {
    idea: "Ask what she was doing at nine last night.",
    say: [
      "What was she doing at nine last night?",
      "What was she doing last night at nine?",
      "What was she doing at nine o'clock last night?",
    ],
  },
  a2p2l5: {
    idea: "Say that you missed the bus this morning.",
    say: [
      "I missed the bus this morning.",
      "This morning I missed the bus.",
      "I missed my bus this morning.",
    ],
  },
  a2p3l1: {
    idea: "Say that your brother is taller than you.",
    say: [
      "My brother is taller than me.",
      "My brother is taller than I am.",
      "My brother is taller than you.",
    ],
  },
  a2p3l2: {
    idea: "Say that this book is better than the film.",
    say: [
      "This book is better than the film.",
      "The book is better than the film.",
      "This book is better than the movie.",
    ],
  },
  a2p3l3: {
    idea: "Say that this road is longer than that one.",
    say: [
      "This road is longer than that one.",
      "This road is longer than that road.",
      "This street is longer than that one.",
    ],
  },
  a2p3l4: {
    idea: "Say that the train is faster than the bus.",
    say: [
      "The train is faster than the bus.",
      "The train is quicker than the bus.",
      "Trains are faster than buses.",
    ],
  },
  a2p3l5: {
    idea: "Say that this bag is cheaper than the other one.",
    say: [
      "This bag is cheaper than the other one.",
      "This bag is cheaper than the other.",
      "This bag costs less than the other one.",
    ],
  },
  a2p4l1: {
    idea: "Ask if you can try on the blue shirt.",
    say: [
      "Can I try on the blue shirt?",
      "Could I try on the blue shirt?",
      "May I try on the blue shirt?",
    ],
  },
  a2p4l2: {
    idea: "Ask if this bus goes to the airport.",
    say: [
      "Does this bus go to the airport?",
      "Is this the bus to the airport?",
      "Does this bus go to the airport, please?",
    ],
  },
  a2p4l3: {
    idea: "Ask how much a ticket costs.",
    say: ["How much is a ticket?", "How much does a ticket cost?", "How much is the ticket?"],
  },
  a2p4l4: {
    idea: "Say that you would like to book a table for four.",
    say: [
      "I'd like to book a table for four.",
      "Could I book a table for four?",
      "I want to reserve a table for four.",
    ],
  },
  a2p4l5: {
    idea: "Ask where the nearest cash machine is.",
    say: [
      "Where is the nearest cash machine?",
      "Where is the nearest ATM?",
      "Where can I find a cash machine near here?",
    ],
  },
  a2p5l1: {
    idea: "Ask how much water there is.",
    say: [
      "How much water is there?",
      "How much water do we have?",
      "How much water is there left?",
    ],
  },
  a2p5l2: {
    idea: "Say that you have a few friends in town.",
    say: [
      "I have a few friends in town.",
      "I've got a few friends in town.",
      "I have a few friends in this town.",
    ],
  },
  a2p5l3: {
    idea: "Say that there are not many seats left.",
    say: [
      "There aren't many seats left.",
      "There are few seats left.",
      "Only a few seats are left.",
    ],
  },
  a2p5l4: {
    idea: "Say that you have a little time.",
    say: ["I have a little time.", "I've got a little time.", "I have a bit of time."],
  },
  a2p5l5: {
    idea: "Say that neither of your parents was at home.",
    say: [
      "Neither of my parents was at home.",
      "Neither of my parents were at home.",
      "Neither parent was at home.",
    ],
  },
  a2p6l1: {
    idea: "Say that you are going to study tonight.",
    say: ["I'm going to study tonight.", "Tonight I'm going to study.", "I will study tonight."],
  },
  a2p6l2: {
    idea: "Say that you will have the fish.",
    say: ["I'll have the fish.", "I'll take the fish.", "I would like the fish."],
  },
  a2p6l3: {
    idea: "Say that you are meeting a friend at six.",
    say: [
      "I'm meeting a friend at six.",
      "I'm meeting a friend at six o'clock.",
      "I will meet a friend at six.",
    ],
  },
  a2p6l4: {
    idea: "Say that the lesson starts at nine tomorrow.",
    say: [
      "The lesson starts at nine tomorrow.",
      "The class starts at nine tomorrow.",
      "Tomorrow the lesson starts at nine.",
    ],
  },
  a2p6l5: {
    idea: "Say that you think it will be a long day.",
    say: [
      "I think it will be a long day.",
      "I think it's going to be a long day.",
      "I think the day will be long.",
    ],
  },
  a2p7l1: {
    idea: "Say that the sofa is in the living room.",
    say: [
      "The sofa is in the living room.",
      "The sofa is in the lounge.",
      "The couch is in the living room.",
    ],
  },
  a2p7l2: {
    idea: "Say that the bathroom is upstairs.",
    say: [
      "The bathroom is upstairs.",
      "The bathroom is on the first floor.",
      "The bathroom is on the upper floor.",
    ],
  },
  a2p7l3: {
    idea: "Say that the door is open.",
    say: ["The door is open.", "The door is not closed.", "The door is wide open."],
  },
  a2p7l4: {
    idea: "Say that the bed is next to the window.",
    say: [
      "The bed is next to the window.",
      "The bed is by the window.",
      "The bed is beside the window.",
    ],
  },
  a2p7l5: {
    idea: "Say that you live in a small flat.",
    say: ["I live in a small flat.", "I live in a small apartment.", "My flat is small."],
  },
  a2p8l1: {
    idea: "Say that you play tennis on Sundays.",
    say: ["I play tennis on Sundays.", "On Sundays I play tennis.", "I play tennis every Sunday."],
  },
  a2p8l2: {
    idea: "Say that she swims every morning.",
    say: [
      "She swims every morning.",
      "Every morning she swims.",
      "She goes swimming every morning.",
    ],
  },
  a2p8l3: {
    idea: "Say that he is learning to paint.",
    say: [
      "He is learning to paint.",
      "He is learning how to paint.",
      "He is taking painting lessons.",
    ],
  },
  a2p8l4: {
    idea: "Say that you are good at chess.",
    say: ["I am good at chess.", "I play chess well.", "I'm a good chess player."],
  },
  a2p8l5: {
    idea: "Say that you go cycling when the weather is nice.",
    say: [
      "I go cycling when the weather is nice.",
      "I go cycling when it's nice weather.",
      "When the weather is nice, I go cycling.",
    ],
  },
  a2p9l1: {
    idea: "Say that you have a bad cold.",
    say: ["I have a bad cold.", "I've got a bad cold.", "I have a terrible cold."],
  },
  a2p9l2: {
    idea: "Say that your stomach hurts.",
    say: ["My stomach hurts.", "I have a stomachache.", "I've got a stomach ache."],
  },
  a2p9l3: {
    idea: "Say that you need to rest today.",
    say: ["I need to rest today.", "I need to rest.", "Today I need to rest."],
  },
  a2p9l4: {
    idea: "Say that she has a pain in her foot.",
    say: ["She has a pain in her foot.", "She's got a pain in her foot.", "Her foot hurts."],
  },
  a2p9l5: {
    idea: "Say that you should drink more water.",
    say: [
      "I should drink more water.",
      "I ought to drink more water.",
      "I should drink more water every day.",
    ],
  },
};
