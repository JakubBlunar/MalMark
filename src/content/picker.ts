import { selectedEpisode } from './detect';
import { selectorFor } from './selectors';

let stopCurrent: (() => void) | undefined;

export function startPicker(
  save: (titleSelector: string, episodeSelector: string) => Promise<void>,
): void {
  stopCurrent?.();
  const host = document.createElement('div');
  host.id = 'malmark-site-setup';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:24px;top:24px;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    ':host{color-scheme:dark}.panel{font:13px/1.6 system-ui,sans-serif;color:#f0eff7;background:#181b24;border:1px solid #766494;border-radius:15px;padding:22px;width:min(350px,calc(100vw - 70px));box-shadow:0 15px 60px #0008}h2{font-size:19px;margin:6px 0 8px;line-height:1.3}p{color:#aeb4c8;margin:0 0 12px}.tag{font-size:10px;letter-spacing:2px;color:#bdaaff}code{display:block;color:#c7b8e4;background:#10131b;border-radius:6px;font-size:10px;padding:7px;overflow-wrap:anywhere;margin:6px 0 10px}b{font-weight:600}button{font:600 12px system-ui;cursor:pointer;border:0;border-radius:7px;padding:10px 13px;background:#b6a5fc;color:#211a31;margin:10px 7px 0 0}button.secondary{background:#2e3040;color:#d2cbe3}button:focus-visible{outline:2px solid #fff;outline-offset:3px}button:disabled{opacity:.4;cursor:wait}.error{color:#f5b3b3}';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Set up website');
  const tag = document.createElement('div');
  tag.className = 'tag';
  const heading = document.createElement('h2');
  const description = document.createElement('p');
  const preview = document.createElement('div');
  const error = document.createElement('p');
  error.className = 'error';
  error.setAttribute('role', 'status');
  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save website';
  saveButton.hidden = true;
  const reset = document.createElement('button');
  reset.className = 'secondary';
  reset.textContent = 'Start over';
  const cancel = document.createElement('button');
  cancel.className = 'secondary';
  cancel.textContent = 'Cancel';
  const move = document.createElement('button');
  move.className = 'secondary';
  move.textContent = 'Move panel';
  move.addEventListener('click', () => {
    const left = host.style.left === '24px';
    Object.assign(
      host.style,
      left
        ? { left: 'auto', bottom: 'auto', right: '24px', top: '24px' }
        : { left: '24px', bottom: '24px', right: 'auto', top: 'auto' },
    );
  });
  panel.append(tag, heading, description, preview, error, saveButton, reset, move, cancel);
  shadow.append(style, panel);
  document.documentElement.append(host);
  const highlight = document.createElement('div');
  highlight.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483646;outline:2px solid #b6a5fc;background:#b6a5fc20;display:none;border-radius:3px;';
  document.documentElement.append(highlight);
  let step = 0;
  let titleSelector = '';
  let episodeSelector = '';

  function render(): void {
    tag.textContent = `MALMARK · ${step < 2 ? `STEP ${step + 1} OF 2` : 'REVIEW'} · ${location.hostname}`;
    heading.textContent =
      step === 0
        ? 'Pick the anime title.'
        : step === 1
          ? 'Pick the episode number.'
          : 'Does this look right?';
    description.textContent =
      step === 0
        ? 'Click the element that shows the anime’s name. Choose a title that stays the same across episodes.'
        : step === 1
          ? 'Click the current episode number, such as “Episode 7” or “7”. Press Escape to cancel.'
          : 'These selectors will be used on this domain. You can replace them by running setup again.';
    saveButton.hidden = step !== 2;
    highlight.style.display = 'none';
  }

  function previewLine(label: string, selector: string): void {
    const text = document.createElement('b');
    text.textContent = `${label}: ${document.querySelector(selector)?.textContent?.trim().slice(0, 200)}`;
    const code = document.createElement('code');
    code.textContent = selector;
    preview.append(text, code);
  }

  function allowed(target: EventTarget | null): target is Element {
    return (
      target instanceof Element &&
      target !== host &&
      !host.contains(target) &&
      !target.matches('html,body') &&
      !target.closest('input,textarea,select,[contenteditable="true"]')
    );
  }

  function hover(event: MouseEvent): void {
    if (step > 1 || event.composedPath().includes(host) || !allowed(event.target)) {
      highlight.style.display = 'none';
      return;
    }
    const r = event.target.getBoundingClientRect();
    Object.assign(highlight.style, {
      display: 'block',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    });
  }

  function pick(event: MouseEvent): void {
    if (
      step > 1 ||
      event.composedPath().includes(host) ||
      !event.isTrusted ||
      !allowed(event.target)
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const value = event.target.textContent?.trim() || '';
    if (!value || value.length > 300) {
      error.textContent = 'Choose a smaller element containing just the title or episode.';
      return;
    }
    if (step === 1 && selectedEpisode(value) === null) {
      error.textContent =
        'No whole episode number found. Choose an element like “Episode 7” or “7”.';
      return;
    }
    error.textContent = '';
    const selector = selectorFor(event.target);
    if (step === 0) {
      titleSelector = selector;
      preview.replaceChildren();
      previewLine('Anime', selector);
      step = 1;
    } else {
      episodeSelector = selector;
      previewLine('Episode', selector);
      step = 2;
    }
    render();
  }

  function stop(): void {
    host.remove();
    highlight.remove();
    document.removeEventListener('mouseover', hover, true);
    document.removeEventListener('click', pick, true);
    document.removeEventListener('keydown', key, true);
    stopCurrent = undefined;
  }

  function key(event: KeyboardEvent): void {
    if (event.key === 'Escape') stop();
  }

  saveButton.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    saveButton.disabled = true;
    void save(titleSelector, episodeSelector)
      .then(() => {
        step = 3;
        tag.textContent = 'MALMARK · WEBSITE SAVED';
        heading.textContent = 'You’re all set.';
        description.textContent =
          'Open Malmark to review the match. These elements will be checked as you change episodes.';
        saveButton.hidden = true;
        reset.hidden = true;
        preview.replaceChildren();
        cancel.textContent = 'Done';
      })
      .catch((e) => {
        error.textContent = e.message;
        saveButton.disabled = false;
      });
  });

  reset.addEventListener('click', () => {
    step = 0;
    titleSelector = '';
    episodeSelector = '';
    preview.replaceChildren();
    error.textContent = '';
    render();
  });

  cancel.addEventListener('click', stop);
  document.addEventListener('mouseover', hover, true);
  document.addEventListener('click', pick, true);
  document.addEventListener('keydown', key, true);
  stopCurrent = stop;
  render();
}
