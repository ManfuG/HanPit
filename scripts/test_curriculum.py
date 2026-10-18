#!/usr/bin/env python3
"""Consumer-visible curriculum boundaries, lexical identity and grammar scope."""
import unittest
from pathlib import Path

import curriculum as c


def word(identifier, hanzi, pinyin, level=1):
    return {'id': identifier, 'level': level, 'hanzi': hanzi, 'pinyin': pinyin}


def rule(identifier, hanzi='我', pinyin='wǒ'):
    return {'id': identifier, 'title': 'Regola', 'pattern': 'schema',
            'explanation': 'Spiegazione.', 'examples': [
                {'id': identifier + '-1', 'hanzi': hanzi, 'pinyin': pinyin}]}


def corpus(words, lessons, forms=None):
    return c.Corpus(Path('.'), {i: words.get(i, []) for i in range(1, 8)},
                    {i: lessons.get(i, []) for i in range(1, 8)}, forms or {}, {})


class CurriculumTest(unittest.TestCase):
    def test_polyphonic_surface_does_not_grant_an_unlearned_reading(self):
        ground = word('L1-0001', '地', 'dì')
        particle = word('L1-0002', '地', 'de')
        data = corpus({1: [ground, particle]},
                      {1: [rule('G1-001', '地', 'de'), rule('G1-002', '地', 'dì')]})
        wrong = {'level': 1, 'words': [ground['id'], particle['id']],
                 'grammar': ['G1-001', 'G1-002']}
        self.assertFalse(c.validate_plan(data, wrong)['ok'])
        correct = {**wrong, 'words': [particle['id'], ground['id']]}
        self.assertTrue(c.validate_plan(data, correct)['ok'])

    def test_future_polyphone_cannot_fall_back_to_an_earlier_reading(self):
        data = corpus({1: [word('L1-0001', '了', 'le')],
                       3: [word('L3-0001', '了', 'liǎo', 3)]},
                      {1: [rule('G1-001', '了', 'liǎo')]})
        plan = {'level': 1, 'words': ['L1-0001'], 'grammar': ['G1-001']}
        self.assertFalse(c.validate_plan(data, plan)['ok'])

    def test_unknown_characters_are_not_invented(self):
        result = c.segment('我看屋檐。', [word('w', '我', 'wǒ'), word('v', '看', 'kàn')])
        self.assertFalse(result['ok'])
        self.assertTrue(any(f['reason'] == 'unsegmentable' for f in result['failures']))

    def test_punctuation_cannot_join_parts_of_a_known_word(self):
        result = c.segment('学，生。', [word('w', '学生', 'xuéshēng')])
        self.assertFalse(result['ok'])

    def test_bound_suffix_is_not_an_independent_content_word(self):
        lexicon = [word('up', '上', 'shàng')]
        forms = {'边': ('G1-001',)}
        self.assertTrue(c.segment('上边', lexicon, forms=forms)['ok'])
        self.assertFalse(c.segment('边上', lexicon, forms=forms)['ok'])
        self.assertTrue(c.segment('边', lexicon, forms=forms, mention=True)['ok'])

    def test_aabb_requires_the_known_root_and_its_grammar(self):
        data = corpus({1: [word('happy', '高兴', 'gāoxìng')]}, {})
        lexicon = data.lexicon(1)
        forms = data.forms_for({'G2-008'})
        result = c.segment('高高兴兴', lexicon, forms=forms, pinyin='gāogāoxìngxìng')
        self.assertTrue(result['ok'])
        self.assertEqual(result['wordIds'], ['happy'])
        self.assertEqual(result['grammarIds'], ['G2-008'])
        self.assertFalse(c.segment('高高兴兴', lexicon)['ok'])
        self.assertFalse(c.segment('漂漂亮亮', lexicon, forms=forms)['ok'])

    def test_neutral_repetition_keeps_the_first_polyphonic_identity(self):
        look = word('look', '看', 'kàn')
        guard = word('guard', '看', 'kān', 2)
        data = corpus({1: [look], 2: [guard]}, {})
        forms = data.forms_for({'G2-004'})
        result = c.segment('看看', data.lexicon(2), forms=forms, pinyin='kànkan')
        self.assertTrue(result['ok'])
        self.assertEqual(result['wordIds'], ['look'])
        self.assertFalse(c.segment('看看', data.lexicon(2, {'guard'}),
                                   forms=forms, pinyin='kànkan')['ok'])

    def test_expressive_interjection_requires_its_lexeme_and_rule(self):
        particle = word('L2-0001', '啊', 'a', 2)
        interjection = word('L4-0002', '啊', 'ā', 4)
        data = corpus({2: [particle], 4: [interjection]}, {})
        forms = data.forms_for({'G4-022'})
        result = c.segment('啊！', data.lexicon(4), forms=forms, pinyin='À!')
        self.assertTrue(result['ok'])
        self.assertEqual(result['wordIds'], ['L4-0002'])
        self.assertFalse(c.segment('啊！', data.lexicon(4), pinyin='À!')['ok'])
        self.assertFalse(c.segment('啊！', data.lexicon(4, {'L2-0001'}),
                                   forms=forms, pinyin='À!')['ok'])

    def test_a_later_rule_cannot_lend_its_particle_early(self):
        data = corpus({1: [word('w1', '我', 'wǒ'), word('w2', '你', 'nǐ')]},
                      {1: [rule('G1-001', '矣', 'yǐ'), rule('G1-002', '矣', 'yǐ')]},
                      {'G1-002': ['矣']})
        plan = {'level': 1, 'words': ['w1', 'w2'], 'grammar': ['G1-001', 'G1-002']}
        self.assertFalse(c.validate_plan(data, plan)['ok'])
        self.assertTrue(c.validate_plan(data, {**plan, 'grammar': ['G1-002', 'G1-001']})['ok'])

    def test_reading_boundaries_round_down_and_keep_previous_levels(self):
        current = [word(f'w{i}', '书', 'shū', 2) for i in range(1, 12)]
        data = corpus({1: [word('prior', '我', 'wǒ')], 2: current},
                      {1: [rule('G1-001')], 2: [rule(f'G2-00{i}') for i in range(1, 4)]})
        plan = {'level': 2, 'words': [w['id'] for w in current],
                'grammar': ['G2-001', 'G2-002', 'G2-003']}
        first = c.reading_allowance(data, plan, 1)
        self.assertEqual(first['cutoff'], 1)
        self.assertEqual(first['wordIds'], {'prior', 'w1'})
        self.assertEqual(first['grammarIds'], {'G1-001'})
        third = c.reading_allowance(data, plan, 3)
        self.assertEqual(third['cutoff'], 3)
        self.assertIn('G2-001', third['grammarIds'])
        self.assertNotIn('G2-002', c.reading_allowance(data, plan, 6)['grammarIds'])
        self.assertIn('G2-002', c.reading_allowance(data, plan, 7)['grammarIds'])
        last = c.reading_allowance(data, plan, 10)
        self.assertEqual(last['wordIds'], {'prior', *(f'w{i}' for i in range(1, 12))})
        self.assertIn('G2-003', last['grammarIds'])
        with self.assertRaises(ValueError):
            c.reading_allowance(data, plan, 0)

    def test_reading_rejects_future_words_and_future_grammar(self):
        current = [word(f'w{i}', text, pinyin) for i, (text, pinyin) in enumerate(
            [('我', 'wǒ'), ('你', 'nǐ'), ('他', 'tā'), ('她', 'tā'), ('书', 'shū'),
             ('看', 'kàn'), ('人', 'rén'), ('是', 'shì'), ('的', 'de'), ('学习', 'xuéxí')], 1)]
        data = corpus({1: current}, {1: [rule('G1-001'), rule('G1-002')]})
        plan = {'level': 1, 'words': [w['id'] for w in current], 'grammar': ['G1-001', 'G1-002']}
        readings = [{'id': f'R1-{i:02d}', 'title': 'Una persona',
                     'paragraphs': ['我。'], 'grammarIds': []} for i in range(1, 11)]
        self.assertTrue(c.validate_readings(data, plan, readings)['ok'])
        readings[0] = {**readings[0], 'paragraphs': ['你。']}
        self.assertFalse(c.validate_readings(data, plan, readings)['ok'])
        readings[0] = {**readings[0], 'paragraphs': ['我。'], 'grammarIds': ['G1-002']}
        self.assertFalse(c.validate_readings(data, plan, readings)['ok'])


if __name__ == '__main__':
    unittest.main()
