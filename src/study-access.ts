import type { Card } from 'ts-fsrs';
import type { Curriculum } from './curriculum';

export function requiredVocabulary(wordCount: number, lessonNumber: number, lessonCount: number): number {
  return Math.floor(wordCount * lessonNumber / lessonCount);
}

export function getStudiedPrefix(
  curricula: readonly Pick<Curriculum, 'words'>[],
  progress: ReadonlyMap<string, Pick<Card, 'reps'>>,
): number {
  for (let level = 0; level < curricula.length - 1; level++) {
    for (const id of curricula[level].words) {
      if (!((progress.get(id)?.reps ?? 0) > 0)) return -1;
    }
  }

  const words = curricula.at(-1)?.words ?? [];
  let prefix = 0;
  while (prefix < words.length && (progress.get(words[prefix])?.reps ?? 0) > 0) prefix++;
  return prefix;
}
