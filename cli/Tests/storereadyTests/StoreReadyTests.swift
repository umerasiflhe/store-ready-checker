import StoreReadyCore
import Testing

@testable import storeready

@Test func cliReportsToolVersion() {
  #expect(StoreReady.configuration.version == ToolInfo.version)
}

@Test func cliRegistersCheckAndRulesSubcommands() {
  let subcommandNames = StoreReady.configuration.subcommands.map { $0.configuration.commandName }
  #expect(subcommandNames.contains("check"))
  #expect(subcommandNames.contains("rules"))
}

@Test func exceedsFailOnThresholdMatchesBriefSemantics() {
  let blocked = Report(
    tool: ReportTool(name: "store-ready", version: "0.1.0", rulesVersion: "2026.10.20"),
    asOf: "2026-10-20",
    input: ReportInput(fileName: "x.ipa", sizeBytes: 1, kind: .ipa),
    app: ReportApp(platform: .ios, id: "", version: "", build: ""),
    summary: ReportSummary(status: .blocked, errors: 1, warnings: 0, infos: 0),
    findings: []
  )
  let attention = Report(
    tool: blocked.tool,
    asOf: blocked.asOf,
    input: blocked.input,
    app: blocked.app,
    summary: ReportSummary(status: .attention, errors: 0, warnings: 1, infos: 0),
    findings: []
  )
  let ready = Report(
    tool: blocked.tool,
    asOf: blocked.asOf,
    input: blocked.input,
    app: blocked.app,
    summary: ReportSummary(status: .ready, errors: 0, warnings: 0, infos: 1),
    findings: []
  )

  #expect(exceedsFailOnThreshold(blocked, .error))
  #expect(!exceedsFailOnThreshold(attention, .error))
  #expect(exceedsFailOnThreshold(attention, .warning))
  #expect(!exceedsFailOnThreshold(ready, .warning))
  #expect(!exceedsFailOnThreshold(blocked, .never))
}
