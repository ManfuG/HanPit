import { loadCurriculum } from './curriculum';
import type { Word } from './types';

const levels = new Map<number, Promise<Word[]>>();
const decks = new Map<number, Promise<Word[]>>();

export function loadVocabulary(level: number): Promise<Word[]> {
  let deck = decks.get(level);
  if (!deck) {
    deck = Promise.all(Array.from({ length: level }, (_, index) => {
      const n = index + 1;
      let pending = levels.get(n);
      if (!pending) {
        pending = Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/level-${n}.json`).then(async response => {
            if (!response.ok) throw new Error(`HSK ${n} vocabulary: HTTP ${response.status}.`);
            return await response.json() as Word[];
          }),
          loadCurriculum(n),
        ])
          .then(([words, curriculum]) => {
            const byId = new Map(words.map(word => [word.id, word]));
            return curriculum.words.map(id => byId.get(id)!);
          })
          .catch((error: unknown) => {
            levels.delete(n);
            throw error;
          });
        levels.set(n, pending);
      }
      return pending;
    }))
      .then(words => words.flat())
      .catch((error: unknown) => {
        decks.delete(level);
        throw error;
      });
    decks.set(level, deck);
  }
  return deck;
}
