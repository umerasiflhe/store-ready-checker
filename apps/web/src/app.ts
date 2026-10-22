import { reportToMarkdown, type FormFactor, type Report, type Severity } from '@store-ready/core';
import type { ErrorCategory, ProgressStage, WorkerResponse } from './protocol.ts';
import { renderAnalysing } from './ui/analysing.ts';
import { renderError } from './ui/error.ts';
import { renderFooter, renderTrustPanel } from './ui/footer.ts';
import { renderIdle } from './ui/idle.ts';
import { renderResult } from './ui/result.ts';
import { formatBytes, todayLocalDate } from './utils.ts';

/** A UX guard rail, not a store rule (brief §3.2 says inputs are "1-2 GB"): anything far beyond
 * that is rejected before it's even sent to the worker, rather than left to time out. */
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024 * 1024;

type ViewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'analysing'; readonly fileName: string; readonly stage: ProgressStage }
  | {
      readonly kind: 'result';
      readonly report: Report;
      readonly androidFormFactor: FormFactor | undefined;
      readonly formFactorOverride: FormFactor | undefined;
      readonly severityFilter: Severity | undefined;
    }
  | { readonly kind: 'error'; readonly category: ErrorCategory; readonly message: string };

export class App {
  private readonly root: HTMLElement;
  private readonly main: HTMLElement;
  private worker: Worker;
  private state: ViewState = { kind: 'idle' };

  constructor(root: HTMLElement) {
    this.root = root;
    this.main = document.createElement('main');
    this.worker = this.createWorker();
  }

  mount(): void {
    const header = document.createElement('header');
    const heading = document.createElement('h1');
    heading.textContent = 'Store Ready';
    const tagline = document.createElement('p');
    tagline.textContent =
      'Check an iOS or Android build against current store upload rules before you upload it.';
    header.append(heading, tagline);
    renderTrustPanel(header);

    this.root.append(header, this.main);
    renderFooter(this.root);
    this.render();
  }

  private createWorker(): Worker {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(event.data);
    });
    return worker;
  }

  private handleFile = (file: Blob, fileName: string): void => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      this.state = {
        kind: 'error',
        category: 'too-large',
        message: `${fileName} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`,
      };
      this.render();
      return;
    }
    this.state = { kind: 'analysing', fileName, stage: 'opening' };
    this.render();
    this.worker.postMessage({
      type: 'analyze',
      file,
      fileName,
      asOf: todayLocalDate(),
      formFactorOverride: undefined,
    });
  };

  private handleCancel = (): void => {
    this.worker.terminate();
    this.worker = this.createWorker();
    this.state = { kind: 'idle' };
    this.render();
  };

  private handleReset = (): void => {
    this.state = { kind: 'idle' };
    this.render();
  };

  private handleAsOfChange = (asOf: string): void => {
    if (this.state.kind !== 'result') return;
    this.worker.postMessage({
      type: 'reevaluate',
      asOf,
      formFactorOverride: this.state.formFactorOverride,
    });
  };

  private handleFormFactorChange = (formFactor: FormFactor): void => {
    if (this.state.kind !== 'result') return;
    this.state = { ...this.state, formFactorOverride: formFactor };
    this.worker.postMessage({
      type: 'reevaluate',
      asOf: this.state.report.asOf,
      formFactorOverride: formFactor,
    });
  };

  private handleSeverityFilterChange = (severity: Severity | undefined): void => {
    if (this.state.kind !== 'result') return;
    this.state = { ...this.state, severityFilter: severity };
    this.render();
  };

  private handleCopyMarkdown = (): void => {
    if (this.state.kind !== 'result') return;
    void navigator.clipboard.writeText(reportToMarkdown(this.state.report));
  };

  private handleDownloadJson = (): void => {
    if (this.state.kind !== 'result') return;
    const blob = new Blob([JSON.stringify(this.state.report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.state.report.input.fileName}.report.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  private handleWorkerMessage(message: WorkerResponse): void {
    if (message.type === 'progress') {
      if (this.state.kind === 'analysing') {
        this.state = { ...this.state, stage: message.stage };
        this.render();
      }
      return;
    }
    if (message.type === 'error') {
      this.state = { kind: 'error', category: message.category, message: message.message };
      this.render();
      return;
    }
    const previousOverride =
      this.state.kind === 'result' ? this.state.formFactorOverride : undefined;
    this.state = {
      kind: 'result',
      report: message.report,
      androidFormFactor: message.androidFormFactor,
      formFactorOverride: previousOverride,
      severityFilter: this.state.kind === 'result' ? this.state.severityFilter : undefined,
    };
    this.render();
  }

  private render(): void {
    switch (this.state.kind) {
      case 'idle':
        renderIdle(this.main, { onFile: this.handleFile });
        return;
      case 'analysing':
        renderAnalysing(this.main, this.state.fileName, this.state.stage, {
          onCancel: this.handleCancel,
        });
        return;
      case 'result':
        renderResult(
          this.main,
          {
            report: this.state.report,
            androidFormFactor: this.state.androidFormFactor,
            formFactorOverride: this.state.formFactorOverride,
            severityFilter: this.state.severityFilter,
            onSeverityFilterChange: this.handleSeverityFilterChange,
          },
          {
            onAsOfChange: this.handleAsOfChange,
            onFormFactorChange: this.handleFormFactorChange,
            onCopyMarkdown: this.handleCopyMarkdown,
            onDownloadJson: this.handleDownloadJson,
            onReset: this.handleReset,
          },
        );
        return;
      case 'error':
        renderError(this.main, this.state.category, this.state.message, {
          onRetry: this.handleReset,
        });
    }
  }
}
