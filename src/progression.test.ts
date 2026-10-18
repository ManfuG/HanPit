import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestResult, initialProgress } from './progression.ts';

test('the twentieth consecutive perfect test unlocks the next level, not the nineteenth', () => {
  const progress = initialProgress();
  for (let i = 0; i < 19; i++) applyTestResult(progress, 1, true);
  assert.equal(progress.streaks.get(1), 19);
  assert.equal(progress.unlockedLevel, 1);
  applyTestResult(progress, 1, true);
  assert.equal(progress.streaks.get(1), 20);
  assert.equal(progress.unlockedLevel, 2);
});

test('an error resets only its level and does not relock previously unlocked content', () => {
  const progress = initialProgress();
  for (let i = 0; i < 20; i++) applyTestResult(progress, 1, true);
  applyTestResult(progress, 2, true);
  applyTestResult(progress, 1, false);
  assert.equal(progress.streaks.get(1) ?? 0, 0);
  assert.equal(progress.streaks.get(2), 1);
  assert.equal(progress.unlockedLevel, 2);
  applyTestResult(progress, 1, true);
  assert.equal(progress.streaks.get(1), 1);
});

test('locked or invalid levels cannot accumulate successes', () => {
  const progress = initialProgress();
  for (const level of [0, 2, 7, 1.5, NaN]) assert.throws(() => applyTestResult(progress, level, true));
  assert.equal(progress.streaks.size, 0);
  assert.equal(progress.unlockedLevel, 1);
});

test('successes beyond the target remain consecutive and the final block never creates level eight', () => {
  const progress = initialProgress();
  for (let level = 1; level <= 7; level++) {
    for (let i = 0; i < 21; i++) applyTestResult(progress, level, true);
    assert.equal(progress.streaks.get(level), 21);
  }
  assert.equal(progress.unlockedLevel, 7);
  applyTestResult(progress, 7, false);
  assert.equal(progress.streaks.get(7) ?? 0, 0);
  assert.equal(progress.unlockedLevel, 7);
});
