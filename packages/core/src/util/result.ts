export interface ParseError {
  code: string;
  message: string;
}

export type Result<T, E = ParseError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function parseError(code: string, message: string): ParseError {
  return { code, message };
}

/**
 * Runs a synchronous parser body, converting any thrown error into a typed `Result` so that
 * public parser functions never throw (CLAUDE.md: "never throw on malformed/truncated input").
 */
export function tryParse<T>(code: string, body: () => T): Result<T> {
  try {
    return ok(body());
  } catch (error) {
    return err(parseError(code, error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Async counterpart of {@link tryParse}.
 */
export async function tryParseAsync<T>(code: string, body: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await body());
  } catch (error) {
    return err(parseError(code, error instanceof Error ? error.message : String(error)));
  }
}
