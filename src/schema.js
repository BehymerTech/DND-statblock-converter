// Canonical creature schema shared by every importer and exporter.
//
// Importers turn a system-specific source (raw text, YAML statblock, 5etools
// JSON) into this shape. Exporters turn this shape into system-specific
// numbers and then hand the result to a Markdown template. Keeping one
// shared shape in the middle is what lets any "from" system pair with any
// "to" system instead of needing a hand-written converter per pair.
//
// Fields are intentionally permissive (strings alongside numbers) because
// source material is inconsistent; exporters should fall back gracefully
// when a numeric field is missing.

/** @returns {object} an empty creature record with every field present. */
export function emptyCreature() {
	return {
		name: "",
		sourceSystem: "", // dnd35 | pf1 | pf2 | dnd5e2014 | dnd5e2024
		source: "", // book/document the block came from, for attribution
		size: "Medium",
		type: "",
		subtype: "",
		alignment: "",
		cr: null, // number or fraction string, 5e/PF1/PF2 challenge rating
		level: null, // PF2 uses "level" instead of CR; kept separate for fidelity
		xp: null,

		ac: { value: null, notes: "", touch: null, flatFooted: null },
		hp: { average: null, formula: "", touch: null, flatFooted: null },
		speed: { walk: 30, fly: null, swim: null, climb: null, burrow: null, notes: "" },

		abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
		saves: { text: "", fort: null, ref: null, will: null }, // raw text always kept; numeric parse best-effort
		skills: { text: "", list: {} }, // list: { "Stealth": "+6" }

		vulnerabilities: [],
		resistances: [],
		immunities: [],
		conditionImmunities: [],
		senses: [],
		passivePerception: null,
		languages: [],

		initiative: null,
		babOrProficiency: null, // 3.5/PF1 base attack bonus, or 5e proficiency bonus
		feats: [],

		traits: [], // [{ name, text }]
		actions: [], // [{ name, text }]
		bonusActions: [],
		reactions: [],
		legendaryActions: [],
		spellcasting: [], // [{ name, text }] — kept as free text, systems format this too differently to normalize

		description: "",

		// Anything importer-specific worth keeping for round-tripping or debugging,
		// never read by exporters directly.
		meta: {},
	};
}

export const SYSTEMS = [
	{ id: "dnd35", label: "D&D 3rd Edition / 3.5" },
	{ id: "pf1", label: "Pathfinder 1st Edition" },
	{ id: "pf2", label: "Pathfinder 2nd Edition" },
	{ id: "dnd5e2014", label: "D&D 5th Edition (2014)" },
	{ id: "dnd5e2024", label: "D&D 5th Edition (2024)" },
];
