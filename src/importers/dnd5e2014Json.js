// Converts one 5etools bestiary entry (data/bestiary/*.json in the
// 5etools-v2.35.1 bundle referenced by the README) into the canonical
// creature schema. This is the highest-fidelity 5e (2014) source we have —
// structured JSON beats parsing rendered text — so it's used for the
// searchable monster index. Pure function: no file I/O here, that lives in
// tools/build-data.mjs.

import { emptyCreature } from "../schema.js";
import { stripTags, clean } from "../util.js";

const SIZE_MAP = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };
const ALIGN_MAP = { L: "lawful", N: "neutral", C: "chaotic", G: "good", E: "evil", U: "unaligned", A: "any alignment" };

function entriesToText(entries) {
	if (!entries) return "";
	return entries
		.map((e) => {
			if (typeof e === "string") return stripTags(e);
			if (e && e.type === "list" && Array.isArray(e.items)) {
				return e.items
					.map((item) => {
						if (typeof item === "string") return `- ${stripTags(item)}`;
						const text = item.entry ? stripTags(item.entry) : entriesToText(item.entries);
						return item.name ? `- **${stripTags(item.name)}.** ${text}` : `- ${text}`;
					})
					.join("\n");
			}
			if (e && e.entries) return entriesToText(e.entries);
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function namedEntries(list) {
	if (!Array.isArray(list)) return [];
	return list.map((e) => ({ name: e.name || "", text: entriesToText(e.entries) }));
}

function formatAlignment(alignArr) {
	if (!alignArr) return "";
	return alignArr.map((a) => ALIGN_MAP[a] || a).join(" ");
}

export function fromFiveToolsJson(mon) {
	const c = emptyCreature();
	c.sourceSystem = "dnd5e2014";
	c.name = mon.name;
	c.source = mon.source || "";
	c.size = SIZE_MAP[mon.size?.[0]] || "Medium";
	c.type = typeof mon.type === "string" ? mon.type : mon.type?.type || "";
	c.subtype = typeof mon.type === "object" ? (mon.type.tags || []).map((t) => (typeof t === "string" ? t : t.tag)).join(", ") : "";
	c.alignment = formatAlignment(mon.alignment);
	c.cr = typeof mon.cr === "object" ? mon.cr?.cr : mon.cr ?? null;

	const ac = mon.ac?.[0];
	c.ac = {
		value: typeof ac === "number" ? ac : ac?.ac ?? null,
		notes: ac?.from ? ac.from.map(stripTags).join(", ") : ac?.condition || "",
	};

	c.hp = { average: mon.hp?.average ?? null, formula: mon.hp?.formula || "" };

	c.speed = {
		walk: mon.speed?.walk?.number ?? mon.speed?.walk ?? 0,
		fly: mon.speed?.fly?.number ?? mon.speed?.fly ?? null,
		swim: mon.speed?.swim?.number ?? mon.speed?.swim ?? null,
		climb: mon.speed?.climb?.number ?? mon.speed?.climb ?? null,
		burrow: mon.speed?.burrow?.number ?? mon.speed?.burrow ?? null,
		notes: "",
	};

	c.abilities = {
		str: mon.str ?? 10,
		dex: mon.dex ?? 10,
		con: mon.con ?? 10,
		int: mon.int ?? 10,
		wis: mon.wis ?? 10,
		cha: mon.cha ?? 10,
	};

	if (mon.save) {
		c.saves.text = Object.entries(mon.save).map(([k, v]) => `${clean(k)} ${v}`).join(", ");
	}
	if (mon.skill) {
		c.skills.list = mon.skill;
		c.skills.text = Object.entries(mon.skill).map(([k, v]) => `${titleCaseSkill(k)} ${v}`).join(", ");
	}

	c.vulnerabilities = flattenDamageList(mon.vulnerable);
	c.resistances = flattenDamageList(mon.resist);
	c.immunities = flattenDamageList(mon.immune);
	c.conditionImmunities = (mon.conditionImmune || []).map(stripTags);
	c.senses = (mon.senses || []).map(stripTags);
	c.passivePerception = mon.passive ?? null;
	c.languages = mon.languages ? mon.languages.map(stripTags) : [];

	c.traits = namedEntries(mon.trait);
	c.actions = namedEntries(mon.action);
	c.bonusActions = namedEntries(mon.bonus);
	c.reactions = namedEntries(mon.reaction);
	c.legendaryActions = namedEntries(mon.legendary);
	if (mon.spellcasting) {
		c.spellcasting = mon.spellcasting.map((sc) => {
			const parts = [entriesToText(sc.headerEntries), formatSpellsByLevel(sc.spells), entriesToText(sc.footerEntries)].filter(Boolean);
			return { name: sc.name || "Spellcasting", text: parts.join("\n") };
		});
	}

	return c;
}

function titleCaseSkill(key) {
	return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1");
}

const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd" };

/** 5etools stores a spellcaster's known spells as {"0": {spells:[...]}, "1": {slots, spells:[...]}, ...} keyed by spell level. */
function formatSpellsByLevel(spells) {
	if (!spells) return "";
	return Object.entries(spells)
		.sort(([a], [b]) => Number(a) - Number(b))
		.map(([level, info]) => {
			const list = (info.spells || []).map(stripTags).join(", ");
			if (!list) return "";
			if (level === "0") return `Cantrips (at will): ${list}`;
			const label = ORDINALS[level] || `${level}th`;
			return `${label} level (${info.slots} slot${info.slots === 1 ? "" : "s"}): ${list}`;
		})
		.filter(Boolean)
		.join("\n");
}

function flattenDamageList(list) {
	if (!list) return [];
	const out = [];
	for (const item of list) {
		if (typeof item === "string") out.push(item);
		else if (item && Array.isArray(item.resist)) out.push(`${item.resist.join(", ")} ${item.note || ""}`.trim());
		else if (item && item.special) out.push(stripTags(item.special));
	}
	return out;
}
