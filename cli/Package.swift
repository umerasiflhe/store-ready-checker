// swift-tools-version:6.0
import PackageDescription

let package = Package(
  name: "StoreReady",
  platforms: [.macOS(.v14)],
  products: [
    .library(name: "StoreReadyCore", targets: ["StoreReadyCore"]),
    .executable(name: "storeready", targets: ["storeready"]),
  ],
  dependencies: [
    .package(url: "https://github.com/apple/swift-argument-parser.git", from: "1.5.0"),
    .package(url: "https://github.com/weichsel/ZIPFoundation.git", from: "0.9.9"),
    .package(url: "https://github.com/apple/swift-protobuf.git", from: "1.9.0"),
  ],
  targets: [
    .target(
      name: "StoreReadyCore",
      dependencies: [
        "ZIPFoundation",
        .product(name: "SwiftProtobuf", package: "swift-protobuf"),
      ],
      resources: [.copy("Resources")]
    ),
    .executableTarget(
      name: "storeready",
      dependencies: [
        "StoreReadyCore",
        .product(name: "ArgumentParser", package: "swift-argument-parser"),
      ]
    ),
    .testTarget(name: "StoreReadyCoreTests", dependencies: ["StoreReadyCore"]),
    .testTarget(name: "storereadyTests", dependencies: ["storeready"]),
  ]
)
