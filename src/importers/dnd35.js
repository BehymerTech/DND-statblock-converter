// Parses D&D 3.5 stat blocks. Two entry points share one field-mapper:
//
//   parseDnd35Text(text)              — paste-in flow, tolerant of both the
//                                        classic label-per-line SRD text and
//                                        a pasted markdown pipe-table.
//   parseDnd35CompendiumFile(fileText) — build-time bulk import from a
//                                        "3.5 Monsters - X.md" letter file
//                                        (see README -> DnD-3.5-SRD-Markdown),
//                                        which lists one pipe-table per monster
//                                        under a "## Name" heading.

import { emptyCreature } from "../schema.js";
import { clean } from "../util.js";

const SIZE_WORDS = /^(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\b/i;
const SENSE_WORDS = ["darkvision", "low-light vision", "blindsense", "blindsight", "tremorsense", "scent", "keen senses"];

function stripWikiLinks(str) {
	return str.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1");
}

function fixMinus(str) {
	return str.replace(/--(?=\d)/g, "-");
}

/** Turn either pipe-table lines or classic "Label: value" lines into a uniform [{label, value}] list, plus any leading un-labeled lines (name/size-type). */
function toLabelValuePairs(rawText) {
	const lines = rawText.split("\n").map((l) => l.trimEnd());
	const pairs = [];
	const freeLines = [];
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		if (/^\|?\s*-{2,}\s*\|/.test(line) || /^\|?\s*-{3,}\s*$/.test(line)) continue; // markdown table separator
		if (line.startsWith("|")) {
			// Wiki-links inside a cell escape their internal pipe ("[[page\|Label]]") so it
			// doesn't read as a column separator — protect it before splitting, restore after.
			const ESCAPED_PIPE = "";
			const rawCells = line.replace(/\\\|/g, ESCAPED_PIPE).split("|");
			const trimmed = rawCells
				.slice(1, rawCells.length - 1)
				.map((c) => clean(c).replace(new RegExp(ESCAPED_PIPE, "g"), "|"));
			if (trimmed.length >= 2) {
				const label = trimmed[0].replace(/:$/, "");
				const value = trimmed.slice(1).join(" ");
				pairs.push({ label, value });
			} else if (trimmed.length === 1) {
				freeLines.push(trimmed[0]);
			}
			continue;
		}
		const m = line.match(/^([A-Za-z][A-Za-z /]{1,30}):\s*(.*)$/);
		if (m) {
			pairs.push({ label: clean(m[1]), value: clean(m[2]) });
		} else {
			freeLines.push(line);
		}
	}
	return { pairs, freeLines };
}

