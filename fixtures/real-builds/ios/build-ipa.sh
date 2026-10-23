#!/usr/bin/env bash
# Builds an unsigned .ipa from project.yml: xcodegen → xcodebuild archive → zip Payload/.
#   build-ipa.sh <output.ipa> [extra xcodebuild build settings...]
# e.g. build-ipa.sh out/old-minos.ipa IPHONEOS_DEPLOYMENT_TARGET=12.0
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
output="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
shift

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -R "$here/project.yml" "$here/Sources" "$work/"

(cd "$work" && xcodegen generate --quiet)
xcodebuild archive \
  -project "$work/RealBuild.xcodeproj" \
  -scheme RealBuild \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "$work/RealBuild.xcarchive" \
  CODE_SIGNING_ALLOWED=NO \
  "$@" \
  -quiet

mkdir -p "$work/ipa/Payload"
cp -R "$work/RealBuild.xcarchive/Products/Applications/RealBuild.app" "$work/ipa/Payload/"
rm -f "$output"
(cd "$work/ipa" && zip -qry "$output" Payload)
echo "Built $output"
