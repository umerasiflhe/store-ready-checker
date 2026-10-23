import Testing

@testable import StoreReadyCore

@Test func comparesSimpleVersions() {
  #expect(compareVersions("15.0", "13.0") == 1)
  #expect(compareVersions("13.0", "15.0") == -1)
  #expect(compareVersions("15.0", "15.0") == 0)
}

@Test func comparesNumericallyNotLexicographically() {
  // "9" vs "10": lexicographic would say "9" > "10"; numeric must say 9 < 10.
  #expect(compareVersions("9", "10") == -1)
}

@Test func missingTrailingSegmentsDefaultToZero() {
  #expect(compareVersions("15", "15.0.0") == 0)
  #expect(compareVersions("15.1", "15") == 1)
}

@Test func emptySegmentsAreZeroNotAnError() {
  // Matches JS `Number('') === 0`.
  #expect(compareVersions("1.", "1.0") == 0)
}

@Test func nonNumericSegmentsPoisonTheWholeComparisonToNaN() {
  #expect(compareVersions("15.0a", "15.0").isNaN)
  #expect(compareVersions("15.0", "abc").isNaN)
}
