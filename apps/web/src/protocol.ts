import type { FormFactor, Report } from '@store-ready/core';

export interface AnalyzeRequest {
  readonly type: 'analyze';
  readonly file: Blob;
  readonly fileName: string;
  readonly asOf: string;
  readonly formFactorOverride: FormFactor | undefined;
}

export interface ReevaluateRequest {
  readonly type: 'reevaluate';
  readonly asOf: string;
  readonly formFactorOverride: FormFactor | undefined;
}

export type WorkerRequest = AnalyzeRequest | ReevaluateRequest;

export type ProgressStage = 'opening' | 'analyzing' | 'evaluating';

export interface ProgressMessage {
  readonly type: 'progress';
  readonly stage: ProgressStage;
}

export interface ReportMessage {
  readonly type: 'report';
  readonly report: Report;
  /** Whether the Android form factor was inferred (and can be overridden) for this report. */
  readonly androidFormFactor: FormFactor | undefined;
}

export type ErrorCategory = 'not-a-zip' | 'unsupported' | 'corrupted' | 'no-session';

export interface ErrorMessage {
  readonly type: 'error';
  readonly category: ErrorCategory;
  readonly message: string;
}

export type WorkerResponse = ProgressMessage | ReportMessage | ErrorMessage;
