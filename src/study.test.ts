import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyCard, Rating, State, type Card } from 'ts-fsrs';
import { getStudyState, preview } from './study.ts';
import type { Word } from './types.ts';

const now = new Date('2026-01-15T12:00:00.000Z');
const minute = 60_000;
const day = 24 * 60 * minute;
const words: readonly Word[] = Object.freeze([
  { id: 'new', level: 1, hanzi: '你', pinyin: 'nǐ', meaning: 'you', speech: 'pronoun' },
  { id: 'review', level: 1, hanzi: '好', pinyin: 'hǎo', meaning: 'good', speech: 'adjective' },
  { id: 'learning', level: 1, hanzi: '我', pinyin: 'wǒ', meaning: 'I', speech: 'pronoun' },
  { id: 'relearning', level: 1, hanzi: '他', pinyin: 'tā', meaning: 'he', speech: 'pronoun' },
  { id: 'later', level: 2, hanzi: '她', pinyin: 'tā', meaning: 'she', speech: 'pronoun' },
]);

function scheduled(state: State, offset: number): Card {
  const card = createEmptyCard(now);
  return { ...card, state, reps: 1, due: new Date(now.getTime() + offset), last_review: now };
}

test('due learning/relearning precede older reviews and new words; earliest due wins', () => {
  const progress = new Map<string, Card>([
    ['review', scheduled(State.Review, -day)],
    ['learning', scheduled(State.Learning, -minute)],
    ['relearning', scheduled(State.Relearning, -2 * minute)],
    ['later', scheduled(State.Review, day)],
  ]);
  const state = getStudyState(words, progress, now);
  assert.equal(state.word, words[3]);
  assert.equal(state.dueCount, 3);
  assert.equal(state.newCount, 1);
  assert.equal(state.studiedCount, 4);
  assert.equal(state.nextDue?.getTime(), now.getTime() + day);

  progress.delete('relearning');
  assert.equal(getStudyState(words, progress, now).word, words[2]);
  progress.delete('learning');
  assert.equal(getStudyState(words, progress, now).word, words[1]);
});

test('equal due dates preserve source order within each due category', () => {
  for (const state of [State.Learning, State.Relearning, State.Review]) {
    const progress = new Map<string, Card>([
      ['learning', scheduled(state, 0)],
      ['review', scheduled(state, 0)],
    ]);
    assert.equal(getStudyState(words, progress, now).word, words[1]);
  }
  const progress = new Map<string, Card>([
    ['review', scheduled(State.Review, -minute)],
    ['learning', scheduled(State.Review, -2 * minute)],
  ]);
  assert.equal(getStudyState(words, progress, now).word, words[2]);
});

test('future cards never appear early and nextDue includes short learning steps', () => {
  const eligible = words.slice(1, 4);
  const progress = new Map<string, Card>([
    ['review', scheduled(State.Review, day)],
    ['learning', scheduled(State.Learning, minute)],
    ['relearning', scheduled(State.Relearning, 10 * minute)],
    ['outside', scheduled(State.Review, 1)],
  ]);
  const before = getStudyState(eligible, progress, now);
  assert.equal(before.word, undefined);
  assert.equal(before.dueCount, 0);
  assert.equal(before.newCount, 0);
  assert.equal(before.studiedCount, 3);
  assert.equal(before.nextDue?.getTime(), now.getTime() + minute);
  assert.equal(getStudyState(eligible, progress, new Date(now.getTime() + minute)).word, words[2]);
  assert.equal(getStudyState(words, progress, now).word, words[0]);
  assert.deepEqual(getStudyState([], progress, now), {
    word: undefined, newCount: 0, dueCount: 0, studiedCount: 0, nextDue: undefined,
  });
});

test('cumulative level expansion keeps existing progress and unlocks every new word', () => {
  const progress = new Map<string, Card>();
  for (const word of words.slice(0, 4)) progress.set(word.id, preview(undefined, now)[Rating.Easy].card);
  const before = getStudyState(words.slice(0, 4), progress, now);
  assert.equal(before.word, undefined);
  assert.equal(before.studiedCount, 4);
  const expanded = getStudyState(words, progress, now);
  assert.equal(expanded.word, words[4]);
  assert.equal(expanded.newCount, 1);
  assert.equal(expanded.studiedCount, 4);
  assert.equal(expanded.nextDue?.getTime(), before.nextDue?.getTime());
  progress.set(words[4].id, preview(undefined, now)[Rating.Easy].card);
  assert.equal(getStudyState(words, progress, now).newCount, 0);
  assert.equal(getStudyState(words, progress, now).studiedCount, 5);
});

