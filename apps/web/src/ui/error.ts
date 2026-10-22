import type { ErrorCategory } from '../protocol.ts';

const MESSAGE_BY_CATEGORY: Record<ErrorCategory, string> = {
  'not-a-zip': "This isn't a valid zip archive — check that it's an exported .ipa, .aab, or .apk.",
  unsupported: "This doesn't look like an .ipa, .aab, or .apk.",
  corrupted: "This archive is a zip, but Store Ready couldn't make sense of what's inside it.",
  'no-session': 'Something went wrong — please try analysing the file again.',
  'too-large': 'This file is larger than Store Ready can analyse in the browser right now.',
};

export interface ErrorHandlers {
  readonly onRetry: () => void;
}

export function renderError(
  container: HTMLElement,
  category: ErrorCategory,
  detail: string,
  handlers: ErrorHandlers,
): void {
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'error-panel';
  panel.setAttribute('role', 'alert');

  const heading = document.createElement('p');
  heading.textContent = MESSAGE_BY_CATEGORY[category];
  const detailText = document.createElement('p');
  detailText.className = 'detail-text';
  detailText.textContent = detail;

  const retryButton = document.createElement('button');
  retryButton.type = 'button';
  retryButton.textContent = 'Try another file';
  retryButton.addEventListener('click', handlers.onRetry);

  panel.append(heading, detailText, retryButton);
  container.append(panel);
}
