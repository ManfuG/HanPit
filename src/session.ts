import type { Card, ReviewLog } from 'ts-fsrs';
import type { TestProgress } from './progression';

export interface SessionCard {
  id: string;
  card: Card;
}

export interface SessionReview {
  id: string;
  log: ReviewLog;
}

export interface Session {
  cards: SessionCard[];
  reviews: SessionReview[];
  level: number;
  testProgress: TestProgress;
}

// Official GF0025-2021 blocks; block 7 is the shared HSK 7–9 vocabulary.
const wordCounts = [500, 772, 973, 1000, 1071, 1140, 5636];
const schedulingFields = ['due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'state'];

function invalid(): never {
  throw new Error('Invalid HanPit session data.');
}

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(record, key)) ||
      Object.keys(record).some(key => !required.includes(key) && !optional.includes(key))) invalid();
  return record;
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) invalid();
  return value;
}

function decimal(value: unknown, min: number, max = Number.MAX_VALUE): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) invalid();
  return value;
}

function date(value: unknown): Date {
  if (typeof value !== 'string') invalid();
  const result = new Date(value);
  if (!Number.isFinite(result.getTime()) || result.toISOString() !== value) invalid();
  return result;
}

function wordId(value: unknown, unlockedLevel: number): string {
  if (typeof value !== 'string') invalid();
  const match = /^L([1-7])-([0-9]{4})$/.exec(value);
  if (!match) invalid();
  const level = Number(match[1]);
  integer(Number(match[2]), 1, wordCounts[level - 1]);
  if (level > unlockedLevel) invalid();
  return value;
}

function scheduling(value: Record<string, unknown>): Omit<Card, 'reps' | 'lapses' | 'last_review'> {
  const state = integer(value.state, 0, 3);
  // Older persisted FSRS records can omit this counter; preserve that absence.
  return {
    due: date(value.due),
    stability: decimal(value.stability, 0),
    difficulty: decimal(value.difficulty, 0, 10),
    elapsed_days: integer(value.elapsed_days, 0),
    scheduled_days: integer(value.scheduled_days, 0),
    ...(Object.hasOwn(value, 'learning_steps') ? { learning_steps: integer(value.learning_steps, 0) } : {}),
    state,
  } as Omit<Card, 'reps' | 'lapses' | 'last_review'>;
}

export function encodeSession(session: Session): string {
  return JSON.stringify({
    format: 'HanPit session',
    version: 1,
    level: session.level,
    unlockedLevel: session.testProgress.unlockedLevel,
    streaks: [...session.testProgress.streaks],
    cards: session.cards,
    reviews: session.reviews,
  }, null, 2);
}

export function decodeSession(source: string): Session {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('The session file is not valid JSON.');
  }
  const root = object(parsed, ['format', 'version', 'level', 'unlockedLevel', 'streaks', 'cards', 'reviews']);
  if (root.format !== 'HanPit session' || root.version !== 1) {
    throw new Error('Unsupported HanPit session format or version.');
  }
  const unlockedLevel = integer(root.unlockedLevel, 1, 7);
  const level = integer(root.level, 1, unlockedLevel);
  if (!Array.isArray(root.streaks) || !Array.isArray(root.cards) || !Array.isArray(root.reviews)) invalid();
  const streaks = new Map<number, number>();
  for (const entry of root.streaks) {
    if (!Array.isArray(entry) || entry.length !== 2) invalid();
    const atLevel = integer(entry[0], 1, unlockedLevel);
    const count = integer(entry[1], 1);
    if (streaks.has(atLevel) || (count >= 20 && atLevel < 7 && unlockedLevel <= atLevel)) invalid();
    streaks.set(atLevel, count);
  }

  const ids = new Set<string>();
  const cards = root.cards.map((entry): SessionCard => {
    const stored = object(entry, ['id', 'card']);
    const id = wordId(stored.id, unlockedLevel);
    if (ids.has(id)) invalid();
    ids.add(id);
    const value = object(stored.card, [...schedulingFields, 'reps', 'lapses'], ['last_review', 'learning_steps']);
    const reps = integer(value.reps, 0);
    const card: Card = { ...scheduling(value), reps, lapses: integer(value.lapses, 0, reps) };
    if (Object.hasOwn(value, 'last_review')) card.last_review = date(value.last_review);
    if (reps > 0 && !card.last_review) invalid();
    if (card.state !== 0 && (reps === 0 || card.stability <= 0 || card.difficulty < 1)) invalid();
    return { id, card };
  });
  const reviews = root.reviews.map((entry): SessionReview => {
    const stored = object(entry, ['id', 'log']);
    const id = wordId(stored.id, unlockedLevel);
    if (!ids.has(id)) invalid();
    const value = object(stored.log, [...schedulingFields, 'rating', 'last_elapsed_days', 'review'], ['learning_steps']);
    const log: ReviewLog = {
      ...scheduling(value),
      rating: integer(value.rating, 0, 4),
      last_elapsed_days: integer(value.last_elapsed_days, 0),
      review: date(value.review),
    };
    return { id, log };
  });
  return { cards, reviews, level, testProgress: { unlockedLevel, streaks } };
}
