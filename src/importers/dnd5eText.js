// Parses a plain-text 5e stat block — the shape you get pasting from
// D&D Beyond, 5etools, or typing straight out of a Monster Manual — into
// the canonical creature schema. Used for the "paste a stat block" flow for
// both the 2014 and 2024 rulesets, since their prose format is nearly
// identical (2024 additionally prints an Initiative line).
//
// Expected shape (blank lines optional, order fixed, section labels required):
//
//   Goblin
//   Small humanoid (goblinoid), neutral evil
//   Armor Class 15 (leather armor, shield)
//   Hit Points 7 (2d6)
//   Speed 30 ft.
//   STR 8 (-1) DEX 14 (+2) CON 10 (+0) INT 10 (+0) WIS 8 (-1) CHA 8 (-1)
//   Skills Stealth +6
//   Senses darkvision 60 ft., passive Perception 9
//   Languages Common, Goblin
//   Challenge 1/4 (50 XP)
//   Nimble Escape. The goblin can take the Disengage or Hide action ...
//   Actions
//   Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.

import { emptyCreature } from "../schema.js";
import { clean } from "../util.js";

const LABELED_LINE = /^(Armor Class|AC|Hit Points|HP|Speed|Skills|Senses|Languages|Challenge|CR|Damage Vulnerabilities|Damage Resistances|Damage Immunities|Condition Immunities|Saving Throws|Saves|Initiative)\b[:.]?\s*(.*)$/i;
const SECTION_HEADERS = ["Actions", "Bonus Actions", "Reactions", "Legendary Actions", "Traits"];

function splitBlocks(text) {
	// Named entries look like "**_Name._** rest..." or "Name. rest..." — split on
	// a capitalized phrase (up to ~6 words) followed by a period and a space,
	// but only at the start of a line, to avoid splitting mid-sentence.
	return text
		.split(/\n(?=\S)/)
		.map((l) => clean(l))
		.filter(Boolean);
}

function parseNamedEntry(line) {
	const cleaned = line.replace(/\*\*|_|#+\s*/g, "");
	const m = cleaned.match(/^([A-Z][A-Za-z0-9 '\-()/]{1,60}?)\.\s*(.*)$/);
	if (m) return { name: clean(m[1]), text: clean(m[2]) };
	return { name: "", text: clean(cleaned) };
}

export function parseDnd5eText(rawText) {
	const creature = emptyCreature();
	const lines = rawText
		.split("\n")
		.map((l) => clean(l))
		.filter((l, idx, arr) => l.length > 0 || (idx > 0 && idx < arr.length - 1));

	let i = 0;
	// Name is the first non-empty line.
	while (i < lines.length && !lines[i]) i += 1;
	creature.name = lines[i] || "Unnamed Creature";
	i += 1;

	// Size/type/alignment line, e.g. "Small humanoid (goblinoid), neutral evil"
	if (lines[i] && !LABELED_LINE.test(lines[i])) {
		const typeLine = lines[i];
		const m = typeLine.match(/^(\w+)\s+([\w\s]+?)(?:\s*\(([^)]+)\))?,\s*(.+)$/);
		if (m) {
			creature.size = clean(m[1]);
			creature.type = clean(m[2]);
			creature.subtype = clean(m[3] || "");
			creature.alignment = clean(m[4]);
		}
		i += 1;
	}

	let bodyStart = -1;
	for (; i < lines.length; i += 1) {
		const line = lines[i];
		if (SECTION_HEADERS.some((h) => line.toLowerCase() === h.toLowerCase())) {
			bodyStart = i;
			break;
		}
		const m = line.match(LABELED_LINE);
		if (!m) {
			if (/^STR\s/i.test(line) || /^\|?\s*STR\b/i.test(line)) {
				// "STR 8 (-1) DEX 14 (+2) ..." — grab each ability's raw score, not the modifier in parens.
				for (const sm of line.matchAll(/(STR|DEX|CON|INT|WIS|CHA)\D+?(\d+)/gi)) {
					creature.abilities[sm[1].toLowerCase()] = Number(sm[2]);
				}
			} else if (bodyStart === -1 && creature.traits !== undefined && line) {
				// Unlabeled line before the Actions header: treat as a trait block.
				const entry = parseNamedEntry(line);
				if (entry.name) creature.traits.push(entry);
			}
			continue;
		}
		const label = m[1].toLowerCase();
		const value = m[2];
		if (label === "armor class" || label === "ac") {
			const num = parseInt(value, 10);
			creature.ac = { value: Number.isFinite(num) ? num : null, notes: value.replace(/^\d+\s*/, "").trim() };
		} else if (label === "hit points" || label === "hp") {
			const num = parseInt(value, 10);
			const formula = (value.match(/\(([^)]+)\)/) || [])[1] || "";
			creature.hp = { average: Number.isFinite(num) ? num : null, formula };
		} else if (label === "speed") {
			creature.speed.notes = value;
			const walk = value.match(/(\d+)\s*ft/);
			if (walk) creature.speed.walk = Number(walk[1]);
			for (const [key, re] of [["fly", /fly (\d+)/i], ["swim", /swim (\d+)/i], ["climb", /climb (\d+)/i], ["burrow", /burrow (\d+)/i]]) {
				const mm = value.match(re);
				if (mm) creature.speed[key] = Number(mm[1]);
			}
		} else if (label === "skills") {
			creature.skills.text = value;
			for (const sm of value.matchAll(/([A-Z][a-zA-Z ]+?)\s(\+\d+|-\d+)/g)) {
				creature.skills.list[clean(sm[1])] = sm[2];
			}
		} else if (label === "senses") {
			creature.senses = value.split(",").map(clean).filter((s) => !/passive perception/i.test(s));
			const pp = value.match(/passive perception (\d+)/i);
			if (pp) creature.passivePerception = Number(pp[1]);
		} else if (label === "languages") {
			creature.languages = value === "—" || value === "-" ? [] : value.split(",").map(clean);
		} else if (label === "challenge" || label === "cr") {
			const m2 = value.match(/([\d/]+)\s*(?:\(([\d,]+)\s*XP\))?/);
			if (m2) {
				creature.cr = m2[1];
				if (m2[2]) creature.xp = Number(m2[2].replace(/,/g, ""));
			}
		} else if (label === "damage vulnerabilities") {
			creature.vulnerabilities = value.split(",").map(clean);
		} else if (label === "damage resistances") {
			creature.resistances = value.split(",").map(clean);
		} else if (label === "damage immunities") {
			creature.immunities = value.split(",").map(clean);
		} else if (label === "condition immunities") {
			creature.conditionImmunities = value.split(",").map(clean);
		} else if (label === "saving throws" || label === "saves") {
			creature.saves.text = value;
		} else if (label === "initiative") {
			creature.initiative = value;
		}
	}

	if (bodyStart !== -1) {
		let currentSection = "traits";
		for (let j = bodyStart; j < lines.length; j += 1) {
			const line = lines[j];
			const headerMatch = SECTION_HEADERS.find((h) => line.toLowerCase() === h.toLowerCase());
			if (headerMatch) {
				currentSection = { Actions: "actions", "Bonus Actions": "bonusActions", Reactions: "reactions", "Legendary Actions": "legendaryActions", Traits: "traits" }[headerMatch];
				continue;
			}
			if (!line) continue;
			const entry = parseNamedEntry(line);
			creature[currentSection].push(entry);
		}
	}

	return creature;
}
