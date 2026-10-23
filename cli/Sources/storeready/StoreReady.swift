import ArgumentParser
import StoreReadyCore

@main
struct StoreReady: ParsableCommand {
  static let configuration = CommandConfiguration(
    commandName: "storeready",
    version: ToolInfo.version,
    subcommands: [Check.self, RulesCommand.self]
  )
}
