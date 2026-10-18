export interface Pronunciation {
  preload(id: string | undefined, status?: HTMLElement): void;
  play(): Promise<void>;
  stop(): void;
}

export function createPronunciation(defaultStatus: HTMLElement): Pronunciation {
  const audio = new Audio();
  audio.preload = 'auto';
  let source: string | undefined;
  let status = defaultStatus;
  let attempt = 0;
  let onError: (() => void) | undefined;

  function stop() {
    attempt += 1;
    audio.pause();
    if (onError) audio.removeEventListener('error', onError);
    onError = undefined;
    status.hidden = true;
    status.textContent = '';
  }

  function preload(id: string | undefined, nextStatus = defaultStatus) {
    stop();
    status = nextStatus;
    if (id) {
      audio.src = `${import.meta.env.BASE_URL}audio/${id}.mp3`;
      source = audio.src;
    } else {
      audio.removeAttribute('src');
      source = undefined;
    }
    audio.load();
  }

  async function play() {
    stop();
    if (!source) return;
    const playingAttempt = attempt;
    const playingSource = source;
    const showError = (blocked = false) => {
      if (attempt !== playingAttempt || source !== playingSource) return;
      status.textContent = blocked
        ? 'Autoplay blocked. Press Listen to hear the pronunciation.'
        : 'Audio file unavailable or invalid. Press Listen to retry.';
      status.hidden = false;
    };
    onError = () => {
      if (audio.error && audio.currentSrc === playingSource) showError();
    };
    audio.addEventListener('error', onError);
    try {
      // Retry failed preloads so an explicit replay can request the clip again.
      if (audio.error) audio.load();
      audio.currentTime = 0;
      await audio.play();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      showError(error instanceof Error && error.name === 'NotAllowedError');
    }
  }

  return { preload, play, stop };
}
