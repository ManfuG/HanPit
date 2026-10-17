import './style.css';
import { getStudyState, preview, type Grade } from './study';
import { openStorage, type StudyStorage } from './storage';
import { createPronunciation } from './audio';
import { createGrammar } from './grammar';
import type { Word } from './types';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const levelSelect = element<HTMLSelectElement>('level');
const revealButton = element<HTMLButtonElement>('reveal');
const ratings = element('ratings');
const speakButton = element<HTMLButtonElement>('speak');
const flashcards = element('flashcards');
const pronunciation = createPronunciation(element('speech-status'));
const grammar = createGrammar(element('grammar'), pronunciation);
const gradeButtons = [...ratings.querySelectorAll<HTMLButtonElement>('button')];
const dateFormat = new Intl.DateTimeFormat('it', { dateStyle: 'short', timeStyle: 'short' });
const numberFormat = new Intl.NumberFormat('it');
const cache = new Map<number, Promise<Word[]>>();
let storage: StudyStorage;
let words: Word[] = [];
let current: Word | undefined;
let revealed = false;
let busy = true;
let activeSection = 'flashcards';
let level = 1;
let wakeTimer: number | undefined;
let ready = false;
let levelSaving = false;
let deckLoading = false;
let deckLevel: number | undefined;
let deckRequest = 0;
let needsStudyRender = false;

function updateControls() {
  levelSelect.disabled = !ready || busy;
  revealButton.disabled = busy || deckLoading;
  gradeButtons.forEach(button => { button.disabled = busy || deckLoading; });
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  element('error').textContent = `Impossibile completare l’operazione. ${message}`;
  element('error').hidden = false;
}

async function loadDeck(target: number): Promise<Word[]> {
  const levels = await Promise.all(Array.from({ length: target }, (_, index) => {
    const n = index + 1;
    let pending = cache.get(n);
    if (!pending) {
      pending = fetch(`${import.meta.env.BASE_URL}data/level-${n}.json`)
        .then(async response => {
          if (!response.ok) throw new Error(`Vocabolario HSK ${n}: HTTP ${response.status}.`);
          return await response.json() as Word[];
        })
        .catch((error: unknown) => {
          cache.delete(n);
          throw error;
        });
      cache.set(n, pending);
    }
    return pending;
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
  if (activeSection !== 'flashcards' || deckLevel !== level) return;
  needsStudyRender = false;
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
  if (busy || deckLoading || !current || !revealed || activeSection !== 'flashcards' || document.hidden) return;
  void pronunciation.play();
}

function reveal() {
  if (busy || deckLoading || !current || revealed || activeSection !== 'flashcards') return;
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
  if (busy || deckLoading || !revealed || !current || activeSection !== 'flashcards') return;
  const rated = current;
  pronunciation.stop();
  busy = true;
  updateControls();
  try {
    const outcome = preview(storage.progress.get(rated.id), new Date())[grade];
    await storage.review(rated.id, outcome.card, outcome.log);
    needsStudyRender = true;
    if (activeSection === 'flashcards') {
      element('error').hidden = true;
      render();
      revealButton.focus({ preventScroll: true });
    }
  } catch (error) {
    if (activeSection === 'flashcards') showError(error);
  } finally {
    busy = false;
    updateControls();
  }
}

revealButton.addEventListener('click', reveal);
speakButton.addEventListener('click', speak);
gradeButtons.forEach(button => button.addEventListener('click', () => { void rate(Number(button.dataset.grade) as Grade); }));

async function showDeck() {
  const request = ++deckRequest;
  const target = level;
  if (deckLevel === target) {
    if (!current || needsStudyRender) render();
    else pronunciation.preload(current.id);
    return;
  }
  deckLoading = true;
  current = undefined;
  revealed = false;
  flashcards.setAttribute('aria-busy', 'true');
  element('card').hidden = true;
  revealButton.hidden = true;
  ratings.hidden = true;
  element('empty').hidden = false;
  element('empty').textContent = 'Caricamento…';
  for (const id of ['new-count', 'due-count', 'studied-count']) element(id).textContent = '—';
  updateControls();
  try {
    const nextWords = await loadDeck(target);
    if (request !== deckRequest || activeSection !== 'flashcards' || target !== level) return;
    words = nextWords;
    deckLevel = target;
    render();
  } catch (error) {
    if (request !== deckRequest || activeSection !== 'flashcards' || target !== level) return;
    element('empty').textContent = 'Caricamento non riuscito. Seleziona di nuovo Flashcard o un livello per riprovare.';
    showError(error);
  } finally {
    if (request === deckRequest) {
      deckLoading = false;
      flashcards.setAttribute('aria-busy', 'false');
      updateControls();
    }
  }
}

function showSection() {
  pronunciation.stop();
  clearTimeout(wakeTimer);
  deckRequest += 1;
  deckLoading = false;
  flashcards.setAttribute('aria-busy', 'false');
  grammar.hide();
  element('error').hidden = true;
  element('section-heading').hidden = activeSection === 'tests';
  element('section-title').textContent = activeSection === 'grammar' ? 'Grammatica' : 'Flashcard';
  for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-section]')) {
    const active = tab.dataset.section === activeSection;
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
    element(tab.dataset.section!).hidden = !active;
  }
  updateControls();
  if (!ready || levelSaving) return;
  if (activeSection === 'flashcards') void showDeck();
  else if (activeSection === 'grammar') void grammar.show(level);
}

levelSelect.addEventListener('change', async () => {
  pronunciation.stop();
  clearTimeout(wakeTimer);
  deckRequest += 1;
  deckLoading = false;
  grammar.hide();
  busy = true;
  levelSaving = true;
  updateControls();
  let saveError: unknown;
  try {
    const target = Number(levelSelect.value);
    await storage.setLevel(target);
    level = target;
  } catch (error) {
    levelSelect.value = String(level);
    saveError = error;
  } finally {
    busy = false;
    levelSaving = false;
    showSection();
    if (saveError !== undefined && activeSection !== 'tests') showError(saveError);
  }
});

for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-section]')) {
  tab.addEventListener('click', () => {
    activeSection = tab.dataset.section!;
    showSection();
  });
}

document.addEventListener('keydown', event => {
  if (activeSection !== 'flashcards' || busy || deckLoading || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if ((event.target as HTMLElement).matches('select, input, textarea, a, [contenteditable]')) return;
  if (event.code === 'Space' && !revealed) {
    event.preventDefault();
    reveal();
  } else if (revealed && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    void rate(Number(event.key) as Grade);
  }
});

window.addEventListener('focus', () => {
  if (ready && activeSection === 'flashcards' && !busy && !deckLoading && !current && deckLevel === level) render();
});
window.addEventListener('pagehide', pronunciation.stop);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pronunciation.stop();
});

async function start() {
  try {
    storage = await openStorage();
    level = storage.level;
    levelSelect.value = String(level);
    ready = true;
    busy = false;
    showSection();
  } catch (error) {
    element('empty').textContent = 'Caricamento non riuscito. Ricarica la pagina per riprovare.';
    if (activeSection !== 'tests') showError(error);
    flashcards.setAttribute('aria-busy', 'false');
  }
}

void start();
