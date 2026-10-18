import type { GrammarExample, GrammarRule } from './grammar';
import type { Word } from './types';

export type QuestionType = 'pinyin' | 'meaning' | 'grammar' | 'hanzi';
export interface QuizQuestion {
  type: QuestionType;
  targetId: string;
  prompt: string;
  options: readonly string[];
  correctIndex: number;
}
export type Random = () => number;
export type PinyinReadings = Readonly<Record<string, readonly string[]>>;

interface WordEntry {
  word: Word;
  readings: Set<string>;
  senses: Set<string>;
}
interface ExampleEntry {
  ruleId: string;
  example: GrammarExample;
  concepts: Set<string>;
  characters: Set<string>;
}
export interface QuizPool {
  readonly words: readonly WordEntry[];
  readonly examples: readonly ExampleEntry[];
  readonly ruleIds: readonly string[];
  readonly examplesByRule: ReadonlyMap<string, readonly ExampleEntry[]>;
}

const ignored = new Set(`a an the to of for in on at by with from and or as be is are it its one that this sth sb cl also see variant used esp lit fig etc do have has had not no never i you he she we they my your his her our their than then can may would will does doing`.split(/\s+/));
const conceptGroups = [
  'doctor physician',
  'teacher instructor',
  'home house',
  'book books',
  'shop store',
  'buy purchase',
  'eat eating',
  'drink drinking',
  'speak say tell talk',
  'watch see look',
  'go going',
  'want wish desire',
  'beautiful pretty',
  'joyful happy glad',
  'car automobile',
  'child children kid',
  'student pupil',
  'work job',
  'start begin',
  'end finish',
  'fast quick',
];
const concepts = new Map<string, string>();
for (const [index, group] of conceptGroups.entries()) {
  for (const token of group.split(' ')) concepts.set(token, `concept-${index}`);
}

