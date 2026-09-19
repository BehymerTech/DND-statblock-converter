// Parses the 5e (2024) SRD "monsters-A-Z.md" reference file (see README ->
// dnd-5e-srd-markdown) into canonical creature records. That file lists every
// monster under "### Name" headers (grouped under "## Family" headers like
// "## Goblins"), with stats as bold-labeled lines and an HTML ability-score
// table — a fixed-enough shape to parse with regexes rather than a full
// markdown/HTML parser.

import { emptyCreature } from "../schema.js";
import { clean } from "../util.js";

function normalizeMinus(s) {
	return s.replace(/−/g, "-");
}

function parseAbilityTable(html) {
	const abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
	const cellRe = /<strong>(STR|DEX|CON|INT|WIS|CHA)<\/strong><\/td>\s*<td>(-?\d+)<\/td>/g;
	let m;
	while ((m = cellRe.exec(normalizeMinus(html)))) {
		abilities[m[1].toLowerCase()] = Number(m[2]);
	}
	return abilities;
}

function parseEntries(sectionText) {
	// Entries look like "**_Name._** _Type:_ rest of the paragraph."
	const withoutHr = sectionText.replace(/<hr>/g, "").trim();
	if (!withoutHr) return [];
	const parts = withoutHr.split(/\n(?=\*\*_)/).map((p) => clean(p)).filter(Boolean);
	return parts.map((p) => {
		const m = p.match(/^\*\*_(.+?)\._\*\*\s*(.*)$/);
		if (m) return { name: clean(m[1]), text: clean(m[2]) };
		return { name: "", text: p };
	});
}

export function parseDnd5e2024Markdown(fullText) {
	const creatures = [];
	// Split on "### " headers (monster entries); ignore the file's leading content before the first one.
	const chunks = fullText.split(/\n### /).slice(1);

	for (const chunk of chunks) {
		const nameEnd = chunk.indexOf("\n");
		const name = clean(chunk.slice(0, nameEnd));
		const body = chunk.slice(nameEnd);
		const c = emptyCreature();
		c.sourceSystem = "dnd5e2024";
		c.name = name;

		const typeMatch = body.match(/_([A-Za-z]+) ([A-Za-z ()]+?),\s*([^_]+)_/);
		if (typeMatch) {
			c.size = clean(typeMatch[1]);
			const typeAndSub = typeMatch[2].match(/^([A-Za-z ]+?)\s*\(([^)]+)\)$/);
			if (typeAndSub) {
				c.type = clean(typeAndSub[1]);
				c.subtype = clean(typeAndSub[2]);
			} else {
				c.type = clean(typeMatch[2]);
			}
			c.alignment = clean(typeMatch[3]);
		}

		const acInit = normalizeMinus(body).match(/\*\*AC\*\*\s*(\d+)\s*\*\*Initiative\*\*\s*([+-]?\d+)\s*\((\d+)\)/);
		if (acInit) {
			c.ac = { value: Number(acInit[1]), notes: "" };
			c.initiative = `${acInit[2]} (${acInit[3]})`;
		}

		const hpMatch = body.match(/\*\*HP\*\*\s*(\d+)\s*\(([^)]+)\)/);
		if (hpMatch) c.hp = { average: Number(hpMatch[1]), formula: hpMatch[2] };

		const speedMatch = body.match(/\*\*Speed\*\*\s*([^<\n]+)/);
		if (speedMatch) {
			const value = clean(speedMatch[1]);
			c.speed.notes = value;
			const walk = value.match(/(\d+)\s*ft/);
			if (walk) c.speed.walk = Number(walk[1]);
			for (const [key, re] of [["fly", /fly (\d+)/i], ["swim", /swim (\d+)/i], ["climb", /climb (\d+)/i], ["burrow", /burrow (\d+)/i]]) {
				const mm = value.match(re);
				if (mm) c.speed[key] = Number(mm[1]);
			}
		}

		const tableMatch = body.match(/<table>[\s\S]*?<\/table>/);
		if (tableMatch) c.abilities = parseAbilityTable(tableMatch[0]);

		const skillsMatch = body.match(/\*\*Skills\*\*\s*([^<\n]+)/);
		if (skillsMatch) {
			c.skills.text = clean(skillsMatch[1]);
			for (const sm of skillsMatch[1].matchAll(/([A-Z][a-zA-Z ]+?)\s(\+\d+|-\d+)/g)) {
				c.skills.list[clean(sm[1])] = sm[2];
			}
		}

		const savesMatch = body.match(/\*\*Saving Throws\*\*\s*([^<\n]+)/);
		if (savesMatch) c.saves.text = clean(savesMatch[1]);

		const sensesMatch = body.match(/\*\*Senses\*\*\s*([^<\n]+)/);
		if (sensesMatch) {
			const raw = clean(sensesMatch[1]);
			const pp = raw.match(/Passive Perception (\d+)/i);
			if (pp) c.passivePerception = Number(pp[1]);
			c.senses = raw.replace(/;?\s*Passive Perception \d+/i, "").split(",").map(clean).filter(Boolean);
		}

		const languagesMatch = body.match(/\*\*Languages\*\*\s*([^<\n]+)/);
		if (languagesMatch) {
			const raw = clean(languagesMatch[1]);
			c.languages = /^(—|none)$/i.test(raw) ? [] : raw.split(",").map(clean);
		}

		const crMatch = body.match(/\*\*CR\*\*\s*([\d/]+)\s*(?:\(XP\s*([\d,]+)(?:;\s*PB\s*\+?(\d+))?\))?/);
		if (crMatch) {
			c.cr = crMatch[1];
			if (crMatch[2]) c.xp = Number(crMatch[2].replace(/,/g, ""));
			if (crMatch[3]) c.babOrProficiency = Number(crMatch[3]);
		}

		for (const [label, key] of [["Damage Vulnerabilities", "vulnerabilities"], ["Damage Resistances", "resistances"], ["Damage Immunities", "immunities"], ["Condition Immunities", "conditionImmunities"]]) {
			const m = body.match(new RegExp(`\\*\\*${label}\\*\\*\\s*([^<\\n]+)`));
			if (m) c[key] = clean(m[1]).split(",").map(clean).filter(Boolean);
		}

		const sectionRe = /#### (Traits|Actions|Bonus Actions|Reactions|Legendary Actions)\n+([\s\S]*?)(?=\n#### |$)/g;
		let sm;
		const sectionKey = { Traits: "traits", Actions: "actions", "Bonus Actions": "bonusActions", Reactions: "reactions", "Legendary Actions": "legendaryActions" };
		while ((sm = sectionRe.exec(body))) {
			c[sectionKey[sm[1]]] = parseEntries(sm[2]);
		}

		creatures.push(c);
	}

	return creatures;
}
