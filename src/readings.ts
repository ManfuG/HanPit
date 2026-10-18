import type { Card } from 'ts-fsrs';
import { loadCurriculum, type Curriculum } from './curriculum';
import { getStudiedPrefix, requiredVocabulary } from './study-access';

export interface ReadingParagraph {
  hanzi: string;
  pinyin: string;
  translation: string;
}

export interface Reading {
  id: string;
  title: string;
  paragraphs: ReadingParagraph[];
  grammarIds: string[];
}

interface ReadingLesson {
  readings: Reading[];
  curricula: Curriculum[];
}

const cache = new Map<number, Promise<ReadingLesson>>();

function loadReadings(level: number): Promise<ReadingLesson> {
  let pending = cache.get(level);
  if (!pending) {
    pending = Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/readings-level-${level}.json`)
        .then(async response => {
          if (!response.ok) throw new Error(`Readings HSK ${level === 7 ? '7–9' : level}: HTTP ${response.status}.`);
          return await response.json() as Reading[];
        }),
      Promise.all(Array.from({ length: level }, (_, index) => loadCurriculum(index + 1))),
    ])
      .then(([readings, curricula]) => ({ readings, curricula }))
      .catch((error: unknown) => {
        cache.delete(level);
        throw error;
      });
    cache.set(level, pending);
  }
  return pending;
}

export function createReadings(section: HTMLElement, getProgress: () => ReadonlyMap<string, Card>) {
  const status = document.createElement('p');
  status.className = 'readings-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  const list = document.createElement('div');
  list.id = 'readings-list';
  const supports = document.createElement('div');
  supports.className = 'reading-supports';
  function toggle(labelText: string, className: string) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      for (const text of list.querySelectorAll<HTMLElement>(`.${className}`)) text.hidden = !input.checked;
    });
    label.append(input, document.createTextNode(labelText));
    supports.append(label);
    return input;
  }
  const showPinyin = toggle('Pinyin', 'reading-pinyin');
  const showTranslation = toggle('Translation', 'reading-translation');
  section.append(status, supports, list);
  let request = 0;
  let active = false;
  let renderedLevel: number | undefined;
  let renderedLesson: ReadingLesson | undefined;
  let rows: { details: HTMLDetailsElement; summary: HTMLElement; label: string; required: number }[] = [];

  function fillBody(details: HTMLDetailsElement, reading: Reading) {
    const body = document.createElement('div');
    body.className = 'reading-body';
    body.lang = 'zh-CN';
    for (const paragraph of reading.paragraphs) {
      const text = document.createElement('p');
      text.textContent = paragraph.hanzi;
      const pinyin = document.createElement('p');
      pinyin.className = 'reading-pinyin';
      pinyin.lang = 'zh-Latn';
      pinyin.textContent = paragraph.pinyin;
      pinyin.hidden = !showPinyin.checked;
      const translation = document.createElement('p');
      translation.className = 'reading-translation';
      translation.lang = 'en';
      translation.textContent = paragraph.translation;
      translation.hidden = !showTranslation.checked;
      body.append(text, pinyin, translation);
    }
    details.append(body);
  }

  function refreshReadiness() {
    const prefix = getStudiedPrefix(renderedLesson!.curricula, getProgress());
    for (const { details, summary, label, required } of rows) {
      const ready = prefix >= required;
      if (details.dataset.ready === String(ready)) continue;
      details.dataset.ready = String(ready);
      summary.setAttribute('aria-label', `${label}. Flashcards 1–${required}. ${ready ? 'Ready: all required vocabulary has been studied.' : 'Not ready: required vocabulary has not all been studied.'}`);
    }
  }

  async function show(level: number) {
    active = true;
    const currentRequest = ++request;
    if (renderedLevel === level) {
      refreshReadiness();
      return;
    }
    list.replaceChildren();
    renderedLevel = undefined;
    renderedLesson = undefined;
    rows = [];
    section.setAttribute('aria-busy', 'true');
    status.setAttribute('role', 'status');
    status.textContent = 'Loading readings…';
    status.hidden = false;
    try {
      const lesson = await loadReadings(level);
      if (!active || request !== currentRequest) return;
      const { readings, curricula } = lesson;
      const wordCount = curricula[level - 1].words.length;
      const fragment = document.createDocumentFragment();
      for (const [index, reading] of readings.entries()) {
        const details = document.createElement('details');
        details.className = 'reading';
        details.id = reading.id;
        const summary = document.createElement('summary');
        const label = `${index + 1}. ${reading.title}`;
        summary.textContent = label;
        const cutoff = document.createElement('small');
        cutoff.className = 'lesson-cutoff';
        const required = requiredVocabulary(wordCount, index + 1, 10);
        cutoff.textContent = `Flashcards 1–${required}`;
        summary.append(cutoff);
        details.append(summary);
        rows.push({ details, summary, label, required });
        let filled = false;
        details.addEventListener('toggle', () => {
          if (details.open && !filled) {
            filled = true;
            fillBody(details, reading);
          }
        });
        fragment.append(details);
      }
      list.append(fragment);
      renderedLevel = level;
      renderedLesson = lesson;
      refreshReadiness();
      status.hidden = true;
    } catch (error) {
      if (!active || request !== currentRequest) return;
      const message = error instanceof Error ? error.message : String(error);
      status.setAttribute('role', 'alert');
      status.textContent = `Unable to load readings. ${message} Select Readings or a level again to retry.`;
    } finally {
      if (request === currentRequest) section.setAttribute('aria-busy', 'false');
    }
  }

  function hide() {
    active = false;
    request += 1;
    section.setAttribute('aria-busy', 'false');
  }

  return { show, hide };
}
