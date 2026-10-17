import './style.css';
import { getStudyState, preview, type Grade } from './study';
import { openStorage, type StudyStorage } from './storage';
import { createPronunciation } from './audio';
import type { Word } from './types';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const levelSelect = element<HTMLSelectElement>('level');
const revealButton = element<HTMLButtonElement>('reveal');
const ratings = element('ratings');
const speakButton = element<HTMLButtonElement>('speak');
const flashcards = element('flashcards');
const pronunciation = createPronunciation(element('speech-status'));
const gradeButtons = [...ratings.querySelectorAll<HTMLButtonElement>('button')];
const dateFormat = new Intl.DateTimeFormat('it', { dateStyle: 'short', timeStyle: 'short' });
const numberFormat = new Intl.NumberFormat('it');
const cache: Partial<Record<number, Word[]>> = {};
let storage: StudyStorage;
let words: Word[] = [];
let current: Word | undefined;
let revealed = false;
let busy = true;
let activeSection = 'flashcards';
let level = 1;
let wakeTimer: number | undefined;

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  element('error').textContent = `Impossibile completare l’operazione. ${message}`;
  element('error').hidden = false;
}

async function loadDeck(target: number): Promise<Word[]> {
  const levels = await Promise.all(Array.from({ length: target }, async (_, index) => {
    const n = index + 1;
    if (!cache[n]) {
      const response = await fetch(`${import.meta.env.BASE_URL}data/level-${n}.json`);
      if (!response.ok) throw new Error(`Vocabolario HSK ${n}: HTTP ${response.status}.`);
      cache[n] = await response.json() as Word[];
    }
    return cache[n]!;
  }));
  return levels.flat();
}

function interval(due: Date, now: Date): string {
  const minutes = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours} ${hours === 1 ? 'ora' : 'ore'}`;
  }
  const days = Math.round(minutes / 1440);
  return `${numberFormat.format(days)} ${days === 1 ? 'giorno' : 'giorni'}`;
}

function render() {
  clearTimeout(wakeTimer);
  const now = new Date();
  const state = getStudyState(words, storage.progress, now);
  current = state.word;
  revealed = false;
  pronunciation.preload(current?.id);
  element('new-count').textContent = numberFormat.format(state.newCount);
  element('due-count').textContent = numberFormat.format(state.dueCount);
  element('studied-count').textContent = numberFormat.format(state.studiedCount);
  element('card').hidden = !current;
  element('empty').hidden = !!current;
  element('answer').hidden = true;
  ratings.hidden = true;
  revealButton.hidden = !current;
  if (current) {
    element('hanzi').textContent = current.hanzi;
    element('card-level').textContent = `HSK ${current.level === 7 ? '7–9' : current.level}`;
    element('pinyin').textContent = current.pinyin;
    element('meaning').textContent = current.meaning;
  } else {
    element('empty').textContent = state.nextDue
      ? `Nessuna carta da ripassare. Prossimo ripasso: ${dateFormat.format(state.nextDue)}.`
      : 'Nessuna carta da ripassare.';
    if (state.nextDue) {
      wakeTimer = setTimeout(render, Math.min(2_147_483_647, Math.max(100, state.nextDue.getTime() - now.getTime())));
    }
  }
}

function speak() {
  if (busy || !current || !revealed || activeSection !== 'flashcards' || document.hidden) return;
  void pronunciation.play();
}

function reveal() {
  if (busy || !current || revealed) return;
  revealed = true;
  const now = new Date();
  const outcomes = preview(storage.progress.get(current.id), now);
  for (const button of gradeButtons) {
    const grade = Number(button.dataset.grade) as Grade;
    button.querySelector('small')!.textContent = interval(outcomes[grade].card.due, now);
    button.disabled = false;
  }
  element('answer').hidden = false;
  revealButton.hidden = true;
  ratings.hidden = false;
  speak();
  gradeButtons[2].focus({ preventScroll: true });
}

async function rate(grade: Grade) {
  if (busy || !revealed || !current) return;
  pronunciation.stop();
  busy = true;
  gradeButtons.forEach(button => { button.disabled = true; });
  levelSelect.disabled = true;
  try {
    const outcome = preview(storage.progress.get(current.id), new Date())[grade];
    await storage.review(current.id, outcome.card, outcome.log);
    element('error').hidden = true;
    render();
    revealButton.focus({ preventScroll: true });
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    gradeButtons.forEach(button => { button.disabled = false; });
    levelSelect.disabled = false;
  }
}

revealButton.addEventListener('click', reveal);
speakButton.addEventListener('click', speak);
gradeButtons.forEach(button => button.addEventListener('click', () => { void rate(Number(button.dataset.grade) as Grade); }));

levelSelect.addEventListener('change', async () => {
  pronunciation.stop();
  busy = true;
  levelSelect.disabled = true;
  revealButton.disabled = true;
  gradeButtons.forEach(button => { button.disabled = true; });
  try {
    const target = Number(levelSelect.value);
    const nextWords = await loadDeck(target);
    await storage.setLevel(target);
    level = target;
    words = nextWords;
    element('error').hidden = true;
    render();
  } catch (error) {
    levelSelect.value = String(level);
    showError(error);
  } finally {
    busy = false;
    levelSelect.disabled = false;
    revealButton.disabled = false;
    gradeButtons.forEach(button => { button.disabled = false; });
  }
});

for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-section]')) {
  tab.addEventListener('click', () => {
    pronunciation.stop();
    activeSection = tab.dataset.section!;
    for (const other of document.querySelectorAll<HTMLElement>('[data-section]')) {
      const active = other === tab;
      other.toggleAttribute('aria-current', active);
      if (active) other.setAttribute('aria-current', 'page');
      element(other.dataset.section!).hidden = !active;
    }
  });
}

document.addEventListener('keydown', event => {
  if (activeSection !== 'flashcards' || busy || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if ((event.target as HTMLElement).matches('select, input, textarea, a, [contenteditable]')) return;
  if (event.code === 'Space' && !revealed) {
    event.preventDefault();
    reveal();
  } else if (revealed && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    void rate(Number(event.key) as Grade);
  }
});

window.addEventListener('focus', () => { if (!busy && !current) render(); });
window.addEventListener('pagehide', pronunciation.stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pronunciation.stop();
});

async function start() {
  try {
    storage = await openStorage();
    level = storage.level;
    words = await loadDeck(level);
    levelSelect.value = String(level);
    render();
    busy = false;
    levelSelect.disabled = false;
  } catch (error) {
    element('empty').textContent = 'Caricamento non riuscito. Ricarica la pagina per riprovare.';
    showError(error);
  } finally {
    flashcards.setAttribute('aria-busy', 'false');
  }
}

void start();
