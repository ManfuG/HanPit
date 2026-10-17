import { createEmptyCard, fsrs, State, type Card, type RecordLog } from 'ts-fsrs';
import type { Word } from './types';

export type { Grade } from 'ts-fsrs';

const scheduler = fsrs({
  request_retention: 0.9,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['1m', '10m'],
  relearning_steps: ['10m'],
});

export function preview(card: Card | undefined, now: Date): RecordLog {
  return scheduler.repeat(card ?? createEmptyCard(now), now);
}

export function getStudyState(
  words: readonly Word[],
  progress: ReadonlyMap<string, Card>,
  now: Date,
): { word?: Word; newCount: number; dueCount: number; studiedCount: number; nextDue?: Date } {
  let firstNew: Word | undefined;
  let learning: Word | undefined;
  let review: Word | undefined;
  let learningDue = Infinity;
  let reviewDue = Infinity;
  let nextDue: Date | undefined;
  let newCount = 0;
  let dueCount = 0;
  let studiedCount = 0;
  const time = now.getTime();

  for (const word of words) {
    const card = progress.get(word.id);
    if (card) studiedCount++;
    if (!card || card.state === State.New) {
      newCount++;
      firstNew ??= word;
      continue;
    }

    const due = card.due.getTime();
    if (due > time) {
      if (!nextDue || due < nextDue.getTime()) nextDue = card.due;
      continue;
    }

    dueCount++;
    if (card.state === State.Learning || card.state === State.Relearning) {
      if (due < learningDue) {
        learning = word;
        learningDue = due;
      }
    } else if (due < reviewDue) {
      review = word;
      reviewDue = due;
    }
  }

  return { word: learning ?? review ?? firstNew, newCount, dueCount, studiedCount, nextDue };
}
