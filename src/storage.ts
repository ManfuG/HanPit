import type { Card, ReviewLog } from 'ts-fsrs';

interface StoredCard {
  id: string;
  card: Card;
}

export interface StudyStorage {
  progress: Map<string, Card>;
  level: number;
  setLevel(level: number): Promise<void>;
  review(id: string, card: Card, log: ReviewLog): Promise<void>;
}

export async function openStorage(): Promise<StudyStorage> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open('hanpit', 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    db.createObjectStore('cards', { keyPath: 'id' });
    db.createObjectStore('reviews', { autoIncrement: true });
    db.createObjectStore('settings');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error('Chiudi le altre schede di HanPit e ricarica.'));
  const db = await promise;

  function completed(tx: IDBTransaction): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Salvataggio interrotto.'));
    tx.onerror = () => reject(tx.error);
    return promise;
  }
  db.onversionchange = () => db.close();

  const tx = db.transaction(['cards', 'settings'], 'readonly');
  const ready = completed(tx);
  const cardsRequest = tx.objectStore('cards').getAll();
  const levelRequest = tx.objectStore('settings').get('level');
  await ready;
  // IndexedDB structured cloning preserves Dates without JSON conversion.
  const progress = new Map<string, Card>((cardsRequest.result as StoredCard[]).map(({ id, card }) => [id, card]));
  const savedLevel: unknown = levelRequest.result;
  const level = typeof savedLevel === 'number' && Number.isInteger(savedLevel) && savedLevel >= 1 && savedLevel <= 7 ? savedLevel : 1;

  return {
    progress,
    level,
    async setLevel(level: number) {
      const tx = db.transaction('settings', 'readwrite');
      const done = completed(tx);
      tx.objectStore('settings').put(level, 'level');
      await done;
    },
    async review(id: string, card: Card, log: ReviewLog) {
      const tx = db.transaction(['cards', 'reviews'], 'readwrite');
      const done = completed(tx);
      tx.objectStore('cards').put({ id, card } satisfies StoredCard);
      tx.objectStore('reviews').add({ id, log });
      await done;
      progress.set(id, card);
    },
  };
}
