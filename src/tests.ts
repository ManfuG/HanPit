import { loadRules } from './grammar';
import { createQuizPool, sampleQuiz, type PinyinReadings, type QuizPool, type QuizQuestion } from './quiz';
import type { StudyStorage } from './storage';
import { loadVocabulary } from './vocabulary';

export interface TestsSection {
  show(level: number): Promise<void>;
  hide(): void;
}

const pools = new Map<number, Promise<QuizPool>>();
let pinyinRequest: Promise<PinyinReadings> | undefined;

async function fetchData<T>(file: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}.`);
  return await response.json() as T;
}

function loadPinyin(): Promise<PinyinReadings> {
  pinyinRequest ??= fetchData<PinyinReadings>('test-pinyin.json').catch((error: unknown) => {
    pinyinRequest = undefined;
    throw error;
  });
  return pinyinRequest;
}

function loadPool(level: number): Promise<QuizPool> {
  let pending = pools.get(level);
  if (!pending) {
    const levels = Array.from({ length: level }, (_, index) => index + 1);
    pending = Promise.all([
      loadVocabulary(level),
      Promise.all(levels.map(loadRules)),
      loadPinyin(),
    ])
      .then(([words, lessons, pinyin]) => createQuizPool(
        words, lessons.flatMap(lesson => lesson.rules), pinyin,
      ))
      .catch((error: unknown) => {
        pools.delete(level);
        throw error;
      });
    pools.set(level, pending);
  }
  return pending;
}

interface Attempt {
  level: number;
  questions: QuizQuestion[];
  index: number;
  score: number;
  selected: number | undefined;
  failed: boolean;
}

interface CommittedAnswer {
  current: Attempt;
  index: number;
  correct: boolean;
}

interface PendingResult {
  level: number;
  perfect: boolean;
  saving: boolean;
  error: string | undefined;
  answer: CommittedAnswer;
}

const instructions: Record<QuizQuestion['type'], string> = {
  pinyin: 'Choose the correct pinyin.',
  meaning: 'Choose the correct meaning.',
  grammar: 'Choose the English translation of the sentence.',
  hanzi: 'Choose the hanzi matching the English meaning.',
};

const optionLanguages: Record<QuizQuestion['type'], string> = {
  pinyin: 'zh-Latn',
  meaning: 'en',
  grammar: 'en',
  hanzi: 'zh-CN',
};

function levelLabel(level: number): string {
  return `HSK ${level === 7 ? '7–9' : level}`;
}


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createTests(section: HTMLElement, storage: StudyStorage, onProgress: () => void): TestsSection {
  section.lang = 'en';
  const progress = document.createElement('p');
  progress.className = 'test-progress';
  const status = document.createElement('p');
  status.id = 'test-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-atomic', 'true');
  status.hidden = true;
  const body = document.createElement('div');
  section.append(progress, status, body);

  let active = false;
  let request = 0;
  let selectedLevel: number | undefined;
  let pool: QuizPool | undefined;
  let loading = false;
  let loadError: string | undefined;
  let startError: string | undefined;
  let attempt: Attempt | undefined;
  // A committed result outlives navigation, even if its attempt is abandoned.
  let pendingResult: PendingResult | undefined;


  function button(text: string, id: string, action: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.id = id;
    element.textContent = text;
    element.addEventListener('click', action);
    return element;
  }

  function render(focus = false) {
    if (!active || selectedLevel === undefined) return;
    const level = selectedLevel;
    const streak = storage.streaks.get(level) ?? 0;
    progress.textContent = `Consecutive perfect tests: ${streak}/20`;
    section.setAttribute('aria-busy', String(loading || !!pendingResult?.saving));
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.textContent = '';
    body.replaceChildren();

    if (loading) {
      status.textContent = 'Loading vocabulary, grammar and pinyin…';
      status.hidden = false;
    } else if (loadError) {
      status.setAttribute('role', 'alert');
      status.textContent = `Unable to load the test. ${loadError}`;
      status.hidden = false;
      const controls = document.createElement('div');
      controls.className = 'test-controls';
      controls.append(button('Retry loading', 'test-start', () => { void show(level); }));
      body.append(controls);
    }

    if (pendingResult) {
      const result = pendingResult;
      status.hidden = false;
      if (result.saving) {
        status.textContent = `Saving ${levelLabel(result.level)} result…`;
      } else {
        status.setAttribute('role', 'alert');
        status.textContent = `Unable to save the ${levelLabel(result.level)} result. ${result.error ?? ''} The result has not been recorded: retry to continue.`;
        const controls = document.createElement('div');
        controls.className = 'test-controls';
        controls.append(button('Retry saving', 'test-next', () => { void persist(result); }));
        body.append(controls);
      }
    }

    if (!pool || loading || loadError) return;
    const current = attempt;
    if (current && current.index < current.questions.length) {
      renderQuestion(current, focus);
      return;
    } else if (current) {
      const result = document.createElement('h3');
      result.className = 'test-feedback';
      result.tabIndex = -1;
      result.textContent = `Score: ${current.score}/${current.questions.length}`;
      body.append(result);
      if (focus) result.focus();
    }

    if (startError) {
      const error = document.createElement('p');
      error.className = 'test-feedback';
      error.setAttribute('role', 'alert');
      error.textContent = `Unable to prepare the test. ${startError}`;
      body.append(error);
    }
    const readyPool = pool;
    const start = button(current ? 'Retake test' : 'Start test', 'test-start', () => startQuiz(level, readyPool));
    start.disabled = !!pendingResult;
    const controls = document.createElement('div');
    controls.className = 'test-controls';
    controls.append(start);
    body.append(controls);
  }

  function renderQuestion(current: Attempt, focus: boolean) {
    const index = current.index;
    const question = current.questions[index]!;
    const form = document.createElement('form');
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'test-question';
    fieldset.dataset.type = question.type;
    fieldset.disabled = !!pendingResult;
    const legend = document.createElement('legend');
    legend.textContent = `Question ${index + 1} of ${current.questions.length}. ${instructions[question.type]}`;
    const prompt = document.createElement('p');
    prompt.id = 'test-prompt';
    prompt.className = 'test-prompt';
    prompt.lang = question.type === 'hanzi' ? 'en' : 'zh-CN';
    prompt.tabIndex = -1;
    prompt.textContent = question.prompt;
    fieldset.setAttribute('aria-describedby', prompt.id);
    const options = document.createElement('div');
    options.className = 'test-options';
    const next = document.createElement('button');
    next.type = 'submit';
    // The save-retry button owns this ID while a result awaits persistence.
    if (!pendingResult) next.id = 'test-next';
    next.textContent = index === current.questions.length - 1 ? 'Finish' : 'Next';
    next.disabled = current.selected === undefined || !!pendingResult;
    question.options.forEach((value, optionIndex) => {
      const label = document.createElement('label');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'test-answer';
      radio.value = String(optionIndex);
      radio.required = true;
      radio.checked = current.selected === optionIndex;
      radio.addEventListener('change', () => {
        if (!active || attempt !== current || selectedLevel !== current.level
          || current.index !== index || pendingResult || !radio.checked) return;
        current.selected = optionIndex;
        next.disabled = false;
      });
      const text = document.createElement('span');
      text.lang = optionLanguages[question.type];
      text.textContent = value;
      label.append(radio, text);
      options.append(label);
    });
    fieldset.append(legend, prompt, options);
    const controls = document.createElement('div');
    controls.className = 'test-controls';
    controls.append(next);
    form.append(fieldset, controls);
    form.addEventListener('submit', event => {
      event.preventDefault();
      void commitAnswer(current, index);
    });
    body.append(form);
    if (focus) prompt.focus();
  }

  function startQuiz(level: number, readyPool: QuizPool) {
    if (!active || selectedLevel !== level || pool !== readyPool || loading || pendingResult
      || level > storage.unlockedLevel || (attempt && attempt.index < attempt.questions.length)) return;
    try {
      const questions = sampleQuiz(readyPool);
      attempt = { level, questions, index: 0, score: 0, selected: undefined, failed: false };
      startError = undefined;
    } catch (error) {
      startError = errorMessage(error);
    }
    render(true);
  }

  function advanceAnswer(answer: CommittedAnswer): void {
    const current = answer.current;
    current.index = answer.index + 1;
    current.selected = undefined;
    if (answer.correct) current.score += 1;
  }

  async function commitAnswer(current: Attempt, index: number): Promise<void> {
    if (!active || attempt !== current || selectedLevel !== current.level
      || current.index !== index || pendingResult || current.selected === undefined) return;
    const question = current.questions[index]!;
    const correct = current.selected === question.correctIndex;
    const answer: CommittedAnswer = { current, index, correct };
    if (!correct && !current.failed) {
      current.failed = true;
      pendingResult = { level: current.level, perfect: false, saving: false, error: undefined, answer };
      await persist(pendingResult);
    } else if (index === current.questions.length - 1 && correct && current.score === index) {
      pendingResult = { level: current.level, perfect: true, saving: false, error: undefined, answer };
      await persist(pendingResult);
    } else {
      advanceAnswer(answer);
      render(true);
    }
  }

  async function persist(result: PendingResult): Promise<void> {
    if (pendingResult !== result || result.saving) return;
    result.saving = true;
    result.error = undefined;
    render();
    try {
      await storage.recordTest(result.level, result.perfect);
    } catch (error) {
      result.saving = false;
      result.error = errorMessage(error);
      render();
      return;
    }
    advanceAnswer(result.answer);
    // Clear before notifying: a callback failure must never make a committed pass retryable.
    pendingResult = undefined;
    try {
      onProgress();
    } finally {
      render(true);
    }
  }

  async function show(level: number): Promise<void> {
    if (!Number.isInteger(level) || level < 1 || level > 7 || level > storage.unlockedLevel) {
      throw new Error('HSK level locked.');
    }
    active = true;
    const currentRequest = ++request;
    if (selectedLevel !== level) {
      attempt = undefined;
      pool = undefined;
      loadError = undefined;
      startError = undefined;
    }
    selectedLevel = level;
    if (pool) {
      render();
      return;
    }
    loading = true;
    loadError = undefined;
    render();
    try {
      const loaded = await loadPool(level);
      if (!active || request !== currentRequest) return;
      pool = loaded;
    } catch (error) {
      if (!active || request !== currentRequest) return;
      loadError = errorMessage(error);
    } finally {
      if (active && request === currentRequest) {
        loading = false;
        render();
      }
    }
  }

  function hide(): void {
    active = false;
    request += 1;
    section.setAttribute('aria-busy', 'false');
  }

  return { show, hide };
}
