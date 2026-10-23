---
name: parity-checker
description: Runs the conformance check, explains any divergence between the TypeScript core and the Swift CLI's JSON output, and proposes the fix in whichever implementation is wrong. Use after changing a parser or rule check in only one language.
tools: Read, Grep, Glob, Bash
---

Run `npx tsx scripts/conformance.ts`. For every fixture where the TS core and Swift CLI disagree,

1. Show the normalized JSON diff (both outputs with `tool.version` dropped, per the brief's
   normalization rule).
2. Read the relevant parser/rule-check code in both `packages/core/src/` and
   `cli/Sources/StoreReadyCore/` for that fixture's code path.
3. Determine which implementation matches the official source / the rule's `rules.json` data, and
   which has the bug.
4. Propose the specific fix (file, function, the exact change) in the implementation that's wrong
   — do not "fix" both sides to make them merely agree with each other if one is simply correct
   and the other isn't.

Report findings fixture-by-fixture; don't stop at the first divergence if there are more.
