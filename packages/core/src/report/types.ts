import type { Finding, Severity } from '../rules/types.ts';

export interface ReportTool {
  readonly name: string;
  readonly version: string;
  readonly rulesVersion: string;
}

export interface ReportInput {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly kind: 'ipa' | 'aab' | 'apk';
}

export interface ReportApp {
  readonly platform: 'ios' | 'android';
  readonly id: string;
  readonly version: string;
  readonly build: string;
}

export type ReportStatus = 'blocked' | 'attention' | 'ready';

export interface ReportSummary {
  readonly status: ReportStatus;
  readonly errors: number;
  readonly warnings: number;
  readonly infos: number;
}

export interface Report {
  readonly tool: ReportTool;
  readonly asOf: string;
  readonly input: ReportInput;
  readonly app: ReportApp;
  readonly summary: ReportSummary;
  readonly findings: readonly Finding[];
}

export type { Finding, Severity };
