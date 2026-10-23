import ArgumentParser
import Foundation
import StoreReadyCore

enum RulesFormatOption: String, CaseIterable, ExpressibleByArgument {
  case text
  case json
}

struct RulesCommand: ParsableCommand {
  static let configuration = CommandConfiguration(
    commandName: "rules",
    abstract: "List every rule, its sources, and dates."
  )

  @Option(name: .customLong("format"), help: "Output format: text or json.")
  var format: RulesFormatOption = .text

  func run() throws {
    guard case .success(let rulesFile) = BundledResources.rulesFile() else {
      FileHandle.standardError.write(
        Data("storeready: failed to load the bundled rules.json\n".utf8))
      throw ExitCode(2)
    }

    switch format {
    case .json:
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let data = try encoder.encode(rulesFile)
      print(String(decoding: data, as: UTF8.self))
    case .text:
      print("rules \(rulesFile.rulesVersion)")
      for rule in rulesFile.rules {
        print("\(rule.id) [\(rule.platform)] \(rule.title)")
        for entry in rule.timeline {
          print("  from \(entry.from): \(entry.severity.rawValue)")
        }
        for source in rule.sources {
          print("  source: \(source.title) <\(source.url)>")
        }
      }
    }
  }
}
