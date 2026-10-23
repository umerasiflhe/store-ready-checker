import ArgumentParser
import Foundation
import StoreReadyCore

#if canImport(Darwin)
  import Darwin
#elseif canImport(Glibc)
  import Glibc
#endif

private func todayLocalDateString() -> String {
  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = .current
  let components = calendar.dateComponents([.year, .month, .day], from: Date())
  return String(
    format: "%04d-%02d-%02d", components.year ?? 1970, components.month ?? 1, components.day ?? 1)
}

private func printError(_ message: String) {
  FileHandle.standardError.write(Data("storeready: \(message)\n".utf8))
}

struct Check: ParsableCommand {
  static let configuration = CommandConfiguration(
    commandName: "check",
    abstract: "Check an .ipa, .aab, or .apk against current store upload rules."
  )

  @Argument(help: "Path to a .ipa, .aab, or .apk file.")
  var file: String

  @Option(name: .customLong("format"), help: "Output format: text, json, or markdown.")
  var format: OutputFormatOption = .text

  @Option(
    name: .customLong("as-of"), help: "Check as of this date (YYYY-MM-DD). Defaults to today.")
  var asOf: String?

  @Option(name: .customLong("form-factor"), help: "Override the inferred Android form factor.")
  var formFactor: FormFactorOption?

  @Option(name: .customLong("fail-on"), help: "Severity threshold for a nonzero exit code.")
  var failOn: FailOnOption = .error

  @Flag(name: .customLong("no-color"), help: "Disable ANSI colors in text output.")
  var noColor: Bool = false

  func run() throws {
    guard FileManager.default.fileExists(atPath: file) else {
      printError("\(file): no such file")
      throw ExitCode(2)
    }
    let url = URL(fileURLWithPath: file)
    let fileName = url.lastPathComponent
    let asOfValue = asOf ?? todayLocalDateString()

    guard case .success(let rulesFile) = BundledResources.rulesFile() else {
      printError("failed to load the bundled rules.json")
      throw ExitCode(2)
    }

    let openedArchive = ZipArchive.open(url: url)
    guard case .success(let archive) = openedArchive else {
      if case .failure(let error) = openedArchive { printError(error.message) }
      throw ExitCode(2)
    }
    guard let kind = detectKind(fileName: fileName, entries: archive.list()) else {
      printError("doesn't look like an .ipa, .aab, or .apk")
      throw ExitCode(2)
    }

    let result: Result<Report, ParseError>
    switch kind {
    case .ipa:
      guard case .success(let listedSdks) = BundledResources.listedSdksSeed(),
        case .success(let requiredReasonApis) = BundledResources.requiredReasonSeed()
      else {
        printError("failed to load the bundled Apple seed data")
        throw ExitCode(2)
      }
      result = analyzeIpa(
        url: url,
        options: AnalyzeIpaOptions(
          fileName: fileName,
          asOf: asOfValue,
          toolVersion: ToolInfo.version,
          rules: rulesFile,
          requiredReasonApis: requiredReasonApis,
          listedSdks: listedSdks
        )
      )
    case .aab:
      result = analyzeAab(
        url: url,
        options: AnalyzeAndroidOptions(
          fileName: fileName,
          asOf: asOfValue,
          toolVersion: ToolInfo.version,
          rules: rulesFile,
          formFactorOverride: formFactor?.formFactor
        )
      )
    case .apk:
      result = analyzeApk(
        url: url,
        options: AnalyzeAndroidOptions(
          fileName: fileName,
          asOf: asOfValue,
          toolVersion: ToolInfo.version,
          rules: rulesFile,
          formFactorOverride: formFactor?.formFactor
        )
      )
    }

    guard case .success(let report) = result else {
      if case .failure(let error) = result { printError(error.message) }
      throw ExitCode(2)
    }

    switch format {
    case .text:
      let color = !noColor && isatty(fileno(stdout)) != 0
      print(renderText(report, color: color))
    case .json:
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let data = try encoder.encode(report)
      print(String(decoding: data, as: UTF8.self))
    case .markdown:
      print(reportToMarkdown(report))
    }

    throw ExitCode(exceedsFailOnThreshold(report, failOn) ? 1 : 0)
  }
}
