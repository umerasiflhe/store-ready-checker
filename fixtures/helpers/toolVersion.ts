import webPkg from '../../apps/web/package.json' with { type: 'json' };

/**
 * The tool version stamped into every report. `apps/web/package.json` is the TS-side source of
 * truth (the worker reads it too); `scripts/check-repo.ts` keeps it in step with
 * `packages/core/package.json` and the Swift CLI's `ToolInfo.version`.
 */
export const TOOL_VERSION: string = webPkg.version;
