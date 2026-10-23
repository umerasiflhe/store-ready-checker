# The README's CLI demo. Record from the repo root after a release build:
#   swift build --package-path cli -c release --product storeready
#   vhs scripts/record-demo/cli.tape
Output docs/media/cli-demo.gif

Set Shell "bash"
Set FontSize 14
Set Width 1260
Set Height 500
Set Padding 24
Set Theme "Builtin Dark"
Set TypingSpeed 35ms

Hide
Type "export PATH=$PWD/cli/.build/release:$PATH PS1='$ ' && cd fixtures/files && clear"
Enter
Show

Type "storeready check ios-priv-001-missing-manifest.ipa; echo exit $?"
Sleep 400ms
Enter
Sleep 3.5s

Type "storeready check android-aab-16k-load-misaligned.aab --as-of 2026-10-23; echo exit $?"
Sleep 400ms
Enter
Sleep 3s

Type "storeready check android-aab-16k-load-misaligned.aab --as-of 2027-02-01; echo exit $?"
Sleep 400ms
Enter
Sleep 4.5s
