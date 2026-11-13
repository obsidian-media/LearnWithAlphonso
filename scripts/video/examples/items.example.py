# Example board cues ("Can you or Could you?"). Times come from faster-whisper word timestamps of the finished voice track.
ITEMS = [
    ("text", 1.9, 0.6, 1, dict(x=60, y=118, s="Help me!", c=INK, size=50)),
    ("text", 3.6, 0.7, 1, dict(x=290, y=124, s="(too strong)", c=RED, size=40)),
    ("strike", 5.0, 0.4, 1, dict(x1=58, x2=232, y=150, c=RED)),
    ("text", 8.6, 0.9, 1, dict(x=60, y=198, s="Can you ...?", c=BLUE, size=50)),
    ("text", 9.6, 0.6, 1, dict(x=330, y=206, s="(friends)", c=GREY, size=38)),
    ("text", 15.1, 0.9, 1, dict(x=60, y=278, s="Could you ...?", c=BLUE, size=50)),
    ("text", 16.4, 0.9, 1, dict(x=360, y=286, s="(strangers, your boss)", c=GREY, size=38)),
    ("text", 22.2, 1.4, 1, dict(x=60, y=358, s="Would you mind helping ...?", c=BLUE, size=48)),
    ("text", 25.4, 1.2, 1, dict(x=62, y=432, s="mind + helping  (not help)", c=RED, size=36)),
    ("text", 28.0, 0.8, 2, dict(x=60, y=118, s="Quick test!", c=INK, size=54)),
    ("text", 31.9, 1.3, 2, dict(x=60, y=215, s="A: Can you explain that again?", c=INK, size=40)),
    ("text", 34.1, 1.6, 2, dict(x=60, y=300, s="B: Could you explain that again, please?", c=INK, size=40)),
    ("circle", 38.3, 0.4, 2, dict(x=50, y=207, w=56, h=58, c=GREEN)),
    ("circle", 38.7, 0.4, 2, dict(x=50, y=292, w=56, h=58, c=GREEN)),
    ("text", 39.6, 0.8, 2, dict(x=62, y=372, s="(B is softer)", c=GREEN, size=40)),
    ("text", 42.1, 1.0, 2, dict(x=60, y=440, s="Your turn!", c=BLUE, size=60)),
]
CLEAR_AT = 27.4
