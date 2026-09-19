// Pathfinder 1E and 2E importers.
//
// The cloned SRD repos (see README) store each monster as an Obsidian
// "TTRPG-statblocks" fenced ```statblock block — really just YAML — which
// gives us high-fidelity structured data for the searchable index
// (parsePf1Yaml/parsePf2Yaml, fed by tools/build-data.mjs after js-yaml
// parses the block).
//
// For the paste-in flow, most people paste the human-readable stat block
// text from a book or Archives of Nethys instead, so parsePf1PastedText /
// parsePf2PastedText do a best-effort regex parse of that shape.

import { emptyCreature } from "../schema.js";
import { clean, formatMod } from "../util.js";

/** YAML parses a plain "+6" scalar as the number 6, dropping the sign — restore it for display. */
function signed(value) {
	if (value == null) return null;
	return typeof value === "number" ? formatMod(value) : String(value);
}

export function extractStatblockYamlSource(fileText) {
	const m = fileText.match(/```statblock\n([\s\S]*?)```/);
	return m ? m[1] : null;
}

function listToText(list, joiner = " ") {
	if (!Array.isArray(list)) return "";
	return list.map((item) => (item && item.desc ? item.desc : item?.name || "")).join(joiner);
}

/** Strip the Obsidian statblock plugin's markdown decoration (__bold__, [[wiki links]]) down to plain text. */
function cleanPf2Text(str) {
	return clean(
		String(str || "")
			.replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
			.replace(/\[\[([^\]]+)\]\]/g, "$1")
			.replace(/_{1,2}/g, "")
	);
}

function findAny(obj, predicate) {
	return Object.keys(obj)
		.filter(predicate)
		.map((k) => obj[k]);
}

const ABILITY_ORDER = ["str", "dex", "con", "int", "wis", "cha"];

export function parsePf1Yaml(y) {
	const c = emptyCreature();
	c.sourceSystem = "pf1";
	c.name = y.name || "";
	c.source = (y.sources || []).map((s) => s.name).join(", ") || y.source || "";
	c.size = y.size || "Medium";
	c.type = y.type || "";
	c.subtype = (y.subtype || "").replace(/[()]/g, "");
	c.alignment = y.alignment || "";
	c.cr = y.Monster_CR != null ? String(y.Monster_CR) : null;
	c.xp = y.Monster_XP ?? null;

	const acMatch = String(y.AC || "").match(/^(\d+),?\s*(?:touch\s*(\d+))?,?\s*(?:flat-footed\s*(\d+))?\s*(?:\(([^)]*)\))?/i);
	c.ac = {
		value: acMatch ? Number(acMatch[1]) : null,
		notes: acMatch?.[4] || "",
		touch: acMatch?.[2] ? Number(acMatch[2]) : null,
		flatFooted: acMatch?.[3] ? Number(acMatch[3]) : null,
	};

	c.hp = { average: y.HP ?? null, formula: y.hit_dice || "" };
	c.speed.notes = y.speed || "";
	const walk = String(y.speed || "").match(/(\d+)\s*ft/);
	if (walk) c.speed.walk = Number(walk[1]);

	if (Array.isArray(y.pf1e_stats)) {
		ABILITY_ORDER.forEach((key, idx) => {
			c.abilities[key] = y.pf1e_stats[idx] ?? 10;
		});
	}

	c.saves.text = y.saves || "";
	c.skills.text = y.skills || "";
	for (const sm of String(y.skills || "").matchAll(/([A-Z][a-zA-Z ]+?)\s([+-]\d+)/g)) {
		c.skills.list[clean(sm[1])] = sm[2];
	}
	c.feats = String(y.feats || "").split(/[;,]/).map(clean).filter(Boolean);
	c.languages = y.languages ? String(y.languages).split(",").map(clean) : [];
	c.senses = y.senses ? String(y.senses).split(",").map(clean) : [];
	if (y.perception != null) c.passivePerception = 10 + Number(y.perception || 0);
	c.initiative = signed(y.INI);
	c.babOrProficiency = y.BAB ?? null;

	if (y.melee) c.actions.push({ name: "Melee", text: String(y.melee) });
	if (y.ranged) c.actions.push({ name: "Ranged", text: String(y.ranged) });

	c.meta = {
		race: y.race,
		class: y.class,
		cmb: signed(y.CMB),
		cmd: y.CMD,
		racialModifiers: y.racial_modifiers,
		ecology: y.ecology,
	};
	c.description = y.desc_short || "";

	return c;
}

