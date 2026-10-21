---
name: make-fixture
description: How to add a synthetic .ipa/.aab/.apk fixture generator and its golden expected report. Use when a new rule or parser case needs a fixture.
---

1. **Add a generator script** under `fixtures/generators/` (TypeScript). It must build the zip
   deterministically: fixed timestamps on every zip entry, stable entry order, no randomness.
   Mach-O and ELF binaries in fixtures are minimal valid headers, load commands or program
   headers, and symbol tables, written by the generator — never a real compiler output.
2. **Size limit**: every committed fixture under `fixtures/files/` must stay under 200 KB (the
   repo check enforces this). If a case genuinely needs a huge file (e.g. the 500 MB performance
   fixture), generate it at test time into `fixtures/generated/` (gitignored) — never commit it.
3. **Never commit a real third-party app binary.** Fixtures are synthetic, built only by committed
   generator scripts, checked at CI by `scripts/check-repo.ts`.
4. **Run the generator** to write the fixture into `fixtures/files/`, then run the core/CLI against
   it once you've written the expected behavior, and save the output as
   `fixtures/expected/<name>.json` (default `asOf: 2026-10-20` unless the fixture specifically
   tests a different date).
5. **Review the golden diff deliberately.** When a fixture's expected output changes because of an
   intentional rule change, read the diff line by line before committing it — a golden-file drift
   that creeps in unnoticed defeats the point of golden tests.
6. **Run `./scripts/verify.sh`** (the `verify` skill) before committing.