test('FSRS Again and Good use learning steps, then graduate and reappear only when due', () => {
  const eligible = words.slice(0, 1);
  const progress = new Map<string, Card>();
  const options = preview(undefined, now);
  assert.equal(options[Rating.Again].card.due.getTime(), now.getTime() + minute);
  assert.equal(options[Rating.Hard].card.due.getTime(), now.getTime() + 6 * minute);
  assert.equal(options[Rating.Good].card.due.getTime(), now.getTime() + 10 * minute);
  assert.equal(options[Rating.Again].card.state, State.Learning);
  assert.equal(options[Rating.Good].card.state, State.Learning);
  progress.set(words[0].id, options[Rating.Again].card);
  assert.equal(getStudyState(eligible, progress, now).word, undefined);
  const againDue = options[Rating.Again].card.due;
  assert.equal(getStudyState(eligible, progress, againDue).word, words[0]);

  const good = preview(progress.get(words[0].id), againDue)[Rating.Good].card;
  assert.equal(good.state, State.Learning);
  assert.equal(good.due.getTime(), againDue.getTime() + 10 * minute);
  progress.set(words[0].id, good);
  assert.equal(getStudyState(eligible, progress, againDue).word, undefined);
  assert.equal(getStudyState(eligible, progress, good.due).word, words[0]);

  const graduated = preview(good, good.due)[Rating.Good].card;
  assert.equal(graduated.state, State.Review);
  assert.equal(graduated.reps, 3);
  assert.ok(graduated.stability > 0);
  assert.ok(graduated.difficulty > 0);
  assert.ok(graduated.scheduled_days >= 1);
  assert.equal(graduated.due.getTime(), good.due.getTime() + graduated.scheduled_days * day);
  progress.set(words[0].id, graduated);
  assert.equal(getStudyState(eligible, progress, new Date(graduated.due.getTime() - 1)).word, undefined);
  assert.equal(getStudyState(eligible, progress, graduated.due).word, words[0]);
});

test('Easy graduates immediately using FSRS-6, and a failed review uses the relearning step', () => {
  const easy = preview(undefined, now)[Rating.Easy].card;
  assert.equal(easy.state, State.Review);
  assert.ok(easy.scheduled_days >= 1);
  assert.equal(easy.due.getTime(), now.getTime() + easy.scheduled_days * day);
  const failed = preview(easy, easy.due)[Rating.Again].card;
  assert.equal(failed.state, State.Relearning);
  assert.equal(failed.lapses, 1);
  assert.equal(failed.due.getTime(), easy.due.getTime() + 10 * minute);
  const progress = new Map([[words[0].id, failed]]);
  assert.equal(getStudyState(words.slice(0, 1), progress, easy.due).word, undefined);
  assert.equal(getStudyState(words.slice(0, 1), progress, failed.due).word, words[0]);
  const recovered = preview(failed, failed.due)[Rating.Good].card;
  assert.equal(recovered.state, State.Review);
  assert.ok(recovered.due.getTime() > failed.due.getTime());
});

test('previews are deterministic, do not mutate inputs, and accept date-revived progress', () => {
  const card = preview(undefined, now)[Rating.Easy].card;
  const serialized = JSON.stringify(card);
  const restored: Card = JSON.parse(serialized, (key, value) =>
    (key === 'due' || key === 'last_review') && typeof value === 'string' ? new Date(value) : value,
  );
  assert.ok(restored.due instanceof Date);
  assert.ok(restored.last_review instanceof Date);
  Object.freeze(card);
  const timeBefore = card.due.getTime();
  const nowBefore = now.getTime();
  const first = preview(card, card.due);
  const repeated = preview(card, card.due);
  const revived = preview(restored, restored.due);
  for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const) {
    assert.deepEqual(repeated[grade], first[grade]);
    assert.deepEqual(revived[grade], first[grade]);
  }
  assert.equal(JSON.stringify(card), serialized);
  assert.equal(card.due.getTime(), timeBefore);
  assert.equal(now.getTime(), nowBefore);
  assert.equal(first[Rating.Good].log.rating, Rating.Good);
  assert.equal(first[Rating.Good].log.review.getTime(), card.due.getTime());
  assert.equal(first[Rating.Good].card.reps, card.reps + 1);
  const progress = new Map([[words[0].id, restored]]);
  const snapshot = JSON.stringify([...progress]);
  getStudyState(words, progress, now);
  assert.equal(JSON.stringify([...progress]), snapshot);
});
