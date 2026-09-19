// Shared exporter for D&D 3.5 and Pathfinder 1E — per the README these two
// systems are directly compatible ("conversions between Pathfinder 1 and 3rd
// edition are very straightforward"), so one function produces both
// templates' context, with only the CMB/CMD-vs-Grapple bookkeeping differing.
//
// Converting from 5e into either of these is the reverse-of-normal direction:
// 5e doesn't track BAB, Fort/Ref/Will, or per-ability skill proficiency
// separately from its unified proficiency bonus, so those numbers are
// approximated from the 5e proficiency bonus and flagged as such.

import { abilityMod, formatMod, crToNumber, proficiencyForCr } from "../util.js";
import { SIZE_CMB_MOD, SIZE_GRAPPLE_MOD } from "../convert.js";

function sizeKey(size) {
	return (size || "Medium").replace(/^\w/, (c) => c.toUpperCase());
}

function reverseFromDnd5e(creature) {
	// 5e -> legacy: no BAB/Fort-Ref-Will/skill-proficiency data exists, so approximate
	// from the 5e proficiency bonus and note that explicitly.
	const pb = proficiencyForCr(creature.cr);
	const mods = Object.fromEntries(Object.entries(creature.abilities || {}).map(([k, v]) => [k, abilityMod(v)]));
	const saveText = creature.saves?.text || "";
	const pick = (label, abilKey) => {
		const m = saveText.match(new RegExp(`${label}\\s*([+-]\\d+)`, "i"));
		return m ? Number(m[1]) : mods[abilKey];
	};
	const fort = pick("Con", "con");
	const ref = pick("Dex", "dex");
	const will = pick("Wis", "wis");
	return {
		bab: pb,
		saves: `Fort ${formatMod(fort)}, Ref ${formatMod(ref)}, Will ${formatMod(will)}`,
		skillsText: creature.skills?.text || "",
		warning: `BAB and saves approximated from the 5e proficiency bonus (${formatMod(pb)}) — 5e doesn't track them the way 3.5/PF1 do, so double check against a similar-level NPC.`,
	};
}

export function toDnd35OrPf1(creature, targetSystem) {
	const warnings = [];
	const isNative = creature.sourceSystem === "dnd35" || creature.sourceSystem === "pf1";

	let bab, saves, skillsText;
	if (isNative) {
		bab = creature.babOrProficiency ?? 0;
		saves = creature.saves?.text || "";
		skillsText = creature.skills?.text || "";
	} else if (creature.sourceSystem === "dnd5e2014" || creature.sourceSystem === "dnd5e2024") {
		const r = reverseFromDnd5e(creature);
		bab = r.bab;
		saves = r.saves;
		skillsText = r.skillsText;
		warnings.push(r.warning);
	} else {
		bab = 0;
		saves = creature.saves?.text || "";
		skillsText = creature.skills?.text || "";
		warnings.push("Source system's saves/skills could not be reliably converted — carried over as-is.");
	}

	const str = creature.abilities?.str ?? 10;
	const strMod = abilityMod(str);
	const dexMod = abilityMod(creature.abilities?.dex ?? 10);
	const size = sizeKey(creature.size);

	let cmb = creature.meta?.cmb;
	let cmd = creature.meta?.cmd;
	let grapple = creature.meta?.grapple;

	if (targetSystem === "pf1" && (cmb == null || cmd == null)) {
		const sizeMod = SIZE_CMB_MOD[size] ?? 0;
		cmb = formatMod(bab + strMod + sizeMod);
		cmd = 10 + bab + strMod + dexMod + sizeMod;
		if (!isNative || creature.sourceSystem === "dnd35") warnings.push("CMB/CMD derived from BAB, Strength, and size (PF1 didn't exist as a distinct stat in the source).");
	}
	if (targetSystem === "dnd35" && grapple == null) {
		const sizeMod = SIZE_GRAPPLE_MOD[size] ?? 0;
		grapple = formatMod(bab + strMod + sizeMod);
	}

	const context = {
		name: creature.name,
		size,
		type: creature.type,
		subtype: creature.subtype,
		alignment: creature.alignment,
		hpAverage: creature.hp?.average,
		hpFormula: creature.hp?.formula,
		ac: creature.ac?.value,
		acNotes: creature.ac?.notes,
		touch: creature.ac?.touch,
		flatFooted: creature.ac?.flatFooted,
		initiative: creature.initiative || formatMod(dexMod),
		speedText: creature.speed?.notes || `${creature.speed?.walk ?? 30} ft.`,
		abilities: creature.abilities,
		bab: formatMod(bab),
		grapple,
		cmb,
		cmd,
		saves,
		skillsText,
		feats: (creature.feats || []).join(", "),
		languages: (creature.languages || []).join(", "),
		senses: (creature.senses || []).join(", "),
		cr: creature.cr ?? crToNumber(creature.cr),
		xp: creature.xp,
		traits: creature.traits || [],
		actions: creature.actions || [],
	};

	if (!isNative) warnings.push("Actions and special abilities were carried over from the source text — reconcile to-hit bonuses and DCs by hand.");

	return { context, warnings };
}
