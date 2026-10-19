import './entry.css';

let entryShown = false;

const orbits = [
  { rx: 555, ry: 195, tilt: -24 },
  { rx: 457, ry: 150, tilt: 29 },
  { rx: 350, ry: 115, tilt: -6 },
];
const planets = [
  { id: 'mineral', orbit: 0, phase: 3.65, speed: .075 },
  { id: 'io', orbit: 0, phase: .8, speed: .14 },
  { id: 'lavender', orbit: 1, phase: 5.7, speed: .095 },
  { id: 'europa', orbit: 1, phase: 2.2, speed: .095 },
  { id: 'titan', orbit: 2, phase: 1.2, speed: .12 },
  { id: 'callisto', orbit: 2, phase: 4.5, speed: .12 },
];
const artwork = `${import.meta.env.BASE_URL}entry-art.svg`;
const useArtwork = (id: string) => `<use href="${artwork}#${id}" />`;

// Match HeroSky's tilted projection once; CSS advances the planets without
// a per-frame JavaScript loop.
function orbitPath({ rx, ry, tilt }: typeof orbits[number]): string {
  const radians = tilt * Math.PI / 180;
  const x = rx * Math.cos(radians);
  const y = rx * Math.sin(radians);
  return `M${720 + x} ${475 + y} A${rx} ${ry} ${tilt} 0 1 ${720 - x} ${475 - y} A${rx} ${ry} ${tilt} 0 1 ${720 + x} ${475 + y}`;
}

function planetLayer(front: boolean): string {
  return planets.map(planet => {
    const visible = front === (Math.sin(planet.phase) >= 0);
    const opacity = visible ? (front ? 1 : .64) : 0;
    return `<g class="entry-planet entry-planet--${front ? 'front' : 'rear'}" style="offset-path:path('${orbitPath(orbits[planet.orbit])}');offset-distance:${planet.phase / (Math.PI * 2) * 100}%;--entry-period:${Math.PI * 2 / planet.speed}s;--entry-delay:${-planet.phase / planet.speed}s;opacity:${opacity}">${useArtwork(`entry-body-${planet.id}`)}</g>`;
  }).join('');
}

/** Show once per Android document, before application initialization starts. */
export function setupAndroidEntry(): void {
  if (entryShown) return;
  entryShown = true;

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const background = document.querySelectorAll<HTMLElement>('body > header, body > main, body > footer');
  for (const node of background) node.inert = true;
  const dialog = document.createElement('section');
  dialog.className = 'entry-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'entry-title');
  dialog.innerHTML = `
    <svg class="entry-constellation" viewBox="0 0 1280 600" fill="none" aria-hidden="true" focusable="false">${useArtwork('entry-constellation')}</svg>
    <svg class="entry-orbital" viewBox="0 0 1440 1000" fill="none" aria-hidden="true" focusable="false">
      ${useArtwork('entry-decoration')}
      ${useArtwork('entry-orbits-rear')}${planetLayer(false)}
      ${useArtwork('entry-sun')}
      ${useArtwork('entry-orbits-front')}${planetLayer(true)}
    </svg>
    <h1 id="entry-title" class="entry-title">HanPit</h1>
    <svg class="entry-landscape entry-landscape--wide" viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">${useArtwork('entry-landscape')}</svg>
    <svg class="entry-landscape entry-landscape--mobile" viewBox="0 0 1440 420" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false">${useArtwork('entry-landscape-mobile')}</svg>
    <button class="entry-open" type="button" aria-label="Open HanPit" autofocus>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="m6 15 6-6 6 6" /></svg>
    </button>`;
  document.body.append(dialog);
  document.documentElement.classList.add('entry-open');

  const controller = new AbortController();
  const options = { signal: controller.signal };
  const button = dialog.querySelector<HTMLButtonElement>('button')!;
  let gesture: { id: number; x: number; y: number; axis?: 'vertical' | 'horizontal' } | undefined;
  let suppressClick = false;
  let dismissing = false;
  let removed = false;
  let removalTimer: number | undefined;

  function resetGesture(): void {
    if (!gesture) return;
    const { id } = gesture;
    gesture = undefined;
    suppressClick = true;
    if (dialog.hasPointerCapture(id)) dialog.releasePointerCapture(id);
  }

  function remove(): void {
    if (removed) return;
    removed = true;
    resetGesture();
    clearTimeout(removalTimer);
    controller.abort();
    dialog.remove();
    for (const node of background) node.inert = false;
    document.documentElement.classList.remove('entry-open');
    const focus = previousFocus && previousFocus !== document.body && previousFocus.isConnected
      ? previousFocus
      : document.querySelector<HTMLElement>('[data-section="home"]');
    focus?.focus({ preventScroll: true });
  }

  function dismiss(): void {
    if (dismissing || removed) return;
    dismissing = true;
    resetGesture();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      remove();
      return;
    }
    dialog.classList.add('entry-dialog--dismissed');
    // Also completes if the WebView backgrounds or an animation is interrupted.
    removalTimer = window.setTimeout(remove, 650);
  }

  dialog.addEventListener('pointerdown', event => {
    if (dismissing || event.button !== 0) return;
    if (!event.isPrimary) {
      resetGesture();
      return;
    }
    suppressClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    // Preserve the button's native click/keyboard activation target.
    if (!(event.target instanceof Element && event.target.closest('button'))) dialog.setPointerCapture(event.pointerId);
  }, options);
  dialog.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id || gesture.axis) return;
    const dx = Math.abs(event.clientX - gesture.x);
    const dy = Math.abs(event.clientY - gesture.y);
    if (Math.max(dx, dy) >= 12) gesture.axis = dy > dx ? 'vertical' : 'horizontal';
  }, options);
  dialog.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = Math.abs(event.clientX - gesture.x);
    const up = gesture.y - event.clientY;
    const vertical = gesture.axis !== 'horizontal';
    const threshold = Math.max(64, Math.min(120, dialog.clientHeight * .09));
    const dragged = Math.max(dx, Math.abs(up)) >= 12;
    resetGesture();
    suppressClick = dragged;
    if (vertical && up >= threshold && up > dx * 1.4) dismiss();
  }, options);
  dialog.addEventListener('pointercancel', resetGesture, options);
  dialog.addEventListener('lostpointercapture', resetGesture, options);
  button.addEventListener('click', event => {
    if (event.detail !== 0 && suppressClick) return;
    dismiss();
  }, options);
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      button.focus({ preventScroll: true });
    } else if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  }, options);
  dialog.addEventListener('animationend', event => {
    if (event.target === dialog && dismissing) remove();
  }, options);

  function updateVisibility(): void {
    resetGesture();
    dialog.style.setProperty('--entry-play-state', document.hidden ? 'paused' : 'running');
    if (document.hidden && dismissing) remove();
  }
  document.addEventListener('visibilitychange', updateVisibility, options);
  function pause(): void {
    resetGesture();
    dialog.style.setProperty('--entry-play-state', 'paused');
    if (dismissing) remove();
  }
  window.addEventListener('pagehide', pause, options);
  document.addEventListener('pause', pause, options);
  document.addEventListener('resume', updateVisibility, options);
  window.addEventListener('pageshow', updateVisibility, options);
  window.addEventListener('blur', resetGesture, options);
  updateVisibility();
  button.focus({ preventScroll: true });
}
