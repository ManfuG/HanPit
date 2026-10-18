export interface TestProgress {
  unlockedLevel: number;
  streaks: Map<number, number>;
}

export function initialProgress(): TestProgress {
  return { unlockedLevel: 1, streaks: new Map() };
}

export function applyTestResult(progress: TestProgress, level: number, perfect: boolean): void {
  if (!Number.isInteger(level) || level < 1 || level > progress.unlockedLevel) {
    throw new Error('HSK level locked.');
  }
  if (!perfect) {
    progress.streaks.delete(level);
    return;
  }
  const streak = (progress.streaks.get(level) ?? 0) + 1;
  progress.streaks.set(level, streak);
  if (streak >= 20) progress.unlockedLevel = Math.max(progress.unlockedLevel, Math.min(7, level + 1));
}
