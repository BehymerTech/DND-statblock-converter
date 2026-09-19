# DND-statblock-converter

Converter between DND 3, 5E, Pathfinder, and other game systems over time.

A dependency-free static site (`index.html` + `css/` + `js/`) that converts
monster/NPC stat blocks between systems, either by searching a pre-indexed SRD
library or by pasting a stat block directly. The same conversion engine is
exposed as a CLI (`tools/convert-cli.mjs`) so a Claude Code or VS Code Copilot
session can perform identical conversions — see [Skills](#skills) below.

## Running it

Open `index.html` through any static file server (fetch() of local JSON/MD
files needs `http://`, not `file://`):

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

Pick a source system and either search its indexed monsters or paste a stat
block, pick a destination system, and hit Convert. Toggle Preview/Markdown to
see a rendered view or the raw Markdown, and Copy to grab the text. Theme
switches light/dark via the button in the header (follows system preference by
default).

## Supported systems

| System | id |
| -- | -- |
| D&D 3rd Edition / 3.5 | `dnd35` |
| Pathfinder 1st Edition | `pf1` |
| D&D 5th Edition (2014) | `dnd5e2014` |
| D&D 5th Edition (2024) | `dnd5e2024` |
| Pathfinder 2nd Edition | `pf2` — **not wired up yet**, see [Limitations](#limitations) |

Conversion is possible between any two of the first four. Pathfinder 1 and
D&D 3.5 are directly compatible (same underlying math), so that pair is
close to lossless. Converting to/from 5E recalculates AC, HP, saves, skills,
and CR-driven proficiency bonus using real formulas; action/trait/attack text
is carried over from the source rather than mechanically rewritten (see
[Architecture](#architecture)).

## Architecture

```
src/
  schema.js          canonical creature shape every importer/exporter shares
  util.js            ability mods, proficiency-by-CR, CR parsing, {@tag} rendering, ...
  templateEngine.js  tiny Mustache-flavored renderer for /templates
  convert.js         dispatcher + shared lookup tables (skill/condition mapping, size tables)
  importers/         system-specific text/YAML/JSON -> canonical schema
  exporters/         canonical schema -> target system's numbers (the actual "conversion math")
templates/           one Markdown template per system, hand-editable
data/                generated per-monster JSON + search index, one folder per system
tools/
  build-data.mjs     regenerates /data from the cloned SRD repos (Node-only, not shipped to the browser)
  convert-cli.mjs    CLI entry point into src/convert.js, used by the AI skills below
index.html, css/, js/   the site itself (vanilla JS, ES modules, no build step)
```

Any source system can pair with any target system because both sides only
know about the shared canonical schema — adding a new system means writing one
importer, one exporter, and one template, not a converter per pair.

**Scope of the conversion math**: exporters recompute the numbers that have a
clean, well-defined formula in the target system (AC, HP, saving throws,
skills, CR-driven proficiency bonus). Action/trait/attack text is carried over
from the source verbatim — per-attack math (to-hit, damage dice, DCs baked
into flavor text) is exactly what every reference conversion guide treats as
"recalculate by hand," and silently guessing would be worse than flagging it.
Every conversion that does this prints a note saying so; the site surfaces
these under "Conversion notes" and the CLI prints them to stderr.

### Regenerating `/data`

`/data` is generated, not hand-written, from the SRD repos below plus the
5etools bundle already in this repo. To regenerate after re-cloning a source
or changing importer logic:

```
cd tools && npm install && node build-data.mjs
```

## Reference materials

Where possible, reference official SRD documentation:
| System | SRD URL |
| --| --|
| D&D 3rd Edition | https://github.com/BehymerTech/DnD-3.5-SRD-Markdown |
| D&D 5th Edition 2014 | ./5etools-v2.35.1 |
| D&D 5th Edition 2024 | https://github.com/BehymerTech/dnd-5e-srd-markdown |
| Pathfinder | git@github.com:BehymerTech/Pathfinder-1E-SRD-Markdown.git |
| Pathfinder 2nd Edition | https://github.com/BehymerTech/Pathfinder-2E-SRD-Markdown |
| DND 3rd edition -> 5th edition conversion guide | ./DnD_Conversions_1.0.md |
| AD&D 2nd edition -> 5th edition monster conversion | ./ADnD-2E-to-5E-conversion-summary.md |

The 2nd-to-last file was originally misfiled as a Pathfinder 2E -> 5E guide;
its content is actually AD&D 2E -> 5E, hence the rename. Real PF2 -> 5E
conversion guidance is still needed (see Limitations).

The four SRD repos above and the 5etools bundle are large third-party clones,
so they're gitignored rather than committed — clone them into `srd-data/` (and
keep `5etools-v2.35.1/` at the repo root) before running `build-data.mjs`.
Only the small generated JSON in `/data` is committed.

## Conversions

- Pathfinder version 1 is compatible with D&D 3rd edition. Conversions between
  Pathfinder 1 and 3rd edition are very straightforward, except for some
  status effects that may not be present in 3rd edition.
- If a source system contains a status effect (condition) that doesn't exist
  in the destination system, it's simply dropped from the output.

## Limitations

- **Pathfinder 2E conversion is not implemented.** PF2's math (proficiency
  ranks tied to level, the three-action economy, degrees of success) doesn't
  map onto the other systems' formulas or onto the AD&D2E-to-5E guide above.
  Its importer and searchable data exist (`src/importers/pf.js`,
  `data/pf2/`) for future work, but `src/exporters/pf2.js` intentionally
  throws, and it's excluded from both dropdowns on the site.
- Legacy-to-5E (and back) conversion approximates headline stats with real
  formulas but carries action/attack text over verbatim — see "Scope of the
  conversion math" above. Treat every conversion as a solid first draft, not
  a final answer; the source guides this project is built on describe
  conversion itself as "more art than science."
- The bulk YAML/text parsers are best-effort against real-world SRD data and
  don't parse every monster in every source repo cleanly (a build run logs
  the handful that fail); missing an obscure monster from search just means
  pasting its stat block instead.

## Skills

Two thin wrappers around the same CLI (`tools/convert-cli.mjs`), so an AI
assistant's conversions match the site's exactly instead of re-deriving the
math from general knowledge:

- **Claude Code**: `.claude/skills/statblock-converter/SKILL.md`
- **VS Code Copilot**: `.github/copilot-instructions.md` (repo-wide context)
  and `.github/prompts/convert-statblock.prompt.md` (a reusable `/convert-statblock` prompt)
