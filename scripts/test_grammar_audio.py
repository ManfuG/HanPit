#!/usr/bin/env python3
"""Focused sentence-phonetic regressions; no model load or audio synthesis."""
import importlib.util
from pathlib import Path
import unittest

_spec = importlib.util.spec_from_file_location('hanpit_grammar_audio', Path(__file__).with_name('generate-grammar-audio.py'))
audio = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audio)


def sentence(hanzi, pinyin):
    return audio.sentence_pronunciation({'id': 'G1-001-1', 'hanzi': hanzi, 'pinyin': pinyin})


class SentencePhoneticsTests(unittest.TestCase):
    def test_no_bu_sandhi_across_pause(self):
        result = sentence('不，不去。', 'Bù, bù qù.')
        self.assertEqual(result['clauses'][0]['surface'], ['bu4'])
        self.assertEqual(result['clauses'][1]['surface'], ['bu2', 'qu4'])

    def test_no_third_tone_sandhi_across_pause(self):
        separated = sentence('你，好。', 'Nǐ, hǎo.')
        connected = sentence('你好。', 'Nǐ hǎo.')
        self.assertEqual(separated['clauses'][0]['surface'], ['ni3'])
        self.assertEqual(separated['clauses'][1]['surface'], ['hao3'])
        self.assertEqual(connected['clauses'][0]['surface'], ['ni2', 'hao3'])

    def test_yi_sandhi_uses_underlying_classifier_tone_without_losing_neutral(self):
        citation = sentence('我有一个弟弟。', 'Wǒ yǒu yī ge dìdi.')['clauses'][0]
        surface = sentence('我有一个弟弟。', 'Wǒ yǒu yí ge dìdi.')['clauses'][0]
        self.assertEqual(citation['citation'][2:4], ['yi1', 'ge5'])
        self.assertEqual(citation['surface'][2:4], ['yi2', 'ge5'])
        self.assertEqual(citation['phonemes'], surface['phonemes'])

    def test_number_final_yi_does_not_change_before_a_measure_word(self):
        for hanzi, pinyin, tones in [
            ('都十一点了。', 'Dōu shíyī diǎn le.', '12135'),
            ('一百零一吨。', 'Yī bǎi líng yī dūn.', '43211'),
        ]:
            with self.subTest(hanzi=hanzi):
                result = sentence(hanzi, pinyin)
                self.assertEqual(''.join(c for c in result['phonemes'] if c in '12345'), tones)

    def test_decimal_yi_keeps_digit_reading(self):
        result = sentence('一点五升。', 'Yī diǎn wǔ shēng.')['clauses'][0]
        self.assertEqual(result['surface'][0], 'yi1')
        self.assertEqual(next(c for c in result['phonemes'] if c in '12345'), '1')

    def test_compound_final_and_ordinal_yi_keep_first_tone(self):
        for hanzi, pinyin, tones in [
            ('周一以外。', 'Zhōuyī yǐwài.', '1134'),
            ('统一意见。', 'Tǒngyī yìjiàn.', '3144'),
            ('第一名。', 'Dì yī míng.', '412'),
        ]:
            with self.subTest(hanzi=hanzi):
                result = sentence(hanzi, pinyin)
                self.assertEqual(''.join(c for c in result['phonemes'] if c in '12345'), tones)

    def test_all_supported_pause_markers_are_normalized(self):
        result = sentence('你、我；他：好！', 'Nǐ, wǒ; tā: hǎo!')
        self.assertEqual([clause['punctuation'] for clause in result['clauses']], [',', ';', ':', '!'])
        self.assertEqual([char for char in result['phonemes'] if char in ',;:!'], [',', ';', ':', '!'])

    def test_punctuation_and_clause_mismatch_are_rejected(self):
        for hanzi, pinyin in [('你好，你去吗？', 'Nǐ hǎo nǐ qù ma?'),
                              ('你好。', 'Nǐ hǎo?'),
                              ('你，，好。', 'Nǐ, hǎo.')]:
            with self.subTest(hanzi=hanzi, pinyin=pinyin), self.assertRaises(ValueError):
                sentence(hanzi, pinyin)

    def test_unaligned_syllables_and_alternative_readings_are_rejected(self):
        for pinyin in ['Nǐ.', 'Nǐ hǎo ma.', 'Nǐ hǎo / nǐ hào.']:
            with self.subTest(pinyin=pinyin), self.assertRaises(ValueError):
                sentence('你好。', pinyin)

    def test_reviewed_polyphones_are_not_replaced(self):
        context = sentence('银行很好。', 'Yínháng hěn hǎo.')
        alternative = sentence('银行很好。', 'Yínxíng hěn hǎo.')
        self.assertEqual(context['clauses'][0]['citation'][:2], ['yin2', 'hang2'])
        self.assertEqual(alternative['clauses'][0]['citation'][:2], ['yin2', 'xing2'])
        self.assertNotEqual(context['phonemes'], alternative['phonemes'])

    def test_umlaut_erhua_and_neutral_tones_are_preserved(self):
        result = sentence('女孩儿的妈妈在哪儿？', 'Nǚháir de māma zài nǎr?')
        self.assertEqual(result['clauses'][0]['citation'],
                         ['nv3', 'hai2+r', 'de5', 'ma1', 'ma5', 'zai4', 'na3+r'])
        explicit = sentence('女儿。', "Nǚ'ér.")
        self.assertEqual(explicit['clauses'][0]['citation'], ['nv3', 'er2'])

    def test_sentence_over_model_limit_is_rejected_not_truncated(self):
        with self.assertRaisesRegex(ValueError, '510'):
            sentence('长' * 180 + '。', ' '.join(['cháng'] * 180) + '.')

    def test_unknown_model_phonemes_are_rejected(self):
        config = audio.ROOT / '.venv-audio/model/config.json'
        with self.assertRaisesRegex(ValueError, 'unknown model phonemes'):
            audio.check_phonemes([{'id': 'G1-001-1', 'phonemes': '\u2603'}], config)


if __name__ == '__main__':
    unittest.main()
