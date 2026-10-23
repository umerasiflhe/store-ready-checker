import Foundation

/// Mirrors `packages/core/src/index.ts`'s `analyzeIpa`/`analyzeAab`/`analyzeApk`: simple one-shot
/// entry points that open the archive, extract facts, evaluate rules, and build the report. The
/// Swift CLI composes the lower-level pieces (`ZipArchive`, `analyzeIosBundles`/
/// `analyzeAndroidBundle`, `evaluateIosRules`/`evaluateAndroidRules`, `buildReport`) directly
/// instead of these wrappers, since (unlike the web worker) a one-shot CLI invocation has no
/// "re-evaluate without re-reading the file" need — but these mirror the TS public API exactly
/// for anything that does want the one-shot shape.

public struct AnalyzeIpaOptions: Sendable {
  public let fileName: String
  public let asOf: String
  public let toolVersion: String
  public let rules: RulesFile
  public let requiredReasonApis: RequiredReasonSeed
  public let listedSdks: ListedSdksSeed

  public init(
    fileName: String,
    asOf: String,
    toolVersion: String,
    rules: RulesFile,
    requiredReasonApis: RequiredReasonSeed,
    listedSdks: ListedSdksSeed
  ) {
    self.fileName = fileName
    self.asOf = asOf
    self.toolVersion = toolVersion
    self.rules = rules
    self.requiredReasonApis = requiredReasonApis
    self.listedSdks = listedSdks
  }
}

public func analyzeIpa(url: URL, options: AnalyzeIpaOptions) -> Result<Report, ParseError> {
  switch ZipArchive.open(url: url) {
  case .failure(let error):
    return .failure(error)
  case .success(let archive):
    switch analyzeIosBundles(archive, seed: options.requiredReasonApis) {
    case .failure(let error):
      return .failure(error)
    case .success(let facts):
      let findings = evaluateIosRules(
        facts,
        options.rules,
        options.asOf,
        IosCheckSeeds(
          listedSdks: options.listedSdks, requiredReasonApis: options.requiredReasonApis)
      )
      let mainApp = facts.bundles.first { $0.kind == .app }
      let report = buildReport(
        BuildReportParams(
          tool: ReportTool(
            name: "store-ready",
            version: options.toolVersion,
            rulesVersion: options.rules.rulesVersion
          ),
          asOf: options.asOf,
          input: ReportInput(fileName: options.fileName, sizeBytes: archive.size, kind: .ipa),
          app: ReportApp(
            platform: .ios,
            id: mainApp?.info.bundleIdentifier ?? "",
            version: mainApp?.info.shortVersionString ?? "",
            build: mainApp?.info.bundleVersion ?? ""
          ),
          findings: findings
        )
      )
      return .success(report)
    }
  }
}

public struct AnalyzeAndroidOptions: Sendable {
  public let fileName: String
  public let asOf: String
  public let toolVersion: String
  public let rules: RulesFile
  public let formFactorOverride: FormFactor?

  public init(
    fileName: String,
    asOf: String,
    toolVersion: String,
    rules: RulesFile,
    formFactorOverride: FormFactor? = nil
  ) {
    self.fileName = fileName
    self.asOf = asOf
    self.toolVersion = toolVersion
    self.rules = rules
    self.formFactorOverride = formFactorOverride
  }
}

private func analyzeAndroid(
  url: URL,
  kind: AndroidInputKind,
  options: AnalyzeAndroidOptions
) -> Result<Report, ParseError> {
  switch ZipArchive.open(url: url) {
  case .failure(let error):
    return .failure(error)
  case .success(let archive):
    switch analyzeAndroidBundle(archive, kind: kind) {
    case .failure(let error):
      return .failure(error)
    case .success(let facts):
      let findings = evaluateAndroidRules(
        facts,
        options.rules,
        options.asOf,
        AndroidRuleCheckOptions(formFactorOverride: options.formFactorOverride)
      )
      let manifest = primaryModule(facts)?.manifest
      let report = buildReport(
        BuildReportParams(
          tool: ReportTool(
            name: "store-ready",
            version: options.toolVersion,
            rulesVersion: options.rules.rulesVersion
          ),
          asOf: options.asOf,
          input: ReportInput(
            fileName: options.fileName,
            sizeBytes: archive.size,
            kind: InputKind(rawValue: kind.rawValue)!
          ),
          app: ReportApp(
            platform: .android,
            id: manifest?.packageName ?? "",
            version: manifest?.versionName ?? "",
            build: manifest?.versionCode.map(String.init) ?? ""
          ),
          findings: findings
        )
      )
      return .success(report)
    }
  }
}

public func analyzeAab(url: URL, options: AnalyzeAndroidOptions) -> Result<Report, ParseError> {
  analyzeAndroid(url: url, kind: .aab, options: options)
}

public func analyzeApk(url: URL, options: AnalyzeAndroidOptions) -> Result<Report, ParseError> {
  analyzeAndroid(url: url, kind: .apk, options: options)
}
