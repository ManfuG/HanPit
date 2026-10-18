export interface Curriculum {
  level: number;
  words: string[];
  grammar: string[];
}

const cache = new Map<number, Promise<Curriculum>>();

export function loadCurriculum(level: number): Promise<Curriculum> {
  let pending = cache.get(level);
  if (!pending) {
    pending = fetch(`${import.meta.env.BASE_URL}data/curriculum-level-${level}.json`)
      .then(async response => {
        if (!response.ok) throw new Error(`Percorso HSK ${level === 7 ? '7–9' : level}: HTTP ${response.status}.`);
        return await response.json() as Curriculum;
      })
      .catch((error: unknown) => {
        cache.delete(level);
        throw error;
      });
    cache.set(level, pending);
  }
  return pending;
}
