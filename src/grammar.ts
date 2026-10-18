import type { Card } from 'ts-fsrs';
import type { Pronunciation } from './audio';
import { loadCurriculum, type Curriculum } from './curriculum';
import { getStudiedPrefix, requiredVocabulary } from './study-access';

export interface GrammarExample {
  id: string;
  hanzi: string;
  pinyin: string;
  translation: string;
}

export interface GrammarRule {
  id: string;
  level: number;
  sourceNo: number;
  title: string;
  pattern: string;
  explanation: string;
  examples: GrammarExample[];
}

interface GrammarLesson {
  rules: GrammarRule[];
  curricula: Curriculum[];
}

const cache = new Map<number, Promise<GrammarLesson>>();

export function loadRules(level: number): Promise<GrammarLesson> {
  let pending = cache.get(level);
  if (!pending) {
    pending = Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/grammar-level-${level}.json`)
        .then(async response => {
          if (!response.ok) throw new Error(`Grammar HSK ${level === 7 ? '7–9' : level}: HTTP ${response.status}.`);
          return await response.json() as GrammarRule[];
        }),
      Promise.all(Array.from({ length: level }, (_, index) => loadCurriculum(index + 1))),
    ])
      .then(([rules, curricula]) => {
        const byId = new Map(rules.map(rule => [rule.id, rule]));
        return {
          rules: curricula[level - 1].grammar.map(id => byId.get(id)!),
          curricula,
        };
      })
      .catch((error: unknown) => {
        cache.delete(level);
        throw error;
      });
    cache.set(level, pending);
  }
  return pending;
}

export function createGrammar(
  section: HTMLElement,
  pronunciation: Pronunciation,
  getProgress: () => ReadonlyMap<string, Card>,
) {
  const status = document.createElement('p');
  status.className = 'grammar-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  const list = document.createElement('div');
  list.id = 'grammar-list';
  section.append(status, list);
  let request = 0;
  let active = false;
  let renderedLevel: number | undefined;
  let renderedLesson: GrammarLesson | undefined;
  let rows: { details: HTMLDetailsElement; summary: HTMLElement; label: string; required: number }[] = [];
  let playingDetails: HTMLDetailsElement | undefined;

  function fillBody(details: HTMLDetailsElement, rule: GrammarRule) {
    const body = document.createElement('div');
    body.className = 'grammar-body';
    const pattern = document.createElement('p');
    pattern.className = 'grammar-pattern';
    const label = document.createElement('strong');
    label.textContent = 'Pattern: ';
    pattern.append(label, rule.pattern);
    const explanation = document.createElement('p');
    explanation.textContent = rule.explanation;
    body.append(pattern, explanation);
    for (const example of rule.examples) {
      const block = document.createElement('div');
      block.className = 'grammar-example';
      const hanzi = document.createElement('p');
      hanzi.className = 'grammar-hanzi';
      hanzi.lang = 'zh-CN';
      hanzi.textContent = example.hanzi;
      const pinyin = document.createElement('p');
      pinyin.className = 'grammar-pinyin';
      pinyin.lang = 'zh-Latn';
      pinyin.textContent = example.pinyin;
      const translation = document.createElement('p');
      translation.textContent = example.translation;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'speak';
      button.textContent = 'Listen';
      button.setAttribute('aria-label', `Listen: ${example.hanzi}`);
      button.dataset.example = example.id;
      const audioStatus = document.createElement('p');
      audioStatus.id = `speech-${example.id}`;
      audioStatus.className = 'grammar-audio-status';
      audioStatus.setAttribute('role', 'status');
      audioStatus.hidden = true;
      button.setAttribute('aria-describedby', audioStatus.id);
      button.addEventListener('click', () => {
        if (!active || !details.open || document.hidden) return;
        playingDetails = details;
        pronunciation.preload(`grammar/${example.id}`, audioStatus);
        void pronunciation.play();
      });
      block.append(hanzi, pinyin, translation, button, audioStatus);
      body.append(block);
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
    status.textContent = 'Loading grammar…';
    status.hidden = false;
    try {
      const lesson = await loadRules(level);
      if (!active || request !== currentRequest) return;
      const { rules, curricula } = lesson;
      const wordCount = curricula[level - 1].words.length;
      const fragment = document.createDocumentFragment();
      for (const [index, rule] of rules.entries()) {
        const details = document.createElement('details');
        details.className = 'grammar-rule';
        details.id = rule.id;
        const summary = document.createElement('summary');
        summary.textContent = rule.title;
        const cutoff = document.createElement('small');
        cutoff.className = 'lesson-cutoff';
        const required = requiredVocabulary(wordCount, index + 1, rules.length);
        cutoff.textContent = `Flashcards 1–${required}`;
        summary.append(cutoff);
        details.append(summary);
        rows.push({ details, summary, label: rule.title, required });
        let filled = false;
        details.addEventListener('toggle', () => {
          if (details.open && !filled) {
            filled = true;
            fillBody(details, rule);
          } else if (!details.open && playingDetails === details) {
            pronunciation.stop();
            playingDetails = undefined;
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
      status.textContent = `Unable to load grammar. ${message} Select Grammar or a level again to retry.`;
    } finally {
      if (request === currentRequest) section.setAttribute('aria-busy', 'false');
    }
  }

  function hide() {
    active = false;
    request += 1;
    playingDetails = undefined;
    section.setAttribute('aria-busy', 'false');
  }

  return { show, hide };
}
