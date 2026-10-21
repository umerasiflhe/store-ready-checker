import StoreReadyCore
import Testing

@testable import storeready

@Test func cliReportsToolVersion() {
  #expect(StoreReady.configuration.version == ToolInfo.version)
}
