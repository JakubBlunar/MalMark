import { selectedEpisode } from './detect';
import { selectorFor } from './selectors';
import { inspectSiteSelectors, selectorPreviewText } from '../shared/selector-validation';
import { i18n, initializeI18n, t } from '../shared/i18n';

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
  style.textContent +=
    '.panel{box-sizing:border-box;width:min(390px,calc(100vw - 48px));max-height:calc(100dvh - 48px);overflow:auto}label{display:block;font-weight:600;margin-top:12px}textarea{box-sizing:border-box;width:100%;resize:vertical;min-height:58px;font:12px/1.5 ui-monospace,monospace;color:#e9e4fa;background:#10131b;border:1px solid #59516d;border-radius:6px;padding:8px;margin:6px 0;overflow-wrap:anywhere}textarea:focus-visible{outline:2px solid #b6a5fc;outline-offset:2px}.result{font-size:12px;overflow-wrap:anywhere;margin:0 0 10px}';
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', t('Set up website'));
  const tag = document.createElement('div');
  tag.className = 'tag';
  const heading = document.createElement('h2');
  const description = document.createElement('p');
  const preview = document.createElement('div');
  const error = document.createElement('p');
  error.className = 'error';
  error.setAttribute('role', 'status');
  const saveButton = document.createElement('button');
  saveButton.textContent = t('Save website');
  saveButton.hidden = true;
  const reset = document.createElement('button');
  reset.className = 'secondary';
  reset.textContent = t('Start over');
  const manual = document.createElement('button');
  manual.className = 'secondary';
  manual.textContent = t('Enter selectors manually');
  const cancel = document.createElement('button');
  cancel.className = 'secondary';
  cancel.textContent = t('Cancel');
  const move = document.createElement('button');
  move.className = 'secondary';
  move.textContent = t('Move panel');
  move.addEventListener('click', () => {
    const left = host.style.left === '24px';
    Object.assign(
      host.style,
      left
        ? { left: 'auto', bottom: 'auto', right: '24px', top: '24px' }
        : { left: '24px', bottom: '24px', right: 'auto', top: 'auto' },
    );
  });
  panel.append(tag, heading, description, preview, error, saveButton, manual, reset, move, cancel);
  shadow.append(style, panel);
  document.documentElement.append(host);
  const highlight = document.createElement('div');
  highlight.style.cssText =
    'position:fixed;pointer-events:none;z-index:2147483646;outline:2px solid #b6a5fc;background:#b6a5fc20;display:none;border-radius:3px;';
  document.documentElement.append(highlight);
  let step = 0;
  let titleSelector = '';
  let episodeSelector = '';
  function field(labelText: string, id: string) {
    const container = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = labelText;
    label.htmlFor = id;
    const input = document.createElement('textarea');
    input.id = id;
    input.rows = 2;
    input.maxLength = 2000;
    input.spellcheck = false;
    const result = document.createElement('p');
    result.className = 'result';
    result.setAttribute('aria-live', 'polite');
    container.append(label, input, result);
    preview.append(container);
    return { container, input, result };
  }
  const titleField = field(t('Anime title selector'), 'malmark-title-selector');
  const episodeField = field(t('Episode selector'), 'malmark-episode-selector');

  function refreshPreview(): boolean {
    const result = inspectSiteSelectors(titleSelector, episodeSelector);
    titleField.result.textContent = selectorPreviewText(result.title);
    titleField.result.classList.toggle('error', !!result.title.error);
    episodeField.result.textContent = selectorPreviewText(result.episode);
    episodeField.result.classList.toggle('error', !!result.episode.error);
    const valid = !result.title.error && !result.episode.error;
    saveButton.disabled = !valid;
    return valid;
  }
  for (const { input } of [titleField, episodeField])
    input.addEventListener('input', () => {
      titleSelector = titleField.input.value;
      episodeSelector = episodeField.input.value;
      error.textContent = '';
      refreshPreview();
    });

  function render(): void {
    host.lang = i18n.resolvedLanguage || 'en';
    panel.setAttribute('aria-label', t('Set up website'));
    saveButton.textContent = t('Save website');
    reset.textContent = t('Start over');
    manual.textContent = t('Enter selectors manually');
    cancel.textContent = t(step === 3 ? 'Done' : 'Cancel');
    move.textContent = t('Move panel');
    titleField.container.querySelector('label')!.textContent = t('Anime title selector');
    episodeField.container.querySelector('label')!.textContent = t('Episode selector');
    if (step === 3) {
      tag.textContent = t('MALMARK · WEBSITE SAVED');
      heading.textContent = t('You’re all set.');
      description.textContent = t(
        'Open Malmark to review the match. These elements will be checked as you change episodes.',
      );
      return;
    }
    tag.textContent = `MALMARK · ${step < 2 ? t('STEP {{step}} OF 2', { step: step + 1 }) : t('REVIEW')} · ${location.hostname}`;
    heading.textContent =
      step === 0
        ? t('Pick the anime title.')
        : step === 1
          ? t('Pick the episode number.')
          : t('Does this look right?');
    description.textContent =
      step === 0
        ? t(
            'Click the element that shows the anime’s name. Choose a title that stays the same across episodes.',
          )
        : step === 1
          ? t(
              'Click the current episode number, such as “Episode 7” or “7”. Press Escape to cancel.',
            )
          : t(
              'Fine-tune these CSS selectors if needed. The first matching element supplies its text on this domain.',
            );
    saveButton.hidden = step !== 2;
    manual.hidden = step >= 2;
    preview.hidden = step === 0 || step === 3;
    episodeField.container.hidden = step < 2;
    titleField.input.value = titleSelector;
    episodeField.input.value = episodeSelector;
    if (step > 0 && step < 3) refreshPreview();
    highlight.style.display = 'none';
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
      error.textContent = t('Choose a smaller element containing just the title or episode.');
      return;
    }
    if (step === 1 && selectedEpisode(value) === null) {
      error.textContent = t(
        'No whole episode number found. Choose an element like “Episode 7” or “7”.',
      );
      return;
    }
    error.textContent = '';
    let selector: string;
    try {
      selector = selectorFor(event.target);
    } catch (e) {
      error.textContent = (e as Error).message;
      return;
    }
    if (step === 0) {
      titleSelector = selector;
      step = 1;
    } else {
      episodeSelector = selector;
      step = 2;
    }
    render();
  }

  function stop(): void {
    i18n.off('languageChanged', render);
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
    if (!event.isTrusted || step !== 2 || !refreshPreview()) return;
    saveButton.disabled = true;
    reset.disabled = true;
    titleField.input.disabled = episodeField.input.disabled = true;
    void save(titleSelector.trim(), episodeSelector.trim())
      .then(() => {
        step = 3;
        render();
        saveButton.hidden = true;
        reset.hidden = true;
        preview.hidden = true;
        cancel.textContent = t('Done');
      })
      .catch((e) => {
        error.textContent = e.message;
        saveButton.disabled = false;
        reset.disabled = false;
        titleField.input.disabled = episodeField.input.disabled = false;
      });
  });

  manual.addEventListener('click', () => {
    step = 2;
    render();
    (titleSelector ? episodeField.input : titleField.input).focus();
  });

  reset.addEventListener('click', () => {
    step = 0;
    titleSelector = '';
    episodeSelector = '';
    titleField.input.disabled = episodeField.input.disabled = false;
    error.textContent = '';
    render();
  });

  cancel.addEventListener('click', stop);
  document.addEventListener('mouseover', hover, true);
  document.addEventListener('click', pick, true);
  document.addEventListener('keydown', key, true);
  stopCurrent = stop;
  render();
  i18n.on('languageChanged', render);
  void initializeI18n(true, true).then(() => {
    if (host.isConnected) render();
  });
}
