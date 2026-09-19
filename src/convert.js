// Conversion dispatcher. Ties an already-imported canonical creature to a
// target system's exporter, and holds the small lookup tables ("which 5e
// skill does 3.5's Move Silently become") shared by more than one exporter.
//
// Scope, deliberately: exporters recompute the numbers that have a clean,
// well-defined formula in the target system (AC, HP, saves, skills, CR-driven
// proficiency). Action/trait/attack text is carried over from the source
// verbatim rather than mechanically rewritten — per-attack math (to-hit,
// damage dice, save DCs baked into flavor text) is exactly the part every
// reference conversion guide treats as "recalculate by hand," and getting it
// wrong silently would be worse than being upfront that a GM should sanity
// check attack lines against the new proficiency bonus. This mirrors the
// framing in DnD_Conversions_1.0.md: conversion is "more art than science."

import { emptyCreature, SYSTEMS } from "./schema.js";
import { cleanMarkup } from "./util.js";
import { parseDnd5eText } from "./importers/dnd5eText.js";
import { parseDnd35Text } from "./importers/dnd35.js";
import { parsePf1PastedText, parsePf2PastedText } from "./importers/pf.js";
import { toDnd5e } from "./exporters/dnd5e.js";
import { toDnd35OrPf1 } from "./exporters/dnd35pf1.js";
import { toPf2 } from "./exporters/pf2.js";
import { parseItemText } from "./importers/items.js";
import { toItem } from "./exporters/items.js";

export { SYSTEMS };

/** Systems wired up for conversion in either direction. PF2 isn't yet (see exporters/pf2.js) — its
 * importer/data still exist for future work, just not surfaced as a convert source or target. */
export const CONVERTIBLE_SYSTEMS = ["dnd35", "pf1", "dnd5e2014", "dnd5e2024"];
export const CONVERTIBLE_TARGETS = CONVERTIBLE_SYSTEMS;

/** Parse pasted stat block text for a given source system into the canonical schema. */
export function importPastedText(rawText, fromSystem) {
	const text = cleanMarkup(rawText);
	let creature;
	switch (fromSystem) {
		case "dnd5e2014":
		case "dnd5e2024":
			creature = parseDnd5eText(text);
			break;
		case "dnd35":
			creature = parseDnd35Text(text);
			break;
		case "pf1":
			creature = parsePf1PastedText(text);
			break;
		case "pf2":
			creature = parsePf2PastedText(text);
			break;
		default:
			throw new Error(`Unknown source system: ${fromSystem}`);
	}
	// parseDnd5eText is shared by both 5e rulesets and can't know which one on its own — stamp it
	// here so exporters can tell "already 5e" (skip recompute) from "converting into 5e" (recompute).
	creature.sourceSystem = fromSystem;
	return creature;
}

/** Parse a pasted item (weapon, armor, gear, or magic item) into the canonical item schema. */
export function importPastedItem(rawText, fromSystem) {
	const item = parseItemText(cleanMarkup(rawText));
	item.sourceSystem = fromSystem;
	return item;
}

/** Compute the render-ready context (and any conversion warnings) for an item in a target system. */
export function exportItem(item, toSystem) {
	if (!CONVERTIBLE_TARGETS.includes(toSystem)) throw new Error(`Unknown target system: ${toSystem}`);
	return toItem(item, toSystem);
}

/** Compute the render-ready context (and any conversion warnings) for a target system. */
export function exportCreature(creature, toSystem) {
	switch (toSystem) {
		case "dnd5e2014":
		case "dnd5e2024":
			return toDnd5e(creature);
		case "dnd35":
		case "pf1":
			return toDnd35OrPf1(creature, toSystem);
		case "pf2":
			return toPf2();
		default:
			throw new Error(`Unknown target system: ${toSystem}`);
	}
}

export const CONDITIONS_5E = new Set([
	"blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled",
	"incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone",
	"restrained", "stunned", "unconscious",
]);

/** README rule: a condition with no equivalent in the destination system is just dropped. */
export function filterConditionsFor5e(list) {
	return (list || []).filter((c) => CONDITIONS_5E.has(String(c).toLowerCase().trim()));
}

export const SKILL_TO_5E = {
	"hide": "Stealth", "move silently": "Stealth", "stealth": "Stealth",
	"spot": "Perception", "listen": "Perception", "perception": "Perception",
	"sense motive": "Insight", "bluff": "Deception", "deception": "Deception",
	"diplomacy": "Persuasion", "persuasion": "Persuasion", "intimidate": "Intimidation", "intimidation": "Intimidation",
	"balance": "Acrobatics", "tumble": "Acrobatics", "acrobatics": "Acrobatics",
	"climb": "Athletics", "jump": "Athletics", "swim": "Athletics", "athletics": "Athletics",
	"handle animal": "Animal Handling", "ride": "Animal Handling", "animal handling": "Animal Handling",
	"search": "Investigation", "investigation": "Investigation",
	"heal": "Medicine", "medicine": "Medicine",
	"survival": "Survival",
	"perform": "Performance", "performance": "Performance",
	"knowledge (arcana)": "Arcana", "arcana": "Arcana",
	"knowledge (religion)": "Religion", "religion": "Religion",
	"knowledge (nature)": "Nature", "nature": "Nature",
	"knowledge (history)": "History", "history": "History",
	"knowledge (local)": "History", "knowledge (planes)": "Arcana", "knowledge (dungeoneering)": "Nature",
	"sleight of hand": "Sleight of Hand", "disable device": null, "open lock": null,
	"use magic device": null, "concentration": null, "craft": null, "profession": null,
	"escape artist": "Acrobatics", "linguistics": null, "appraise": null,
};

const SKILL_ABILITY = {
	Athletics: "str", Acrobatics: "dex", "Sleight of Hand": "dex", Stealth: "dex",
	Arcana: "int", History: "int", Investigation: "int", Nature: "int", Religion: "int",
	"Animal Handling": "wis", Insight: "wis", Medicine: "wis", Perception: "wis", Survival: "wis",
	Deception: "cha", Intimidation: "cha", Performance: "cha", Persuasion: "cha",
};
export { SKILL_ABILITY };

export const SIZE_ORDER_5E = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

/** 3.5/PF1 sizes finer than Tiny or bigger than Gargantuan get clamped to 5e's range. */
export function clampTo5eSize(size) {
	const s = (size || "Medium").trim();
	if (/^(Fine|Diminutive)$/i.test(s)) return "Tiny";
	if (/^Colossal/i.test(s)) return "Gargantuan";
	if (SIZE_ORDER_5E.some((x) => x.toLowerCase() === s.toLowerCase())) {
		return SIZE_ORDER_5E.find((x) => x.toLowerCase() === s.toLowerCase());
	}
	return "Medium";
}

// 3.5/PF1 size modifier to CMB (attack-roll-style; more negative for smaller creatures).
export const SIZE_CMB_MOD = { Fine: -8, Diminutive: -4, Tiny: -2, Small: -1, Medium: 0, Large: 1, Huge: 2, Gargantuan: 4, Colossal: 8 };
// 3.5's older grapple modifier scale (wider swing than CMB).
export const SIZE_GRAPPLE_MOD = { Fine: -16, Diminutive: -12, Tiny: -8, Small: -4, Medium: 0, Large: 4, Huge: 8, Gargantuan: 12, Colossal: 16 };

export function newEmptyContext() {
	return emptyCreature();
}
