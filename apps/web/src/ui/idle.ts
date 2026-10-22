import { SAMPLES } from '../samples.data.ts';
import { sampleToBlob } from '../utils.ts';

export interface IdleHandlers {
  readonly onFile: (file: Blob, fileName: string) => void;
}

const ACCEPT = '.ipa,.aab,.apk';

export function renderIdle(container: HTMLElement, handlers: IdleHandlers): void {
  container.innerHTML = '';

  // A real <button>, not a div[role=button][tabindex=0]: Safari/WebKit only includes
  // tabindex-only elements in Tab navigation when "Full Keyboard Access" is on, so a div here
  // would be unreachable by keyboard in a default Safari install.
  const dropZone = document.createElement('button');
  dropZone.type = 'button';
  dropZone.className = 'drop-zone';

  const title = document.createElement('p');
  title.textContent = 'Drop an .ipa, .aab, or .apk here';
  const subtitle = document.createElement('p');
  subtitle.textContent = 'or click / press Enter to choose a file';
  subtitle.className = 'muted';
  dropZone.append(title, subtitle);

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.className = 'visually-hidden';
  input.setAttribute('aria-hidden', 'true');
  input.tabIndex = -1;

  const openPicker = (): void => {
    input.click();
  };

  // A native button already activates openPicker on click, Enter, and Space — no keydown
  // handler needed.
  dropZone.addEventListener('click', openPicker);
  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('is-dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('is-dragover');
  });
  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-dragover');
    const file = event.dataTransfer?.files[0];
    if (file) handlers.onFile(file, file.name);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handlers.onFile(file, file.name);
    input.value = '';
  });

  const samplesHeading = document.createElement('p');
  samplesHeading.textContent = 'Or try a sample:';
  samplesHeading.className = 'samples-heading';

  const samplesRow = document.createElement('div');
  samplesRow.className = 'samples';
  for (const sample of SAMPLES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = sample.label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      handlers.onFile(sampleToBlob(sample.base64, sample.kind), sample.fileName);
    });
    samplesRow.append(button);
  }

  container.append(dropZone, input, samplesHeading, samplesRow);
}
