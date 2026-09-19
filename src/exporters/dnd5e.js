// Shared exporter for both 5e rulesets (2014 and 2024 render from the same
// computed context through different Markdown templates — the two rulesets
// don't differ enough mechanically to need separate math, just separate
// layout).

import { abilityMod, formatMod, crToNumber, proficiencyForCr, hitDieForSize, averageHp, numberToCrString } from "../util.js";
import { clampTo5eSize, filterConditionsFor5e, SKILL_TO_5E, SKILL_ABILITY } from "../convert.js";

function parseLegacySaves(text) {
	const m = String(text || "").match(/Fort(?:itude)?\s*([+-]\d+).*?Ref(?:lex)?\s*([+-]\d+).*?Will\s*([+-]\d+)/is);
	if (!m) return null;
	return { fort: Number(m[1]), ref: Number(m[2]), will: Number(m[3]) };
}

function estimateHd(creature) {
	const formula = creature.hp?.formula || "";
	const m = formula.match(/^(\d+)d/);
	if (m) return Number(m[1]);
	// No dice formula available (e.g. a pasted block missing Hit Dice) — fall back to a CR-based guess.
	return Math.max(1, Math.round(crToNumber(creature.cr) || 1));
}

export function toDnd5e(creature) {
	const warnings = [];
	const isNative = creature.sourceSystem === "dnd5e2014" || creature.sourceSystem === "dnd5e2024";
	const size = clampTo5eSize(creature.size);
	if (size !== creature.size) warnings.push(`Size "${creature.size}" isn't part of 5e's size list — mapped to ${size}.`);

	const cr = creature.cr ?? (creature.level != null ? creature.level : "1/4");
	const pb = proficiencyForCr(cr);

	const abilities = creature.abilities || {};
	const mods = Object.fromEntries(Object.entries(abilities).map(([k, v]) => [k, abilityMod(v)]));

	// --- Armor Class ---
	let ac = creature.ac?.value ?? 10 + mods.dex;
	if (!isNative && creature.ac?.notes) {
		// Strip the "size" component from a legacy AC breakdown — 5e folds size into hit points, not
		// AC. 3.5 writes "+1 size", PF1 writes "size +1" — check both orders.
		const sizeComponent = creature.ac.notes.match(/([+-]\d+)\s*size/i) || creature.ac.notes.match(/size\s*([+-]\d+)/i);
		if (sizeComponent) {
			ac -= Number(sizeComponent[1]);
			warnings.push(`AC adjusted from ${creature.ac.value} by removing the source's ${formatMod(Number(sizeComponent[1]))} size bonus (5e has none).`);
		}
	}

	// --- Hit Points ---
	let hpAverage = creature.hp?.average ?? null;
	let hpFormula = creature.hp?.formula ?? "";
	if (!isNative) {
		const hd = estimateHd(creature);
		const die = hitDieForSize(size);
		hpAverage = averageHp(hd, die, mods.con);
		hpFormula = `${hd}d${die}${mods.con ? formatMod(mods.con * hd) : ""}`;
		warnings.push(`HP recalculated for 5e using ${hd}d${die} (size-based die) + Constitution — was ${creature.hp?.formula || "unspecified"} in the source.`);
	}

	// --- Saving throws ---
	let savesLine = "";
	if (isNative) {
		savesLine = creature.saves?.text || "";
	} else {
		const legacy = parseLegacySaves(creature.saves?.text);
		if (legacy) {
			const map = [["fort", "con", "Con"], ["ref", "dex", "Dex"], ["will", "wis", "Wis"]];
			const parts = [];
			for (const [legacyKey, abilKey, label] of map) {
				if (legacy[legacyKey] > mods[abilKey]) parts.push(`${label} ${formatMod(mods[abilKey] + pb)}`);
			}
			savesLine = parts.join(", ");
		}
	}

	// --- Skills ---
	let skillsLine = "";
	if (isNative) {
		skillsLine = creature.skills?.text || "";
	} else {
		const parts = [];
		for (const rawName of Object.keys(creature.skills?.list || {})) {
			const mapped = SKILL_TO_5E[rawName.toLowerCase()];
			if (mapped === null) continue; // no 5e equivalent (e.g. Use Magic Device) — dropped per the "no equivalent -> remove" rule.
			const skillName = mapped || rawName;
			const abilKey = SKILL_ABILITY[skillName] || "str";
			if (!parts.some((p) => p.startsWith(skillName))) {
				parts.push(`${skillName} ${formatMod(mods[abilKey] + pb)}`);
			}
		}
		skillsLine = parts.join(", ");
		if (Object.keys(creature.skills?.list || {}).length && !parts.length) {
			warnings.push("Source skills had no 5e equivalent and were removed.");
		}
	}

	const conditionImmunities = isNative ? (creature.conditionImmunities || []) : filterConditionsFor5e(creature.conditionImmunities);
	if (!isNative && (creature.conditionImmunities || []).length !== conditionImmunities.length) {
		warnings.push("Some condition immunities have no 5e equivalent and were removed.");
	}

	if (!isNative && (creature.actions?.length || creature.traits?.length)) {
		warnings.push(`Actions/traits were carried over from the source text — review to-hit bonuses and DCs against the new proficiency bonus (${formatMod(pb)}).`);
	}

	const context = {
		name: creature.name,
		size,
		type: creature.type,
		subtype: creature.subtype,
		alignment: creature.alignment,
		ac,
		hpAverage,
		hpFormula,
		speedText: creature.speed?.notes || describeSpeed(creature.speed),
		abilities,
		mods,
		savesLine,
		skillsLine,
		vulnerabilities: (creature.vulnerabilities || []).join(", "),
		resistances: (creature.resistances || []).join(", "),
		immunities: (creature.immunities || []).join(", "),
		conditionImmunities: conditionImmunities.join(", "),
		sensesLine: (creature.senses || []).join(", "),
		passivePerception: creature.passivePerception ?? 10 + mods.wis,
		languagesLine: (creature.languages || []).join(", ") || "—",
		cr: numberToCrString(crToNumber(cr)),
		xp: creature.xp,
		pb,
		initiative: formatMod(mods.dex),
		initiativePassive: 10 + mods.dex,
		traits: creature.traits || [],
		actions: creature.actions || [],
		bonusActions: creature.bonusActions || [],
		reactions: creature.reactions || [],
		legendaryActions: creature.legendaryActions || [],
		spellcasting: creature.spellcasting || [],
	};

	return { context, warnings };
}

function describeSpeed(speed) {
	if (!speed) return "30 ft.";
	const parts = [`${speed.walk ?? 30} ft.`];
	if (speed.fly) parts.push(`fly ${speed.fly} ft.`);
	if (speed.swim) parts.push(`swim ${speed.swim} ft.`);
	if (speed.climb) parts.push(`climb ${speed.climb} ft.`);
	if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
	return parts.join(", ");
}
