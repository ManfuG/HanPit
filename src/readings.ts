import { loadCurriculum } from './curriculum';

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
  wordCount: number;
}

const cache = new Map<number, Promise<ReadingLesson>>();

function loadReadings(level: number): Promise<ReadingLesson> {
  let pending = cache.get(level);
  if (!pending) {
    pending = Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/readings-level-${level}.json`)
        .then(async response => {
          if (!response.ok) throw new Error(`Letture HSK ${level === 7 ? '7–9' : level}: HTTP ${response.status}.`);
          return await response.json() as Reading[];
        }),
      loadCurriculum(level),
    ])
      .then(([readings, curriculum]) => ({ readings, wordCount: curriculum.words.length }))
      .catch((error: unknown) => {
        cache.delete(level);
        throw error;
      });
    cache.set(level, pending);
  }
  return pending;
}

export function createReadings(section: HTMLElement) {
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
  const showTranslation = toggle('Traduzione', 'reading-translation');
  section.append(status, supports, list);
  let request = 0;
  let active = false;
  let renderedLevel: number | undefined;

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
      translation.lang = 'it';
      translation.textContent = paragraph.translation;
      translation.hidden = !showTranslation.checked;
      body.append(text, pinyin, translation);
    }
    details.append(body);
  }

  async function show(level: number) {
    active = true;
    const currentRequest = ++request;
    if (renderedLevel === level) return;
    list.replaceChildren();
    renderedLevel = undefined;
    section.setAttribute('aria-busy', 'true');
    status.setAttribute('role', 'status');
    status.textContent = 'Caricamento delle letture…';
    status.hidden = false;
    try {
      const { readings, wordCount } = await loadReadings(level);
      if (!active || request !== currentRequest) return;
      const fragment = document.createDocumentFragment();
      for (const [index, reading] of readings.entries()) {
        const details = document.createElement('details');
        details.className = 'reading';
        details.id = reading.id;
        const summary = document.createElement('summary');
        summary.textContent = `${index + 1}. ${reading.title}`;
        const cutoff = document.createElement('small');
        cutoff.className = 'lesson-cutoff';
        cutoff.textContent = `Flashcard 1–${Math.floor(wordCount * (index + 1) / 10)}`;
        summary.append(cutoff);
        details.append(summary);
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
      status.hidden = true;
    } catch (error) {
      if (!active || request !== currentRequest) return;
      const message = error instanceof Error ? error.message : String(error);
      status.setAttribute('role', 'alert');
      status.textContent = `Impossibile caricare le letture. ${message} Seleziona di nuovo Letture o un livello per riprovare.`;
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
