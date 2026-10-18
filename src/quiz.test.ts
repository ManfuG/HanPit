import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuizPool, sampleQuiz, normalizePinyin, wordMeaningsOverlap, grammarExamplesOverlap } from './quiz.ts';
import type { Word } from './types.ts';
import type { GrammarRule } from './grammar.ts';

const rows = [
  ['书', 'shū', 'book', 'libro'], ['猫', 'māo', 'cat', 'gatto'],
  ['狗', 'gǒu', 'dog', 'cane'], ['水', 'shuǐ', 'water', 'acqua'],
  ['火', 'huǒ', 'fire', 'fuoco'], ['山', 'shān', 'mountain', 'montagna'],
  ['雨', 'yǔ', 'rain', 'pioggia'], ['风', 'fēng', 'wind', 'vento'],
  ['门', 'mén', 'door', 'porta'], ['窗', 'chuāng', 'window', 'finestra'],
  ['花', 'huā', 'flower', 'fiore'], ['树', 'shù', 'tree', 'albero'],
  ['鱼', 'yú', 'fish', 'pesce'], ['鸟', 'niǎo', 'bird', 'uccello'],
  ['车', 'chē', 'vehicle', 'veicolo'], ['船', 'chuán', 'boat', 'barca'],
  ['笔', 'bǐ', 'pen', 'penna'], ['纸', 'zhǐ', 'paper', 'carta'],
  ['米', 'mǐ', 'rice', 'riso'], ['盐', 'yán', 'salt', 'sale'],
  ['长', 'cháng', 'long', 'lungo'], ['掌', 'zhǎng', 'palm', 'palmo'],
  ['常', 'cháng', 'often', 'spesso'], ['糖', 'táng', 'sugar', 'zucchero'],
];
const words: Word[] = rows.map(([hanzi, pinyin, meaning], i) => ({ id: `w${i}`, level: 1, hanzi: hanzi!, pinyin: pinyin!, meaning: meaning! }));
const italian = Object.fromEntries(rows.map((row, i) => [`w${i}`, row[3]!]));
const sentences = [
  ['我读书。', 'Wǒ dú shū.', 'Leggo un libro.'],
  ['猫睡觉。', 'Māo shuìjiào.', 'Il gatto dorme.'],
  ['狗跑得快。', 'Gǒu pǎo de kuài.', 'Il cane corre veloce.'],
  ['天下雨了。', 'Tiān xià yǔ le.', 'Piove.'],
  ['花开了。', 'Huā kāi le.', 'Il fiore è sbocciato.'],
  ['船到了。', 'Chuán dào le.', 'La barca è arrivata.'],
];
const rules: GrammarRule[] = sentences.map(([hanzi, pinyin, translation], i) => ({
  id: `g${i}`, level: 1, sourceNo: i, title: '', pattern: '', explanation: '',
  examples: [{ id: `g${i}-1`, hanzi: hanzi!, pinyin: pinyin!, translation: translation! }],
}));
function random(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

test('every attempt has five questions of each type, unique targets and correctly shuffled answers', () => {
  const pool = createQuizPool(words, rules, italian, { 长: ['cháng', 'zhǎng'] });
  const quiz = sampleQuiz(pool, random(42));
  assert.equal(quiz.length, 20);
  for (const type of ['pinyin', 'meaning', 'hanzi', 'grammar']) assert.equal(quiz.filter(q => q.type === type).length, 5);
  assert.equal(new Set(quiz.map(q => q.targetId)).size, 20);
  for (const q of quiz) {
    assert.equal(new Set(q.options).size, 4);
    const word = words.find(w => w.id === q.targetId);
    const expected = q.type === 'grammar' ? rules.find(r => r.id === q.targetId)!.examples[0]!.translation
      : q.type === 'pinyin' ? word!.pinyin : q.type === 'meaning' ? italian[q.targetId] : word!.hanzi;
    assert.equal(q.options[q.correctIndex], expected);
  }
});

test('all source words and rules remain eligible, including final array entries', () => {
  const pool = createQuizPool(words, rules, italian, {});
  const seen = new Set<string>();
  const rng = random(2718);
  for (let attempt = 0; attempt < 60; attempt++) for (const q of sampleQuiz(pool, rng)) seen.add(q.targetId);
  assert.deepEqual([...seen].sort(), [...words.map(w => w.id), ...rules.map(r => r.id)].sort());
});

test('another valid reading of the target character cannot be offered as a wrong answer', () => {
  const pool = createQuizPool(words, rules, italian, { 长: ['cháng / zhǎng'] });
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

test('synonyms and equivalent sentence translations are excluded conservatively', () => {
  const doctor = { ...words[0]!, hanzi: '医生', meaning: 'doctor; physician' };
  const physician = { ...words[1]!, hanzi: '大夫', meaning: 'physician' };
  assert.equal(wordMeaningsOverlap(doctor, 'medico', physician, 'dottore'), true);
  assert.equal(wordMeaningsOverlap(doctor, 'medico', words[2]!, italian.w2!), false);
  const happy = { id: 'a', hanzi: '我很高兴。', pinyin: 'Wǒ hěn gāoxìng.', translation: 'Sono felice.' };
  const glad = { id: 'b', hanzi: '我很开心。', pinyin: 'Wǒ hěn kāixīn.', translation: 'Sono contento.' };
  assert.equal(grammarExamplesOverlap(happy, glad), true);
  assert.equal(grammarExamplesOverlap(happy, rules[0]!.examples[0]!), false);
});