function normalized(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalized(text).split(/\s+/).filter(token => token && !ignored.has(token))
    .map(token => concepts.get(token) ?? (token.length >= 6 ? token.slice(0, 5) : token)));
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/** Tone marks are significant; case, syllable spacing and apostrophe style are not. */
export function normalizePinyin(value: string): string[] {
  return [...new Set(value.normalize('NFC').toLowerCase().split('/').map(part =>
    part.replace(/[\s'’‘·.\-]+/gu, '').trim()).filter(Boolean))];
}


// Common function characters cannot establish lexical similarity by themselves.
const functionCharacters = new Set('我你您他她它们的地得了着过是在有把被让给和与或也都就才又还很更最不没无别这那哪谁什么几多少吗呢吧啊呀一二三四五六七八九十百千万个些本只位条件次岁时候将会能可以要想应该为由于而则之所其此以于及并且');
function characters(text: string): Set<string> {
  return new Set([...text].filter(value => /\p{Script=Han}/u.test(value) && !functionCharacters.has(value)));
}


export function createQuizPool(
  words: readonly Word[], rules: readonly GrammarRule[], pinyin: PinyinReadings,
): QuizPool {
  const seenWords = new Set<string>();
  const entries = words.map(word => {
    if (seenWords.has(word.id)) throw new Error(`Duplicate word: ${word.id}.`);
    seenWords.add(word.id);
    if (!word.meaning.trim()) throw new Error(`Missing English meaning: ${word.id}.`);
    const readings = new Set([word.pinyin, ...(pinyin[word.hanzi] ?? [])].flatMap(normalizePinyin));
    return { word, readings, senses: tokens(word.meaning) };
  });
  const ruleIds = new Set<string>();
  const examples: ExampleEntry[] = [];
  const examplesByRule = new Map<string, ExampleEntry[]>();
  for (const rule of rules) {
    if (ruleIds.has(rule.id)) throw new Error(`Duplicate rule: ${rule.id}.`);
    if (!rule.examples.length) throw new Error(`Missing examples: ${rule.id}.`);
    ruleIds.add(rule.id);
    const entries = rule.examples.map(example => ({
      ruleId: rule.id, example, concepts: tokens(example.translation), characters: characters(example.hanzi),
    }));
    examples.push(...entries);
    examplesByRule.set(rule.id, entries);
  }
  return { words: entries, examples, ruleIds: [...ruleIds], examplesByRule };
}

function shuffled<T>(values: T[], random: Random): T[] {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

function selected<T>(values: readonly T[], count: number, random: Random): T[] {
  const indices = new Set<number>();
  for (let index = values.length - count; index < values.length; index++) {
    const candidate = Math.floor(random() * (index + 1));
    indices.add(indices.has(candidate) ? index : candidate);
  }
  return shuffled(Array.from(indices, index => values[index]!), random);
}

function question(type: QuestionType, targetId: string, prompt: string, answer: string, distractors: string[], random: Random): QuizQuestion {
  if (distractors.length !== 3) throw new Error(`Not enough unambiguous options for ${targetId}.`);
  const options = shuffled([answer, ...distractors], random);
  return { type, targetId, prompt, options, correctIndex: options.indexOf(answer) };
}

/** All source entries remain eligible targets; no fixed question bank or fallback quotas. */
export function sampleQuiz(pool: QuizPool, random: Random = Math.random): QuizQuestion[] {
  if (pool.words.length < 15 || pool.ruleIds.length < 5) throw new Error('At least 15 words and 5 rules are required.');
  const targets = selected(pool.words, 15, random);
  const result: QuizQuestion[] = [];
  let index = 0;
  for (const type of ['pinyin', 'meaning', 'hanzi'] as const) {
    for (let n = 0; n < 5; n++) {
      const target = targets[index++]!;
      const answer = type === 'pinyin' ? target.word.pinyin : type === 'meaning' ? target.word.meaning : target.word.hanzi;
      const answerKey = normalized(target.word.meaning);
      const options: string[] = [];
      const used = new Set([normalized(answer)]);
      const offeredReadings = new Set(target.readings);
      for (let i = 0, start = Math.floor(random() * pool.words.length); i < pool.words.length; i++) {
        const choice = pool.words[(start + i) % pool.words.length]!;
        if (choice.word.hanzi === target.word.hanzi) continue;
        const value = type === 'pinyin' ? choice.word.pinyin : type === 'meaning' ? choice.word.meaning : choice.word.hanzi;
        const key = normalized(value);
        // Pinyin equality must retain tone marks, unlike English text equality.
        if (type === 'pinyin') {
          const readings = normalizePinyin(value);
          if (readings.some(reading => offeredReadings.has(reading))) continue;
          for (const reading of readings) offeredReadings.add(reading);
        } else {
          if (normalized(choice.word.meaning) === answerKey) continue;
          if (used.has(key) || intersects(target.senses, choice.senses)) continue;
        }
        if (options.includes(value)) continue;
        used.add(key);
        options.push(value);
        if (options.length === 3) break;
      }
      result.push(question(type, target.word.id, type === 'hanzi' ? target.word.meaning : target.word.hanzi, answer, options, random));
    }
  }
  for (const ruleId of selected(pool.ruleIds, 5, random)) {
    const examples = pool.examplesByRule.get(ruleId)!;
    const target = examples[Math.floor(random() * examples.length)]!;
    const options: string[] = [];
    const used = new Set([normalized(target.example.translation)]);
    for (let i = 0, start = Math.floor(random() * pool.examples.length); i < pool.examples.length; i++) {
      const choice = pool.examples[(start + i) % pool.examples.length]!;
      if (choice.ruleId === ruleId || normalized(choice.example.hanzi) === normalized(target.example.hanzi)) continue;
      const key = normalized(choice.example.translation);
      if (used.has(key) || intersects(target.concepts, choice.concepts) || intersects(target.characters, choice.characters)) continue;
      used.add(key);
      options.push(choice.example.translation);
      if (options.length === 3) break;
    }
    result.push(question('grammar', ruleId, target.example.hanzi, target.example.translation, options, random));
  }
  return shuffled(result, random);
}
