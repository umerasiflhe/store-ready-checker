---
name: record-demo
description: Record the web and CLI demo GIFs for the README. Only run when the user explicitly asks for a new demo recording — it's slow and the result is a judgment call on what the GIF should show.
disable-model-invocation: true
---

1. **Web demo**: use Playwright's video recording against the deployed (or locally built) web app.
   Script: load a sample → get a `blocked` report → change the "Check as of" date and show a
   finding flip from warning to error. Save the raw video under `docs/media/raw/` (gitignored).
2. **Convert to GIF** with `ffmpeg`, using a two-pass palette generation for quality, ≤ 4 MB,
   800 px wide. Save to `docs/media/` (committed).
3. **CLI demo**: record with a VHS `.tape` file (`vhs record`), scripting `storeready check` on a
   sample fixture with `--format text`. Save the resulting GIF to `docs/media/` too.
4. **Update the README** to reference the new GIFs in the order specified in
   `docs/BUILD_BRIEF.md` §9.1 (web demo GIF near the top, CLI GIF in the CLI section).
5. Keep `docs/media/raw/` out of git (already gitignored) — only the final GIFs are committed.
