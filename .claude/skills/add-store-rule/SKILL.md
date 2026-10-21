---
name: add-store-rule
description: Step-by-step checklist for adding or changing a store rule (rules/rules.json), including fixtures, golden files, tests, and regenerating docs. Use whenever asked to add a check, update a severity date, or react to a rules-change issue.
---

1. **Confirm the rule on the official source.** Use WebFetch on the URL(s) that will go in the
   rule's `sources` array. Quote the exact wording that justifies the check, the threshold, and
   the effective date. If the official source contradicts what's currently in `rules/rules.json`
   or `docs/BUILD_BRIEF.md`, the official source wins — update the data and tell the user.
2. **Add or edit the rule in `rules/rules.json`**, matching `schema/rules.schema.json`: `id`
   (`<PREFIX>-<CODE>-<NNN>`), `platform`, `title`, optional `confidence`, optional `appliesWhen`
   (gates whether the rule runs at all) and `parameters` (the rule's own thresholds/data — never
   hard-code these in the check function), `timeline` (one entry per severity change, each with a
   `from` date and optional `note`), `sources` (`title`, `url`, `retrieved`), `fix` (actionable
   steps).
3. **Write the check** as a small pure function, keyed by rule ID, in both
   `packages/core/src/rules/` and `cli/Sources/StoreReadyCore/`. It reads facts the analyzer
   already produced plus the rule's own `parameters` — it must not re-derive facts or hard-code
   any threshold found in `rules.json`.
4. **Add fixtures and golden files** for: a passing case, a failing case, and — if the rule has a
   multi-entry `timeline` — one case per boundary date (day before / day of / day after each
   transition). See the `make-fixture` skill.
5. **Write TS and Swift tests** for the new check function directly (not just via the fixture
   golden comparison), covering edge cases the fixtures don't hit.
6. **Sync and regenerate docs**: `npm run rules:sync` (copies `rules/*.json` into the Swift
   package), `npm run rules:doc` (regenerates `docs/RULES.md` and the README table).
7. **Bump `rulesVersion`** in `rules/rules.json` to today's date (`YYYY.MM.DD`) if the rule data
   changed.
8. **Update `CHANGELOG.md`** under `[Unreleased]`.
9. **Run `./scripts/verify.sh`** (the `verify` skill) and fix anything it flags before committing.
