import assert from 'node:assert/strict';
import test from 'node:test';
import { getStudiedPrefix, requiredVocabulary } from './study-access.ts';

const reviewed = Object.freeze({ reps: 1 });
const unreviewed = Object.freeze({ reps: 0 });

test('grammar and reading cutoffs preserve their floored proportional boundaries', () => {
  assert.deepEqual([1, 2, 3, 4].map(index => requiredVocabulary(23, index, 4)), [5, 11, 17, 23]);
  assert.deepEqual([1, 2, 9, 10].map(index => requiredVocabulary(23, index, 10)), [2, 4, 20, 23]);
});

test('unreviewed cards and unrelated progress do not make the first lesson ready', () => {
  const curricula = [{ words: ['a', 'b', 'c', 'd'] }];
  const progress = new Map([['a', unreviewed], ['unrelated', reviewed], ['later-level', reviewed]]);
  assert.equal(getStudiedPrefix(curricula, new Map()), 0);
  assert.equal(getStudiedPrefix(curricula, progress), 0);
  assert.equal(getStudiedPrefix(curricula, progress) >= requiredVocabulary(4, 1, 2), false);
  assert.equal(progress.get('a'), unreviewed);
  assert.equal(progress.size, 3);
});

test('the exact required prefix becomes ready only when the last review reaches progress', () => {
  const curricula = [{ words: ['a', 'b', 'c', 'd', 'e'] }];
  const progress = new Map([['a', reviewed]]);
  const required = requiredVocabulary(5, 1, 2);
  const pendingReview = reviewed;
  assert.equal(getStudiedPrefix(curricula, progress), required - 1);
  assert.equal(getStudiedPrefix(curricula, progress) >= required, false);
  progress.set('b', pendingReview);
  assert.equal(getStudiedPrefix(curricula, progress), required);
  assert.equal(getStudiedPrefix(curricula, progress) >= required, true);
  assert.equal(getStudiedPrefix(curricula, progress) >= requiredVocabulary(5, 2, 2), false);
});

test('later studied words cannot fill a hole in the required contiguous prefix', () => {
  const curricula = [{ words: ['a', 'b', 'c', 'd'] }];
  const progress = new Map([['a', reviewed], ['c', reviewed], ['d', reviewed], ['extra', reviewed]]);
  const required = requiredVocabulary(4, 1, 2);
  assert.equal(progress.size, 4);
  assert.equal(getStudiedPrefix(curricula, progress), 1);
  assert.equal(getStudiedPrefix(curricula, progress) >= required, false);
  progress.set('b', reviewed);
  assert.equal(getStudiedPrefix(curricula, progress), 4);
  assert.equal(getStudiedPrefix(curricula, progress) >= required, true);
});

test('a hole in any prior level blocks every lesson even when the selected level is complete', () => {
  const curricula = [
    { words: ['old-a', 'old-b'] },
    { words: ['middle-a', 'middle-b'] },
    { words: ['current-a', 'current-b'] },
  ];
  const progress = new Map([
    ['old-a', reviewed], ['old-b', unreviewed],
    ['middle-a', reviewed], ['middle-b', reviewed],
    ['current-a', reviewed], ['current-b', reviewed],
  ]);
  const firstRequired = requiredVocabulary(2, 1, 2);
  assert.equal(getStudiedPrefix(curricula, progress), -1);
  assert.equal(getStudiedPrefix(curricula, progress) >= firstRequired, false);
  progress.set('old-b', reviewed);
  progress.delete('middle-b');
  assert.equal(getStudiedPrefix(curricula, progress), -1);
  progress.set('middle-b', reviewed);
  assert.equal(getStudiedPrefix(curricula, progress), 2);
  assert.equal(getStudiedPrefix(curricula, progress) >= requiredVocabulary(2, 2, 2), true);
});
