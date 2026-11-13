"""Light tests for the cue parsing (no network, no ffmpeg, no Pillow needed).

Run:  python -I -m unittest discover -s scripts/video -p "test_*.py"
(Not wired into CI: the repo's CI has no Python step. Run it when you change board.py or captions.py.)
"""
import importlib.util
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, name + ".py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


board = load("board")
captions = load("captions")


def items_file(text):
    fh = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8")
    fh.write(text)
    fh.close()
    return fh.name


GOOD = '''
ITEMS = [
    ("text", 1.0, 0.5, 1, dict(x=1, y=1, s="a", c=INK, size=40)),
    ("strike", 2.0, 0.4, 1, dict(x1=1, x2=9, y=3, c=RED)),
    ("text", 10.0, 0.5, 2, dict(x=1, y=1, s="b", c=BLUE, size=40)),
    ("circle", 11.0, 0.4, 2, dict(x=1, y=1, w=5, h=5, c=GREEN)),
]
CLEAR_AT = 9.0
'''


class BoardItems(unittest.TestCase):
    def check(self, text):
        path = items_file(text)
        try:
            return board.load_items(path)
        finally:
            os.unlink(path)

    def test_the_shipped_example_parses(self):
        items, clear_at = board.load_items(os.path.join(HERE, "examples", "items.example.py"))
        self.assertGreater(len(items), 10)
        self.assertGreater(clear_at, max(c[1] for c in items if c[3] == 1))

    def test_good_file(self):
        items, clear_at = self.check(GOOD)
        self.assertEqual(len(items), 4)
        self.assertEqual(clear_at, 9.0)

    def test_unknown_kind_is_refused(self):
        with self.assertRaisesRegex(ValueError, "unknown kind"):
            self.check(GOOD.replace('"strike"', '"squiggle"'))

    def test_missing_param_is_refused(self):
        with self.assertRaisesRegex(ValueError, "missing x2"):
            self.check(GOOD.replace("x1=1, x2=9, ", "x1=1, "))

    def test_clear_before_the_last_phase1_cue_is_refused(self):
        with self.assertRaisesRegex(ValueError, "CLEAR_AT"):
            self.check(GOOD.replace("CLEAR_AT = 9.0", "CLEAR_AT = 1.5"))

    def test_phase2_before_the_board_clears_is_refused(self):
        with self.assertRaisesRegex(ValueError, "before the board clears"):
            self.check(GOOD.replace("CLEAR_AT = 9.0", "CLEAR_AT = 10.5").replace('"b", c=BLUE', '"b", c=BLUE'))

    def test_out_of_order_cues_are_refused(self):
        with self.assertRaisesRegex(ValueError, "before the previous"):
            self.check(GOOD.replace('("strike", 2.0', '("strike", 0.5'))

    def test_missing_names_are_refused(self):
        with self.assertRaisesRegex(ValueError, "must define"):
            self.check("ITEMS = []\n")


class Captions(unittest.TestCase):
    LINES = ['Hello there. This is a test.', 'Quick test! Which is better?', "It's B!"]

    def test_timeline_matches_the_voice_join(self):
        cues = captions.cues(self.LINES, [4.0, 6.0, 1.0], quiz_section=2)
        # lead 0.4, section 1 lasts 4.0, 1 s gap, section 2 starts at 5.4; 2 s gap after the quiz section.
        self.assertAlmostEqual(cues[0][0], 0.4)
        self.assertAlmostEqual(cues[2][0], 5.4)
        self.assertAlmostEqual(cues[-1][0], 5.4 + 6.0 + 2.0)
        self.assertAlmostEqual(cues[-1][1], 5.4 + 6.0 + 2.0 + 1.0)

    def test_sentences_share_a_section_by_length(self):
        cues = captions.cues(["Hi. Hello there."], [3.0])
        self.assertEqual([c[2] for c in cues], ["Hi.", "Hello there."])
        self.assertAlmostEqual(cues[0][1], cues[1][0])
        self.assertLess(cues[0][1] - cues[0][0], cues[1][1] - cues[1][0])

    def test_clip_count_must_match(self):
        with self.assertRaises(ValueError):
            captions.cues(self.LINES, [1.0])

    def test_vtt_format(self):
        text = captions.vtt([(0.4, 1.5, "Hi.")])
        self.assertEqual(text, "WEBVTT\n\n1\n00:00:00.400 --> 00:00:01.500\nHi.\n\n")
        self.assertEqual(captions.timestamp(3725.25), "01:02:05.250")


if __name__ == "__main__":
    unittest.main()