export function parsePf2Yaml(y) {
	const c = emptyCreature();
	c.sourceSystem = "pf2";
	c.name = y.name || "";
	c.source = y.sourcebook || y.source || "";
	c.size = y.size || "Medium";
	// PF2 traits list ancestry-ish traits before the creature type, e.g. trait_03: Goblin, trait_04: Humanoid.
	const traits = findAny(y, (k) => /^trait_/.test(k)).map(String);
	const nonAlignment = traits.filter((t) => !/^(good|evil|lawful|chaotic)$/i.test(t));
	c.type = nonAlignment[nonAlignment.length - 1] || "";
	c.subtype = nonAlignment.slice(0, -1).join(", ");
	c.alignment = y.alignment || "";
	c.level = y.level != null ? String(y.level) : null;

	c.ac = { value: y.ac ?? null, notes: "" };
	const armorText = listToText(y.armorclass);
	const saveMatch = armorText.match(/Fort[^\d+-]*([+-]?\d+).*?Ref[^\d+-]*([+-]?\d+).*?Will[^\d+-]*([+-]?\d+)/is);
	if (saveMatch) c.saves.text = `Fort ${saveMatch[1]}, Ref ${saveMatch[2]}, Will ${saveMatch[3]}`;

	c.hp = { average: y.hp ?? null, formula: "" };
	c.speed.notes = y.speed || "";
	const walk = String(y.speed || "").match(/(\d+)\s*feet/);
	if (walk) c.speed.walk = Number(walk[1]);

	if (Array.isArray(y.abilityMods)) {
		ABILITY_ORDER.forEach((key, idx) => {
			const mod = y.abilityMods[idx] ?? 0;
			c.abilities[key] = 10 + mod * 2; // PF2 publishes modifiers only; approximate a score for the shared schema.
		});
		c.meta.pf2AbilityMods = y.abilityMods;
	}

	const perceptionText = listToText(y.perception);
	const perceptionMatch = perceptionText.match(/Perception\s*([+-]\d+)/i);
	if (perceptionMatch) c.passivePerception = 10 + Number(perceptionMatch[1]);
	c.senses = perceptionText.split(";").slice(1).map(cleanPf2Text).filter(Boolean);

	c.skills.text = listToText(y.skills);
	for (const sm of c.skills.text.replace(/_{1,2}/g, "").matchAll(/([A-Za-z ]+?):\s*([+-]\d+)/g)) {
		c.skills.list[clean(sm[1])] = sm[2];
	}
	c.languages = y.languages ? String(y.languages).replace(/;\s*$/, "").split(",").map(clean).filter(Boolean) : [];

	const attacks = Array.isArray(y.attacks) ? y.attacks : [];
	c.actions = attacks.map((a) => ({ name: a.name || "Attack", text: cleanPf2Text(a.desc) }));

	const traitBlocks = findAny(y, (k) => /^abilities/.test(k)).flat();
	c.traits = traitBlocks.filter(Boolean).map((t) => ({ name: t.name || "", text: cleanPf2Text(t.desc) }));

	const items = findAny(y, (k) => /^abilities_top$/.test(k)).flat();
	const itemEntry = items.find((t) => /items/i.test(t?.name || ""));
	if (itemEntry) c.meta.items = itemEntry.desc;

	return c;
}

// ---- Paste-in fallback: human-readable stat block text (book / AoN style) ----

