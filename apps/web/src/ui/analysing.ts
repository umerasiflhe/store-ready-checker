import type { ProgressStage } from '../protocol.ts';

const STAGE_LABEL: Record<ProgressStage, string> = {
  opening: 'Opening the archive…',
  analyzing: 'Reading manifests and binaries…',
  evaluating: 'Evaluating store rules…',
};

export interface AnalysingHandlers {
  readonly onCancel: () => void;
}

export function renderAnalysing(
  container: HTMLElement,
  fileName: string,
  stage: ProgressStage,
  handlers: AnalysingHandlers,
): void {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'progress';
  wrapper.setAttribute('role', 'status');
  wrapper.setAttribute('aria-live', 'polite');

  const title = document.createElement('p');
  title.textContent = `Analysing ${fileName}`;
  const stageText = document.createElement('p');
  stageText.style.color = 'var(--color-muted)';
  stageText.textContent = STAGE_LABEL[stage];

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancel';
  cancelButton.addEventListener('click', handlers.onCancel);

  wrapper.append(title, stageText, cancelButton);
  container.append(wrapper);
}
