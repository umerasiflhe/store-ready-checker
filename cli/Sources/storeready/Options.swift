import ArgumentParser
import StoreReadyCore

/// Brief §6.6's `check` interface, verbatim option vocabulary.

enum OutputFormatOption: String, CaseIterable, ExpressibleByArgument {
  case text
  case json
  case markdown
}

enum FailOnOption: String, CaseIterable, ExpressibleByArgument {
  case error
  case warning
  case never
}

enum FormFactorOption: String, CaseIterable, ExpressibleByArgument {
  case phone
  case wear
  case tv
  case automotive
  case xr

  var formFactor: FormFactor {
    switch self {
    case .phone: return .phoneTablet
    case .wear: return .wear
    case .tv: return .tv
    case .automotive: return .automotive
    case .xr: return .xr
    }
  }
}

/// Exit codes above brief §6.6: `0` nothing at/above `--fail-on` (default `error`); `1` findings
/// at/above threshold.
func exceedsFailOnThreshold(_ report: Report, _ failOn: FailOnOption) -> Bool {
  switch failOn {
  case .never: return false
  case .error: return report.summary.errors > 0
  case .warning: return report.summary.errors > 0 || report.summary.warnings > 0
  }
}
