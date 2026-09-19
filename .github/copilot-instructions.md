# Copilot instructions for this repo

This repo converts D&D/Pathfinder monster stat blocks between systems: D&D 3.5
(`dnd35`), Pathfinder 1E (`pf1`), D&D 5E 2014 (`dnd5e2014`), and D&D 5E 2024
(`dnd5e2024`). The conversion logic lives in `src/` (importers parse a system
into a shared schema in `src/schema.js`, exporters turn that schema into a
target system's numbers, `templates/*.md` render the result) and is shared by
the web app (`index.html` + `js/`) and a CLI (`tools/convert-cli.mjs`).

## When asked to convert a stat block

Don't hand-compute the conversion math yourself — shell out to the existing
engine so the answer matches what the web app would produce:

```
node tools/convert-cli.mjs --from <system> --to <system> --search "<monster name>"
node tools/convert-cli.mjs --from <system> --to <system> --file <path-to-pasted-block.txt>
```

`--search` looks up a monster already indexed under `/data/<system>/`; if
ambiguous, add `--list-matches` (drop `--to`) to see the candidate slugs first.
For a stat block the user pasted, save it to a temp file and use `--file`
(or pipe it via stdin) rather than retyping it as a search query.

The command's stdout is the converted Markdown; anything printed to stderr
under "Conversion notes" is a caveat to pass along to the user, most often
that headline stats (AC/HP/saves/skills) were recalculated but action/trait
text was carried over verbatim and should be sanity-checked against the new
proficiency bonus.

**Pathfinder 2E (`pf2`) has no exporter yet** (`src/exporters/pf2.js` throws
on purpose) — its rules don't map onto the other systems' math. Say so rather
than improvising a conversion for it.

## Reference docs, not general knowledge

For conversion questions outside a single monster stat block (full character
conversion, adventures, treasure), read the guides in the repo root instead of
answering from memory: `DnD_Conversions_1.0.md` and
`ADnD-2E-to-5E-conversion-summary.md` (an AD&D 2E -> 5E monster guide — the
filename's history is unrelated to Pathfinder 2E, despite the resemblance).

## Regenerating `/data`

`/data` is generated from SRD repos cloned alongside this one (see the table in
`README.md`) via `tools/build-data.mjs`. If a search misses a monster that
should exist, that's a data-freshness problem to fix by re-running the build
script, not something to paper over with a made-up stat block.