export function parsePf1PastedText(rawText) {
	const c = emptyCreature();
	c.sourceSystem = "pf1";
	const text = rawText.replace(/\r/g, "");
	const lines = text.split("\n").map((l) => clean(l)).filter(Boolean);
	c.name = titleFromLine(lines[0]);

	const crMatch = text.match(/CR\s+([\d/]+)/i);
	if (crMatch) c.cr = crMatch[1];
	const xpMatch = text.match(/XP\s+([\d,]+)/i);
	if (xpMatch) c.xp = Number(xpMatch[1].replace(/,/g, ""));

	const sizeTypeMatch = text.match(/\b(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([a-z]+)\s*(?:\(([^)]+)\))?/i);
	if (sizeTypeMatch) {
		c.size = clean(sizeTypeMatch[1]);
		c.type = clean(sizeTypeMatch[2]);
		c.subtype = clean(sizeTypeMatch[3] || "");
	}
	const alignMatch = text.match(/\b(LG|LN|LE|NG|N|NE|CG|CN|CE)\b\s+(?:Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)/);
	if (alignMatch) c.alignment = alignMatch[1];

	matchInto(text, /Init\s+([+-]\d+)/i, (m) => (c.initiative = m[1]));
	matchInto(text, /Senses\s+([^;\n]+)/i, (m) => (c.senses = m[1].split(",").map(clean)));
	matchInto(text, /Perception\s+([+-]\d+)/i, (m) => (c.passivePerception = 10 + Number(m[1])));
	matchInto(text, /AC\s+(\d+),?\s*(?:touch\s*(\d+))?,?\s*(?:flat-footed\s*(\d+))?\s*(?:\(([^)]*)\))?/i, (m) => {
		c.ac = { value: Number(m[1]), touch: m[2] ? Number(m[2]) : null, flatFooted: m[3] ? Number(m[3]) : null, notes: m[4] || "" };
	});
	matchInto(text, /hp\s+(\d+)\s*(?:\(([^)]+)\))?/i, (m) => (c.hp = { average: Number(m[1]), formula: m[2] || "" }));
	matchInto(text, /Fort\s*([+-]\d+),?\s*Ref\s*([+-]\d+),?\s*Will\s*([+-]\d+)/i, (m) => (c.saves.text = `Fort ${m[1]}, Ref ${m[2]}, Will ${m[3]}`));
	matchInto(text, /Speed\s+([^\n]+?)(?:\n|Melee|Ranged|$)/i, (m) => {
		c.speed.notes = clean(m[1]);
		const walk = m[1].match(/(\d+)\s*ft/);
		if (walk) c.speed.walk = Number(walk[1]);
	});
	matchInto(text, /Melee\s+([^\n]+)/i, (m) => c.actions.push({ name: "Melee", text: clean(m[1]) }));
	matchInto(text, /Ranged\s+([^\n]+)/i, (m) => c.actions.push({ name: "Ranged", text: clean(m[1]) }));
	matchInto(text, /Str\s+(\d+|-),?\s*Dex\s+(\d+|-),?\s*Con\s+(\d+|-),?\s*Int\s+(\d+|-),?\s*Wis\s+(\d+|-),?\s*Cha\s+(\d+|-)/i, (m) => {
		ABILITY_ORDER.forEach((key, idx) => {
			c.abilities[key] = m[idx + 1] === "-" ? null : Number(m[idx + 1]);
		});
	});
	matchInto(text, /Base Atk\s*([+-]\d+);?\s*CMB\s*([+-]?\d+);?\s*CMD\s*(\d+)/i, (m) => {
		c.babOrProficiency = Number(m[1]);
		c.meta.cmb = m[2];
		c.meta.cmd = m[3];
	});
	matchInto(text, /Feats\s+([^\n]+)/i, (m) => (c.feats = m[1].split(/[;,]/).map(clean).filter(Boolean)));
	matchInto(text, /Skills\s+([^\n]+)/i, (m) => {
		c.skills.text = clean(m[1]);
		for (const sm of m[1].matchAll(/([A-Z][a-zA-Z ]+?)\s([+-]\d+)/g)) c.skills.list[clean(sm[1])] = sm[2];
	});
	matchInto(text, /Languages\s+([^\n]+)/i, (m) => (c.languages = m[1].split(",").map(clean).filter(Boolean)));

	return c;
}