function applyPairs(c, pairs) {
	for (const { label, value: rawValue } of pairs) {
		const value = fixMinus(stripWikiLinks(rawValue));
		const key = label.toLowerCase();
		if (!key) {
			applySizeType(c, value);
		} else if (key === "hit dice") {
			const m = value.match(/^([\dd+\-]+)\s*(?:\(([\d,]+)\s*hp\))?/i);
			if (m) c.hp = { average: m[2] ? Number(m[2].replace(/,/g, "")) : null, formula: m[1] };
		} else if (key === "initiative") {
			c.initiative = value;
		} else if (key === "speed") {
			c.speed.notes = value;
			const walk = value.match(/(\d+)\s*ft/);
			if (walk) c.speed.walk = Number(walk[1]);
			for (const [k, re] of [["fly", /fly (\d+)/i], ["swim", /swim (\d+)/i], ["climb", /climb (\d+)/i], ["burrow", /burrow (\d+)/i]]) {
				const mm = value.match(re);
				if (mm) c.speed[k] = Number(mm[1]);
			}
		} else if (key === "armor class") {
			const m = value.match(/^(\d+)\s*(?:\(([^)]*)\))?,?\s*(?:touch\s*(\d+))?,?\s*(?:flat-footed\s*(\d+))?/i);
			if (m) {
				c.ac = {
					value: Number(m[1]),
					notes: m[2] || "",
					touch: m[3] ? Number(m[3]) : null,
					flatFooted: m[4] ? Number(m[4]) : null,
				};
			}
		} else if (key === "base attack/grapple") {
			const [babPart, grapplePart] = value.split("/");
			const m = (babPart || "").match(/^([+-]?\d+)/);
			if (m) c.babOrProficiency = Number(m[1]);
			c.meta.grapple = grapplePart ? grapplePart.trim() : "";
		} else if (key === "attack" || key === "full attack") {
			if (value && value !== "---") c.actions.push({ name: key === "attack" ? "Attack" : "Full Attack", text: value });
		} else if (key === "space/reach") {
			c.meta.spaceReach = value;
		} else if (key === "special attacks") {
			if (value && value !== "---") c.traits.push({ name: "Special Attacks", text: value });
		} else if (key === "special qualities") {
			if (value && value !== "---") {
				c.traits.push({ name: "Special Qualities", text: value });
				const lower = value.toLowerCase();
				for (const sense of SENSE_WORDS) {
					if (lower.includes(sense)) {
						const m = value.match(new RegExp(`${sense}[^,;]*`, "i"));
						if (m) c.senses.push(clean(m[0]));
					}
				}
			}
		} else if (key === "saves") {
			c.saves.text = value;
		} else if (key === "abilities") {
			for (const am of value.matchAll(/(Str|Dex|Con|Int|Wis|Cha)\s+(\d+|-{1,2})/gi)) {
				const abbr = am[1].toLowerCase();
				c.abilities[abbr] = /^-+$/.test(am[2]) ? null : Number(am[2]);
			}
		} else if (key === "skills") {
			c.skills.text = value;
			for (const sm of value.matchAll(/([A-Z][a-zA-Z ]+?)\s([+-]\d+)/g)) {
				c.skills.list[clean(sm[1])] = sm[2];
			}
		} else if (key === "feats") {
			c.feats = value.split(/[;,]/).map(clean).filter(Boolean);
		} else if (key === "environment" || key === "organization" || key === "treasure" || key === "advancement" || key === "level adjustment") {
			c.meta[key.replace(/\s+/g, "")] = value;
		} else if (key === "challenge rating") {
			c.cr = value;
		} else if (key === "alignment") {
			c.alignment = value;
		} else if (key === "languages") {
			c.languages = /^(---|none)$/i.test(value) ? [] : value.split(",").map(clean);
		}
	}
}

function applySizeType(c, text) {
	// SIZE_WORDS.source is already a parenthesized alternation ("(Fine|Diminutive|...)"); reuse it
	// directly as capture group 1 instead of wrapping it again, which would shift every later group.
	const m = clean(text).match(new RegExp(`^${SIZE_WORDS.source.slice(1, -2)}\\s+([\\w\\s]+?)(?:\\s*\\(([^)]+)\\))?$`, "i"));
	if (m) {
		c.size = clean(m[1]);
		c.type = clean(m[2]);
		c.subtype = clean(m[3] || "");
	}
}

export function parseDnd35Text(rawText) {
	const c = emptyCreature();
	c.sourceSystem = "dnd35";
	const { pairs, freeLines } = toLabelValuePairs(rawText);
	// First free line is the name (or "Name, Variant"); second free line (if size-looking) is size/type.
	if (freeLines.length) {
		c.name = freeLines[0].split(",")[0].trim();
		c.meta.variantLabel = freeLines[0];
	}
	if (freeLines[1] && SIZE_WORDS.test(freeLines[1])) applySizeType(c, freeLines[1]);
	applyPairs(c, pairs);
	return c;
}

export function parseDnd35CompendiumFile(fileText) {
	const creatures = [];
	const chunks = fileText.split(/\n## /).slice(1);
	for (const chunk of chunks) {
		const nameEndIdx = chunk.indexOf("\n");
		const groupName = clean(chunk.slice(0, nameEndIdx));
		const body = chunk.slice(nameEndIdx);
		if (!body.includes("|")) continue; // prose-only section (index pages, "Improving Monsters", etc.)
		const c = parseDnd35Text(body);
		c.name = groupName;
		if (!c.hp.formula && !c.ac.value) continue; // heading had a table for something else (e.g. a sidebar) — skip if nothing useful parsed
		creatures.push(c);
	}
	return creatures;
}
