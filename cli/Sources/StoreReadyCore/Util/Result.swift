/// Mirrors `packages/core/src/util/result.ts`: every parser that reads untrusted input returns a
/// typed error instead of throwing, using Swift's stdlib `Result` with this as its `Failure`.
public struct ParseError: Error, Equatable, Sendable {
  public let code: String
  public let message: String

  public init(code: String, message: String) {
    self.code = code
    self.message = message
  }
}

/// Runs `body`, converting any thrown error into a `ParseError` tagged with `code` — the same
/// "one error code per call site, regardless of what inside it failed" pattern as the TS
/// `tryParse`.
public func tryParse<T>(_ code: String, _ body: () throws -> T) -> Result<T, ParseError> {
  do {
    return .success(try body())
  } catch {
    return .failure(ParseError(code: code, message: String(describing: error)))
  }
}

/// Async counterpart of `tryParse`.
public func tryParseAsync<T>(
  _ code: String,
  _ body: () async throws -> T
) async -> Result<T, ParseError> {
  do {
    return .success(try await body())
  } catch {
    return .failure(ParseError(code: code, message: String(describing: error)))
  }
}
