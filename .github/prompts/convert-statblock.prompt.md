---
mode: agent
description: Convert a monster stat block between D&D 3.5, Pathfinder 1E, D&D 5E 2014, and D&D 5E 2024.
---

Convert a monster stat block using this repo's conversion engine via the CLI —
do not compute the conversion by hand. See `.github/copilot-instructions.md`
for full context.

Ask the user (if not already given): the monster name or pasted stat block
text, the source system, and the target system. Supported system ids: `dnd35`,
`pf1`, `dnd5e2014`, `dnd5e2024`. Pathfinder 2E (`pf2`) is not supported as a
conversion target or source yet — tell the user plainly if they ask for it.

Then run one of:

```
node tools/convert-cli.mjs --from <system> --to <system> --search "<monster name>"
node tools/convert-cli.mjs --from <system> --to <system> --file <path-to-pasted-block.txt>
```

If `--search` reports multiple matches, rerun with `--list-matches` (drop
`--to`) and ask the user to confirm which one they meant.

Return the converted Markdown to the user, followed by any "Conversion notes"
the command printed to stderr — these flag recalculated stats and text that
was carried over verbatim and should be double-checked.
