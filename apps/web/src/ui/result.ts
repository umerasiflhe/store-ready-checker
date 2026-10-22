import type { FormFactor, Report, Severity } from '@store-ready/core';

const STATUS_LABEL: Record<Report['summary']['status'], string> = {
  blocked: 'Blocked',
  attention: 'Needs attention',
  ready: 'Ready to upload',
};

const SEVERITY_ICON: Record<Severity, string> = {
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

const FORM_FACTOR_LABEL: Record<FormFactor, string> = {
  phone_tablet: 'Phone / tablet',
  wear: 'Wear OS',
  tv: 'Android TV',
  automotive: 'Android Automotive OS',
  xr: 'Android XR',
};

export interface ResultHandlers {
  readonly onAsOfChange: (asOf: string) => void;
  readonly onFormFactorChange: (formFactor: FormFactor) => void;
  readonly onCopyMarkdown: () => void;
  readonly onDownloadJson: () => void;
  readonly onReset: () => void;
}

export interface ResultViewState {
  readonly report: Report;
  readonly androidFormFactor: FormFactor | undefined;
  readonly formFactorOverride: FormFactor | undefined;
  readonly severityFilter: Severity | undefined;
  readonly onSeverityFilterChange: (severity: Severity | undefined) => void;
}

function evidenceTable(evidence: Record<string, unknown>): HTMLElement | undefined {
  const entries = Object.entries(evidence);
  if (entries.length === 0) return undefined;
  const table = document.createElement('table');
  table.className = 'evidence-table';
  for (const [key, value] of entries) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = key;
    const td = document.createElement('td');
    td.textContent = Array.isArray(value) ? value.join(', ') : JSON.stringify(value);
    row.append(th, td);
    table.append(row);
  }
  return table;
}

function renderFinding(finding: Report['findings'][number]): HTMLElement {
  const details = document.createElement('details');
  details.className = 'finding';
  details.dataset.severity = finding.severity;

  const summary = document.createElement('summary');
  const icon = document.createElement('span');
  icon.className = 'severity-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = SEVERITY_ICON[finding.severity];
  const label = document.createElement('span');
  label.className = 'visually-hidden';
  label.textContent = `${SEVERITY_LABEL[finding.severity]}: `;
  const title = document.createElement('span');
  title.textContent = `${finding.ruleId} — ${finding.title}`;
  summary.append(icon, label, title);
  if (finding.confidence === 'heuristic') {
    const badge = document.createElement('span');
    badge.className = 'badge-heuristic';
    badge.textContent = 'heuristic';
    summary.append(badge);
  }

  const body = document.createElement('div');
  body.className = 'finding-body';

  const message = document.createElement('p');
  message.textContent = finding.message;
  body.append(message);

  const table = evidenceTable(finding.evidence);
  if (table) body.append(table);

  if (finding.fix.length > 0) {
    const fixHeading = document.createElement('p');
    fixHeading.textContent = 'Fix:';
    const fixList = document.createElement('ul');
    for (const step of finding.fix) {
      const item = document.createElement('li');
      item.textContent = step;
      fixList.append(item);
    }
    body.append(fixHeading, fixList);
  }

  if (finding.sources.length > 0) {
    const sourcesList = document.createElement('ul');
    for (const source of finding.sources) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = source.title;
      item.append(link);
      sourcesList.append(item);
    }
    body.append(sourcesList);
  }

  details.append(summary, body);
  return details;
}

export function renderResult(
  container: HTMLElement,
  state: ResultViewState,
  handlers: ResultHandlers,
): void {
  container.innerHTML = '';
  const { report } = state;

  const live = document.createElement('div');
  live.className = 'visually-hidden';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.textContent = `${report.input.fileName}: ${STATUS_LABEL[report.summary.status]}. ${String(report.summary.errors)} errors, ${String(report.summary.warnings)} warnings, ${String(report.summary.infos)} info findings.`;

  const banner = document.createElement('div');
  banner.className = 'verdict-banner';
  banner.dataset.status = report.summary.status;
  banner.textContent = `${STATUS_LABEL[report.summary.status]} — ${String(report.summary.errors)} error(s), ${String(report.summary.warnings)} warning(s), ${String(report.summary.infos)} info`;

  const controls = document.createElement('div');
  controls.className = 'controls';

  const asOfLabel = document.createElement('label');
  asOfLabel.textContent = 'Check as of';
  const asOfInput = document.createElement('input');
  asOfInput.type = 'date';
  asOfInput.value = report.asOf;
  asOfInput.addEventListener('change', () => {
    if (asOfInput.value) handlers.onAsOfChange(asOfInput.value);
  });
  asOfLabel.append(asOfInput);
  controls.append(asOfLabel);

  if (report.app.platform === 'android' && state.androidFormFactor) {
    const formFactorLabel = document.createElement('label');
    formFactorLabel.textContent = 'Form factor';
    const select = document.createElement('select');
    for (const value of Object.keys(FORM_FACTOR_LABEL) as FormFactor[]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = FORM_FACTOR_LABEL[value];
      option.selected = value === (state.formFactorOverride ?? state.androidFormFactor);
      select.append(option);
    }
    select.addEventListener('change', () => {
      handlers.onFormFactorChange(select.value as FormFactor);
    });
    formFactorLabel.append(select);
    controls.append(formFactorLabel);
  }

  const severityFilter = document.createElement('div');
  severityFilter.className = 'severity-filter';
  severityFilter.setAttribute('role', 'group');
  severityFilter.setAttribute('aria-label', 'Filter findings by severity');
  const filterOptions: { readonly value: Severity | undefined; readonly label: string }[] = [
    { value: undefined, label: 'All' },
    { value: 'error', label: 'Errors' },
    { value: 'warning', label: 'Warnings' },
    { value: 'info', label: 'Info' },
  ];
  for (const option of filterOptions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.setAttribute('aria-pressed', String(state.severityFilter === option.value));
    button.addEventListener('click', () => {
      state.onSeverityFilterChange(option.value);
    });
    severityFilter.append(button);
  }
  controls.append(severityFilter);

  const actions = document.createElement('div');
  actions.className = 'actions';
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'Copy as Markdown';
  copyButton.addEventListener('click', handlers.onCopyMarkdown);
  const downloadButton = document.createElement('button');
  downloadButton.type = 'button';
  downloadButton.textContent = 'Download JSON';
  downloadButton.addEventListener('click', handlers.onDownloadJson);
  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'Check another file';
  resetButton.addEventListener('click', handlers.onReset);
  actions.append(copyButton, downloadButton, resetButton);

  const findingsContainer = document.createElement('div');
  findingsContainer.className = 'findings';
  const visibleFindings = report.findings.filter(
    (finding) => !state.severityFilter || finding.severity === state.severityFilter,
  );
  if (visibleFindings.length === 0) {
    const empty = document.createElement('p');
    empty.textContent =
      report.findings.length === 0
        ? 'No findings — this build looks ready to upload.'
        : 'No findings match this filter.';
    findingsContainer.append(empty);
  } else {
    for (const finding of visibleFindings) {
      findingsContainer.append(renderFinding(finding));
    }
  }

  container.append(live, banner, controls, actions, findingsContainer);
}
