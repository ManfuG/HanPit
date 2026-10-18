import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuizPool, sampleQuiz, normalizePinyin } from './quiz.ts';
import type { Word } from './types.ts';
import type { GrammarRule } from './grammar.ts';

const rows = [
  ['书', 'shū', 'book'], ['猫', 'māo', 'cat'],
  ['狗', 'gǒu', 'dog'], ['水', 'shuǐ', 'water'],
  ['火', 'huǒ', 'fire'], ['山', 'shān', 'mountain'],
  ['雨', 'yǔ', 'rain'], ['风', 'fēng', 'wind'],
  ['门', 'mén', 'door'], ['窗', 'chuāng', 'window'],
  ['花', 'huā', 'flower'], ['树', 'shù', 'tree'],
  ['鱼', 'yú', 'fish'], ['鸟', 'niǎo', 'bird'],
  ['车', 'chē', 'vehicle'], ['船', 'chuán', 'boat'],
  ['笔', 'bǐ', 'pen'], ['纸', 'zhǐ', 'paper'],
  ['米', 'mǐ', 'rice'], ['盐', 'yán', 'salt'],
  ['长', 'cháng', 'long'], ['掌', 'zhǎng', 'palm'],
  ['常', 'cháng', 'often'], ['糖', 'táng', 'sugar'],
];
const words: Word[] = rows.map(([hanzi, pinyin, meaning], i) => ({ id: `w${i}`, level: 1, hanzi: hanzi!, pinyin: pinyin!, meaning: meaning! }));
const sentences = [
  ['我读书。', 'Wǒ dú shū.', 'I read a book.'],
  ['猫睡觉。', 'Māo shuìjiào.', 'The cat sleeps.'],
  ['狗跑得快。', 'Gǒu pǎo de kuài.', 'The dog runs fast.'],
  ['天下雨了。', 'Tiān xià yǔ le.', 'It is raining.'],
  ['花开了。', 'Huā kāi le.', 'The flower has bloomed.'],
  ['船到了。', 'Chuán dào le.', 'The boat has arrived.'],
];
const rules: GrammarRule[] = sentences.map(([hanzi, pinyin, translation], i) => ({
  id: `g${i}`, level: 1, sourceNo: i, title: '', pattern: '', explanation: '',
  examples: [{ id: `g${i}-1`, hanzi: hanzi!, pinyin: pinyin!, translation: translation! }],
}));
function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('every attempt has five questions of each type, unique targets and correctly shuffled answers', () => {
  const pool = createQuizPool(words, rules, { 长: ['cháng', 'zhǎng'] });
  const quiz = sampleQuiz(pool, random(42));
  assert.equal(quiz.length, 20);
  for (const type of ['pinyin', 'meaning', 'hanzi', 'grammar']) assert.equal(quiz.filter(q => q.type === type).length, 5);
  assert.equal(new Set(quiz.map(q => q.targetId)).size, 20);
  for (const q of quiz) {
    assert.equal(new Set(q.options).size, 4);
    const word = words.find(w => w.id === q.targetId);
    const expected = q.type === 'grammar' ? rules.find(r => r.id === q.targetId)!.examples[0]!.translation
      : q.type === 'pinyin' ? word!.pinyin : q.type === 'meaning' ? word!.meaning : word!.hanzi;
    assert.equal(q.options[q.correctIndex], expected);
  }
});

test('all source words and rules remain eligible, including final array entries', () => {
  const pool = createQuizPool(words, rules, {});
  const seen = new Set<string>();
  const rng = random(2718);
  for (let attempt = 0; attempt < 60; attempt++) for (const q of sampleQuiz(pool, rng)) seen.add(q.targetId);
  assert.deepEqual([...seen].sort(), [...words.map(w => w.id), ...rules.map(r => r.id)].sort());
});

test('another valid reading of the target character cannot be offered as a wrong answer', () => {
  const pool = createQuizPool(words, rules, { 长: ['cháng / zhǎng'] });
  let checked = false;
  const rng = random(123);
  for (let attempt = 0; attempt < 80; attempt++) {
    const q = sampleQuiz(pool, rng).find(q => q.type === 'pinyin' && q.targetId === 'w20');
    if (q) {
      checked = true;
      assert.equal(q.options.filter(value => normalizePinyin(value).some(p => p === 'cháng' || p === 'zhǎng')).length, 1);
    }
  }
  assert.equal(checked, true);
  assert.deepEqual(normalizePinyin('NǏ / nì'), ['nǐ', 'nì']);
});

test('synonymous meanings and equivalent sentence translations cannot become distractors', () => {
  const medicalWords = [
    { ...words[0]!, hanzi: '医生', pinyin: 'yīshēng', meaning: 'doctor' },
    { ...words[1]!, hanzi: '大夫', pinyin: 'dàifu', meaning: 'physician' },
    ...words.slice(2),
  ];
  const synonymousRules = rules.map((rule, index) => index < 2 ? {
    ...rule,
    examples: [{
      id: `${rule.id}-1`,
      hanzi: index === 0 ? '我很高兴。' : '我很开心。',
      pinyin: index === 0 ? 'Wǒ hěn gāoxìng.' : 'Wǒ hěn kāixīn.',
      translation: index === 0 ? 'I am happy.' : 'I am glad.',
    }],
  } : rule);
  const pool = createQuizPool(medicalWords, synonymousRules, {});
  const checked = new Set<string>();
  const rng = random(83);
  for (let attempt = 0; attempt < 80; attempt++) {
    for (const q of sampleQuiz(pool, rng)) {
      const index = q.targetId === 'w0' || q.targetId === 'g0' ? 0 : q.targetId === 'w1' || q.targetId === 'g1' ? 1 : -1;
      if (index < 0) continue;
      if (q.type === 'meaning' || q.type === 'hanzi') {
        const other = medicalWords[1 - index]!;
        assert.equal(q.options.includes(q.type === 'meaning' ? other.meaning : other.hanzi), false);
        checked.add(q.type);
      } else if (q.type === 'grammar') {
        assert.equal(q.options.includes(synonymousRules[1 - index]!.examples[0]!.translation), false);
        checked.add(q.type);
      }
    }
  }
  assert.deepEqual([...checked].sort(), ['grammar', 'hanzi', 'meaning']);
});
