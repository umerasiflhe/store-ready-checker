import Testing

@testable import StoreReadyCore

@Test func toolNameAndVersion() {
  #expect(ToolInfo.name == "store-ready")
  #expect(ToolInfo.version == "1.0.0")
}
