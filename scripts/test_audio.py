import runpy
import unittest
from pathlib import Path

pronunciation = runpy.run_path(Path(__file__).with_name('generate-audio.py'))['pronunciation']


def pronounce(hanzi, pinyin):
    return pronunciation({'id': 'test', 'hanzi': hanzi, 'pinyin': pinyin})


class PronunciationTests(unittest.TestCase):
    def test_polyphones_follow_the_card_reading(self):
        for hanzi, first, second, first_numeric, second_numeric in [
            ('长', 'cháng', 'zhǎng', 'chang2', 'zhang3'),
            ('行', 'xíng', 'háng', 'xing2', 'hang2'),
        ]:
            with self.subTest(hanzi=hanzi):
                a, b = pronounce(hanzi, first), pronounce(hanzi, second)
                self.assertEqual(a['citation'], [first_numeric])
                self.assertEqual(b['citation'], [second_numeric])
                self.assertNotEqual(a['phonemes'], b['phonemes'])

    def test_apostrophe_prevents_syllable_merging(self):
        self.assertEqual(pronounce('西安', "Xī'ān")['citation'], ['xi1', 'an1'])
        self.assertEqual(pronounce('先', 'xiān')['citation'], ['xian1'])

    def test_umlaut_and_erhua_are_distinct_from_separate_er(self):
        daughter = pronounce('女儿', "nǚ'ér")
        girl = pronounce('女孩儿', 'nǚháir')
        self.assertEqual(daughter['citation'], ['nv3', 'er2'])
        self.assertEqual(girl['citation'], ['nv3', 'hai2+r'])
        self.assertNotEqual(daughter['phonemes'], girl['phonemes'])

    def test_unmarked_tone_is_neutral_without_overriding_marked_tones(self):
        self.assertEqual(pronounce('哥哥', 'gēge')['surface'], ['ge1', 'ge5'])
        self.assertEqual(pronounce('哥哥', 'gēgē')['surface'], ['ge1', 'ge1'])

    def test_contextual_sandhi_preserves_citation_readings(self):
        for hanzi, source, citation, surface in [
            ('你好', 'nǐhǎo', ['ni3', 'hao3'], ['ni2', 'hao3']),
            ('不要', 'bùyào', ['bu4', 'yao4'], ['bu2', 'yao4']),
            ('一天', 'yītiān', ['yi1', 'tian1'], ['yi4', 'tian1']),
            ('一个', 'yīgè', ['yi1', 'ge4'], ['yi2', 'ge4']),
            ('第一名', 'dìyīmíng', ['di4', 'yi1', 'ming2'], ['di4', 'yi1', 'ming2']),
            ('看不看', 'kànbùkàn', ['kan4', 'bu4', 'kan4'], ['kan4', 'bu5', 'kan4']),
            ('看一看', 'kànyīkàn', ['kan4', 'yi1', 'kan4'], ['kan4', 'yi5', 'kan4']),
        ]:
            with self.subTest(hanzi=hanzi):
                result = pronounce(hanzi, source)
                self.assertEqual(result['citation'], citation)
                self.assertEqual(result['surface'], surface)

    def test_alternative_readings_use_the_first_explicit_reading(self):
        self.assertEqual(pronounce('谁', 'shéi / shuí')['citation'], ['shei2'])

    def test_misaligned_text_and_pinyin_fail_instead_of_guessing(self):
        with self.assertRaises(ValueError):
            pronounce('你好', 'nǐ')


if __name__ == '__main__':
    unittest.main()
