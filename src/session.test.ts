import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyCard, Rating } from 'ts-fsrs';
import { decodeSession, encodeSession, type Session } from './session.ts';
import { preview } from './study.ts';

const now = new Date('2026-01-15T12:00:00.123Z');

function fixture(): Session {
  const first = preview(undefined, now)[Rating.Easy];
  const failed = preview(first.card, first.card.due)[Rating.Again];
  const recovered = preview(failed.card, failed.card.due)[Rating.Good];
  const learning = preview(undefined, now)[Rating.Again];
  return {
    cards: [{ id: 'L1-0001', card: recovered.card }, { id: 'L7-5636', card: learning.card }],
    reviews: [
      ...[first, failed, recovered].map(({ log }) => ({ id: 'L1-0001', log })),
      { id: 'L7-5636', log: learning.log },
    ],
    level: 6,
    testProgress: { unlockedLevel: 7, streaks: new Map([[1, 21], [3, 7], [7, 42]]) },
  };
}

interface JsonSession {
  format: string;
  version: number;
  level: number;
  unlockedLevel: number;
  streaks: number[][];
  cards: { id: string; card: Record<string, unknown> }[];
  reviews: { id: string; log: Record<string, unknown> }[];
}

function payload(): JsonSession {
  return JSON.parse(encodeSession(fixture())) as JsonSession;
}

test('session round-trip preserves every FSRS field, Date, ordered review, level and streak', () => {
  const original = fixture();
  const source = encodeSession(original);
  const restored = decodeSession(source);
  assert.deepEqual(restored, original);
  assert.deepEqual(JSON.parse(encodeSession(restored)), JSON.parse(source));
  for (const [index, { card }] of restored.cards.entries()) {
    assert.ok(card.due instanceof Date);
    assert.ok(card.last_review instanceof Date);
    const actual = preview(card, card.due);
    const expected = preview(original.cards[index].card, card.due);
    for (const grade of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
      assert.deepEqual(actual[grade], expected[grade]);
    }
  }
  for (const { log } of restored.reviews) {
    assert.ok(log.due instanceof Date);
    assert.ok(log.review instanceof Date);
  }
});

test('empty sessions and new cards preserve absent optional FSRS dates and step counters', () => {
  const empty: Session = { cards: [], reviews: [], level: 1, testProgress: { unlockedLevel: 1, streaks: new Map() } };
  assert.deepEqual(decodeSession(encodeSession(empty)), empty);
  empty.cards.push({ id: 'L1-0500', card: createEmptyCard(now) });
  const newCard = decodeSession(encodeSession(empty)).cards[0].card;
  assert.equal(newCard.last_review, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(newCard)), JSON.parse(JSON.stringify(empty.cards[0].card)));

  const legacy = payload();
  for (const { card } of legacy.cards) delete card.learning_steps;
  for (const { log } of legacy.reviews) delete log.learning_steps;
  const restored = decodeSession(JSON.stringify(legacy));
  assert.ok(restored.cards.every(({ card }) => !Object.hasOwn(card, 'learning_steps')));
  assert.ok(restored.reviews.every(({ log }) => !Object.hasOwn(log, 'learning_steps')));
  assert.deepEqual(JSON.parse(encodeSession(restored)), legacy);
});

test('official ID boundaries are validated without loading vocabulary', () => {
  const counts = [500, 772, 973, 1000, 1071, 1140, 5636];
  for (let level = 1; level <= 7; level++) {
    for (const index of [1, counts[level - 1]]) {
      const value = payload();
      value.cards = [{ id: `L${level}-${String(index).padStart(4, '0')}`, card: value.cards[0].card }];
      value.reviews = [];
      assert.equal(decodeSession(JSON.stringify(value)).cards[0].id, value.cards[0].id);
    }
    for (const index of [0, counts[level - 1] + 1]) {
      const value = payload();
      value.cards[0].id = `L${level}-${String(index).padStart(4, '0')}`;
      assert.throws(() => decodeSession(JSON.stringify(value)));
    }
  }
});

test('malformed envelopes, unsupported formats and versions are rejected', () => {
  for (const source of ['', '{', 'null', '[]', '{}']) assert.throws(() => decodeSession(source));
  for (const change of [
    (value: JsonSession) => { value.format = 'Other app'; },
    (value: JsonSession) => { value.version = 2; },
  ]) {
    const value = payload();
    change(value);
    assert.throws(() => decodeSession(JSON.stringify(value)), /Unsupported HanPit session/);
  }
});

