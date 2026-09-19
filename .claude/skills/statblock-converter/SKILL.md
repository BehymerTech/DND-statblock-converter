---
name: statblock-converter
description: Convert a D&D/Pathfinder monster stat block between D&D 3.5, Pathfinder 1E, D&D 5E (2014), and D&D 5E (2024). Use whenever the user asks to convert, port, or translate a monster/NPC stat block between these systems, or asks to look up a monster from one of these SRDs.
---

# Stat Block Converter

This repo ships a small, deterministic conversion engine (`src/`) with a searchable
SRD index (`data/`) and Markdown output templates (`templates/`). **Always run
conversions through the CLI below instead of doing the math yourself** — the CLI
is the same engine the web app (`index.html`) uses, so results stay consistent
between "asking Claude" and "using the site," and the arithmetic (proficiency
bonus by CR, AC/HP recalculation, save/skill mapping) is already implemented
and tested there.

## Systems

`dnd35` (D&D 3.5), `pf1` (Pathfinder 1E), `dnd5e2014` (D&D 5E 2014), `dnd5e2024`
(D&D 5E 2024). **Pathfinder 2E (`pf2`) is not a supported conversion source or
target yet** — its rules (proficiency ranks, three-action economy) don't map
onto the other systems' math. If asked to convert PF2, say so plainly rather
than improvising; the importer/data exist for future work but no exporter does
(see `src/exporters/pf2.js`).

## Running a conversion

From the repo root:

```
node tools/convert-cli.mjs --from <system> --to <system> --search "<monster name>"
node tools/convert-cli.mjs --from <system> --to <system> --file <path-to-pasted-block.txt>
echo "<pasted stat block>" | node tools/convert-cli.mjs --from <system> --to <system>
```

- `--search` looks up a monster already indexed in `/data/<system>/`. If the name is
  ambiguous, rerun with `--list-matches` (no `--to` needed) to see slugs, then use
  `--search <exact name>` or match a specific spelling.
- For a stat block the user pasted directly into the conversation, write it to a
  temp file and pass `--file`, or pipe it in — don't retype it into `--search`.
- Omit `--to` to just see how the source was parsed (useful for sanity-checking
  a paste before converting it).
- `--list-systems` prints the supported system ids.

The command prints the converted Markdown stat block to stdout, ready to hand
back to the user or drop into their notes. Conversion caveats print to stderr
under "Conversion notes" — **always relay these to the user**, especially:
- AC/HP recalculation notes (headline stats are recomputed with real formulas)
- "Actions/traits were carried over from the source text" — attack/damage lines
  are *not* mechanically rewritten; tell the user to sanity-check to-hit bonuses
  and DCs against the new proficiency bonus shown in the note.

## If the data isn't there

`/data` is pre-built from the SRD repos named in the root `README.md`. If a
search comes up empty for a monster that should exist, the source repos may
need re-cloning and rebuilding — see `tools/build-data.mjs`'s header comment.
Don't hand-author a stat block's numbers from memory as a substitute; either
rebuild the data or ask the user to paste the block instead.

## Broader conversion questions

For guidance beyond monster stat blocks (converting a full PC, an adventure, or
treasure) that the CLI doesn't attempt, the reference guides in the repo root
are the source of truth: `DnD_Conversions_1.0.md` (3rd/4th edition -> 5E, PCs
and adventures) and `ADnD-2E-to-5E-conversion-summary.md` (AD&D 2E monsters ->
5E — despite the similar-sounding old filename, this is **not** about
Pathfinder 2E). Read the relevant one rather than improvising from general
knowledge.
