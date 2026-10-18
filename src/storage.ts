import type { Card, ReviewLog } from 'ts-fsrs';
import { applyTestResult, initialProgress, type TestProgress } from './progression';

interface StoredCard {
  id: string;
  card: Card;
}

export interface StudyStorage {
  progress: Map<string, Card>;
  level: number;
  unlockedLevel: number;
  streaks: Map<number, number>;
  recordTest(level: number, perfect: boolean): Promise<void>;
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
  request.onblocked = () => reject(new Error('Close the other HanPit tabs and reload.'));
  const db = await promise;

  function completed(tx: IDBTransaction): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Saving interrupted.'));
    tx.onerror = () => reject(tx.error ?? new Error('Saving interrupted.'));
    return promise;
  }
  db.onversionchange = () => db.close();

  // User-requested cutover reset: atomic and applied once per browser/origin.
  const reset = db.transaction(['cards', 'reviews', 'settings'], 'readwrite');
  const resetDone = completed(reset);
  const revision = reset.objectStore('settings').get('progressRevision');
  revision.onsuccess = () => {
    if ((revision.result ?? 0) >= 1) return;
    reset.objectStore('cards').clear();
    reset.objectStore('reviews').clear();
    reset.objectStore('settings').clear();
    reset.objectStore('settings').put(1, 'progressRevision');
  };
  await resetDone;

  const tx = db.transaction(['cards', 'settings'], 'readonly');
  const ready = completed(tx);
  const cardsRequest = tx.objectStore('cards').getAll();
  const levelRequest = tx.objectStore('settings').get('level');
  const testRequest = tx.objectStore('settings').get('testProgress');
  await ready;
  // IndexedDB structured cloning preserves Dates without JSON conversion.
  const progress = new Map<string, Card>((cardsRequest.result as StoredCard[]).map(({ id, card }) => [id, card]));
  const savedLevel: unknown = levelRequest.result;
  const testProgress = (testRequest.result as TestProgress | undefined) ?? initialProgress();
  const level = typeof savedLevel === 'number' && Number.isInteger(savedLevel) && savedLevel >= 1 && savedLevel <= testProgress.unlockedLevel ? savedLevel : 1;

  const storage: StudyStorage = {
    progress,
    level,
    unlockedLevel: testProgress.unlockedLevel,
    streaks: testProgress.streaks,
    async recordTest(level: number, perfect: boolean) {
      const tx = db.transaction('settings', 'readwrite');
      const done = completed(tx);
      const settings = tx.objectStore('settings');
      const request = settings.get('testProgress');
      let next: TestProgress;
      let updateError: unknown;
      request.onsuccess = () => {
        try {
          next = (request.result as TestProgress | undefined) ?? initialProgress();
          applyTestResult(next, level, perfect);
          settings.put(next, 'testProgress');
        } catch (error) {
          updateError = error;
          tx.abort();
        }
      };
      try {
        await done;
      } catch (error) {
        throw updateError ?? error;
      }
      storage.unlockedLevel = next!.unlockedLevel;
      storage.streaks = next!.streaks;
    },
    async setLevel(level: number) {
      if (!Number.isInteger(level) || level < 1 || level > storage.unlockedLevel) {
        throw new Error('HSK level locked.');
      }
      const tx = db.transaction('settings', 'readwrite');
      const done = completed(tx);
      tx.objectStore('settings').put(level, 'level');
      await done;
      storage.level = level;
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
  return storage;
}