export function parsePf2PastedText(rawText) {
	const c = emptyCreature();
	c.sourceSystem = "pf2";
	const text = rawText.replace(/\r/g, "");
	const lines = text.split("\n").map((l) => clean(l)).filter(Boolean);
	c.name = titleFromLine((lines[0] || "").replace(/CREATURE\s*-?\d+/i, ""));

	const levelMatch = text.match(/CREATURE\s*(-?\d+)/i);
	if (levelMatch) c.level = levelMatch[1];

	const traitLine = lines[1] || "";
	const traitWords = traitLine.split(/\s+/).filter(Boolean);
	c.alignment = traitWords.find((w) => /^(LG|LN|LE|NG|N|NE|CG|CN|CE)$/.test(w)) || "";
	c.size = traitWords.find((w) => /^(TINY|SMALL|MEDIUM|LARGE|HUGE|GARGANTUAN)$/i.test(w)) || "Medium";
	c.type = traitWords.filter((w) => w !== c.alignment && w.toUpperCase() !== c.size.toUpperCase()).map((w) => w[0] + w.slice(1).toLowerCase()).join(", ");

	matchInto(text, /Perception\s+([+-]\d+)/i, (m) => (c.passivePerception = 10 + Number(m[1])));
	matchInto(text, /Senses\s+([^;\n]+)/i, (m) => (c.senses = m[1].split(",").map(clean)));
	matchInto(text, /Languages\s+([^\n]+)/i, (m) => (c.languages = m[1].split(",").map(clean).filter(Boolean)));
	matchInto(text, /Skills\s+([^\n]+)/i, (m) => {
		c.skills.text = clean(m[1]);
		for (const sm of m[1].matchAll(/([A-Za-z ]+?)\s([+-]\d+)/g)) c.skills.list[clean(sm[1])] = sm[2];
	});
	matchInto(text, /Str\s*([+-]\d+),?\s*Dex\s*([+-]\d+),?\s*Con\s*([+-]\d+),?\s*Int\s*([+-]\d+),?\s*Wis\s*([+-]\d+),?\s*Cha\s*([+-]\d+)/i, (m) => {
		const mods = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i]));
		ABILITY_ORDER.forEach((key, idx) => (c.abilities[key] = 10 + mods[idx] * 2));
		c.meta.pf2AbilityMods = mods;
	});
	matchInto(text, /AC\s+(\d+);?\s*Fort\s*([+-]\d+),?\s*Ref\s*([+-]\d+),?\s*Will\s*([+-]\d+)/i, (m) => {
		c.ac = { value: Number(m[1]), notes: "", touch: null, flatFooted: null };
		c.saves.text = `Fort ${m[2]}, Ref ${m[3]}, Will ${m[4]}`;
	});
	matchInto(text, /HP\s+(\d+)/i, (m) => (c.hp = { average: Number(m[1]), formula: "" }));
	matchInto(text, /Speed\s+([^\n]+)/i, (m) => {
		c.speed.notes = clean(m[1]);
		const walk = m[1].match(/(\d+)\s*feet/);
		if (walk) c.speed.walk = Number(walk[1]);
	});
	for (const m of text.matchAll(/(Melee|Ranged)\s+\[[^\]]*\]\s*([^\n]+)/gi)) {
		c.actions.push({ name: m[1], text: clean(m[2]) });
	}

	return c;
}

function titleFromLine(line) {
	return clean(line).replace(/\s+/g, " ").split(" ").map((w) => (w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w)).join(" ");
}

function matchInto(text, re, fn) {
	const m = text.match(re);
	if (m) fn(m);
}