test('invalid identities, FSRS numbers, dates, enums and incomplete records are rejected', () => {
  const invalid: [string, (value: JsonSession) => void][] = [
    ['duplicate card', value => { value.cards.push(value.cards[0]); }],
    ['foreign ID', value => { value.cards[0].id = 'L8-0001'; }],
    ['noncanonical ID', value => { value.cards[0].id = 'L1-1'; }],
    ['foreign review', value => { value.reviews[0].id = 'L1-0002'; }],
    ['missing card field', value => { delete value.cards[0].card.scheduled_days; }],
    ['unknown card field', value => { value.cards[0].card.extra = true; }],
    ['negative stability', value => { value.cards[0].card.stability = -1; }],
    ['null stability', value => { value.cards[0].card.stability = null; }],
    ['difficulty above ten', value => { value.cards[0].card.difficulty = 10.1; }],
    ['negative difficulty', value => { value.cards[0].card.difficulty = -1; }],
    ['fractional repetitions', value => { value.cards[0].card.reps = 1.5; }],
    ['unsafe repetitions', value => { value.cards[0].card.reps = Number.MAX_SAFE_INTEGER + 1; }],
    ['too many lapses', value => { value.cards[0].card.lapses = 100; }],
    ['negative elapsed days', value => { value.cards[0].card.elapsed_days = -1; }],
    ['fractional scheduled days', value => { value.cards[0].card.scheduled_days = 0.5; }],
    ['invalid steps', value => { value.cards[0].card.learning_steps = -1; }],
    ['invalid state', value => { value.cards[0].card.state = 4; }],
    ['string state', value => { value.cards[0].card.state = 'Review'; }],
    ['impossible date', value => { value.cards[0].card.due = '2026-02-30T00:00:00.000Z'; }],
    ['invalid date', value => { value.cards[0].card.due = 'not a date'; }],
    ['numeric date', value => { value.cards[0].card.due = 0; }],
    ['missing last review', value => { delete value.cards[0].card.last_review; }],
    ['null last review', value => { value.cards[0].card.last_review = null; }],
    ['invalid rating', value => { value.reviews[0].log.rating = 5; }],
    ['invalid previous elapsed days', value => { value.reviews[0].log.last_elapsed_days = -1; }],
    ['missing review date', value => { delete value.reviews[0].log.review; }],
    ['invalid review date', value => { value.reviews[0].log.review = 'invalid'; }],
  ];
  for (const [name, change] of invalid) {
    const value = payload();
    change(value);
    assert.throws(() => decodeSession(JSON.stringify(value)), /Invalid HanPit session data/, name);
  }
  const overflow = encodeSession(fixture()).replace(/"stability": [\d.e+-]+/, '"stability": 1e400');
  assert.throws(() => decodeSession(overflow), /Invalid HanPit session data/);
});

test('selected levels and streaks respect unlocked progression without requiring erased old streaks', () => {
  const invalid: ((value: JsonSession) => void)[] = [
    value => { value.level = 0; },
    value => { value.level = 8; },
    value => { value.level = 1.5; },
    value => { value.unlockedLevel = 8; },
    value => { value.unlockedLevel = 0; },
    value => { value.unlockedLevel = 5; },
    value => { value.streaks = [[1, 0]]; },
    value => { value.streaks = [[1, -1]]; },
    value => { value.streaks = [[1, 1.5]]; },
    value => { value.streaks = [[1, Number.MAX_SAFE_INTEGER + 1]]; },
    value => { value.streaks = [[1, 1], [1, 2]]; },
    value => { value.streaks = [[8, 1]]; },
    value => { value.streaks = [[1]]; },
    value => { value.cards = []; value.reviews = []; value.level = 1; value.unlockedLevel = 1; value.streaks = [[1, 20]]; },
    value => { value.cards = []; value.reviews = []; value.level = 1; value.unlockedLevel = 1; value.streaks = [[2, 1]]; },
  ];
  for (const change of invalid) {
    const value = payload();
    change(value);
    assert.throws(() => decodeSession(JSON.stringify(value)), /Invalid HanPit session data/);
  }
  const resetStreaks = payload();
  resetStreaks.streaks = [];
  assert.equal(decodeSession(JSON.stringify(resetStreaks)).testProgress.unlockedLevel, 7);
});
