---
name: record-demo
description: Record the web and CLI demo GIFs for the README. Only run when the user explicitly asks for a new demo recording — it's slow and the result is a judgment call on what the GIF should show.
disable-model-invocation: true
---

1. **Web demo** (`scripts/record-demo/web.ts`): build and serve the app (`npm run build && npm run
preview`), then run `npx tsx scripts/record-demo/web.ts`. It records Playwright video of the
   "Android — blocked" sample, opens its `AND-16K-001` warning, moves "Check as of" to 2027-02-15
   (a day that reads the same in either date order) and reopens the finding, now an error. The raw
   video goes to `docs/media/raw/` (gitignored); ffmpeg's two-pass palette turns it into
   `docs/media/web-demo.gif` at 800 px and 12 fps, and the script fails if it's over 4 MB.
2. **CLI demo** (`scripts/record-demo/cli.tape`): `swift build --package-path cli -c release
--product storeready`, then `vhs scripts/record-demo/cli.tape` (`brew install vhs`). It writes
   `docs/media/cli-demo.gif`.
3. **Look at the result** before committing: extract a few frames with
   `ffmpeg -ss <seconds> -i docs/media/web-demo.gif -frames:v 1 frame.png` and read them.
4. **Re-record after a version bump**: the web demo's footer shows the tool and rules versions.
5. The README already embeds both GIFs (web near the top, CLI in the CLI section, per
   `docs/BUILD_BRIEF.md` §9.1); `scripts/check-repo.ts` fails if either is over 4 MB.
