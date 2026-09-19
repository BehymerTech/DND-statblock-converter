// Item conversion: canonical item -> a render-ready context for templates/item.md
// in the target system's vocabulary. As with monsters, numbers that have a clean
// formula (cost, weight, AC <-> armor bonus, damage die by size, range) are
// recomputed; magic item *effects* are carried over as text and flagged for review.

import { formatMod } from "../util.js";

const RARITY_GP = { common: 100, uncommon: 400, rare: 4000, "very rare": 40000, legendary: 200000 };
const CONSUMABLE = /potion|scroll|oil|ammunition|dust|elixir/i;
// 3.5's damage-by-size steps, used to derive a Small-wielder die when converting from 5e (which has only one die).
const STEP_DOWN = { "2d8": "2d6", "2d6": "1d10", "1d12": "1d10", "1d10": "1d8", "1d8": "1d6", "1d6": "1d4", "1d4": "1d3", "1d3": "1d2", "1d2": "1", "2d4": "1d6" };
// Per-category defaults 5e has no equivalent for, applied when converting armor into 3.5/PF1.
const LEGACY_ARMOR_DEFAULTS = {
	light: { maxDex: 6, check: 0, spell: 10 },
	medium: { maxDex: 3, check: -3, spell: 25 },
	heavy: { maxDex: 1, check: -6, spell: 35 },
	shield: { maxDex: null, check: -1, spell: 5 },
};
const ICONS = { weapon: "⚔️", armor: "🛡️", gear: "🎒", magic: "✨" };

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const is5e = (system) => system === "dnd5e2014" || system === "dnd5e2024";

export function formatGp(gp) {
	if (gp == null) return "";
	const fmt = (n) => (Number.isInteger(n) ? n : Number(n.toFixed(2))).toLocaleString("en-US");
	if (gp >= 1) return `${fmt(gp)} gp`;
	if (gp >= 0.1) return `${fmt(gp * 10)} sp`;
	return `${fmt(gp * 100)} cp`;
}

export function rarityFromGp(gp) {
	if (gp == null) return "";
	if (gp < 200) return "common";
	if (gp < 1265) return "uncommon";
	if (gp < 12650) return "rare";
	if (gp < 89000) return "very rare";
	return "legendary";
}

const add = (list, icon, label, value) => {
	if (value !== "" && value != null) list.push({ icon, label, value: String(value) });
};

function weaponProps(item, target, warnings) {
	const w = item.weapon;
	const native = is5e(item.sourceSystem) === is5e(target);
	const props = [...(w.properties || [])];
	const lower = props.map((p) => p.toLowerCase());
	const info = {};

	if (is5e(target)) {
		if (native) {
			info.props = props;
		} else {
			info.props = [];
			if (w.handedness === "light") info.props.push("Light");
			if (w.handedness === "two-handed") info.props.push("Two-Handed");
			if (/\breach\b/i.test(item.description)) info.props.push("Reach");
			const inc = parseInt(w.range, 10);
			if (inc) {
				if (w.melee) {
					const normal = Math.max(20, inc);
					info.props.push(`Thrown (Range ${normal}/${normal * (normal >= 30 ? 4 : 3)})`);
				} else info.props.push(`Ammunition (Range ${inc}/${inc * 4})`);
			}
			warnings.push("Weapon properties were inferred from 3.5/PF1 weapon categories and text (Light, Two-Handed, Reach, Thrown/Ammunition) — verify against 5e's property list (Finesse, Versatile, Heavy, Loading have no direct 3.5 equivalent).");
		}
		if (item.sourceSystem === "dnd5e2024" && target === "dnd5e2014" && w.mastery) warnings.push(`Mastery property "${w.mastery}" is a 2024 rule and was dropped for 2014.`);
	} else if (!native) {
		info.handedness = lower.includes("light") ? "light" : lower.includes("two-handed") ? "two-handed" : w.melee ? "one-handed" : "";
		info.special = props.filter((p) => !/^(light|two-handed|ammunition)/i.test(p)).map((p) => (p.startsWith("Versatile") ? "Versatile (may be used two-handed for bigger damage)" : p));
		warnings.push("5e weapon properties have no exact 3.5/PF1 counterpart; hand-use category was derived from Light/Two-Handed, and the remaining properties are listed under Special for review.");
	} else {
		info.handedness = w.handedness;
		info.special = props;
	}
	return info;
}

function convertWeapon(item, target, warnings) {
	const w = item.weapon;
	const native = is5e(item.sourceSystem) === is5e(target);
	const stats = [];
	const details = [];
	const info = weaponProps(item, target, warnings);
	const prof = is5e(target) && w.proficiency === "exotic" ? "martial" : w.proficiency;
	if (prof !== w.proficiency) warnings.push('Exotic weapons don\'t exist in 5e — treated as Martial.');

	add(stats, "💰", "Cost", formatGp(item.costGp) || item.costText || "—");
	add(stats, "⚖️", "Weight", item.weight != null ? `${item.weight} lb.` : "—");

	if (is5e(target)) {
		const type = (w.dmgType || "").split(/ or | and /i)[0];
		if (type !== w.dmgType && w.dmgType) warnings.push(`Damage type "${w.dmgType}" narrowed to ${type} (5e weapons have one type).`);
		add(stats, "🗡️", "Damage", [w.dmgM, cap(type.toLowerCase())].filter(Boolean).join(" "));
		if (!native && w.critical) warnings.push(`Critical range/multiplier (${w.critical}) has no 5e equivalent and was dropped.`);
		if (w.range && native) add(stats, "📏", "Range", `${w.range} ft.`);
		add(details, "📂", "Category", `${cap(prof)} ${w.melee ? "melee" : "ranged"}`);
		add(details, "🏷️", "Properties", (info.props || []).join(", "));
		if (target === "dnd5e2024") add(details, "🎓", "Mastery", w.mastery);
	} else {
		const dmgM = w.dmgM;
		const dmgS = w.dmgS || (native ? "" : STEP_DOWN[dmgM] || dmgM);
		if (!native && dmgS) warnings.push(`Small-creature damage (${dmgS}) derived from the Medium die using 3.5's damage-by-size steps.`);
		add(stats, "🗡️", "Damage (S / M)", dmgS ? `${dmgS} / ${dmgM}` : dmgM);
		const crit = w.critical || "x2";
		if (!native) warnings.push("Critical range/multiplier isn't part of 5e — defaulted to x2; adjust for the weapon type (e.g. 19–20/x2 for swords, x3 for axes).");
		add(stats, "🎯", "Critical", crit);
		const inc = parseInt(w.range, 10);
		if (inc) {
			add(stats, "📏", "Range Increment", `${inc} ft.`);
			if (!native) warnings.push("Range increment taken from the 5e normal range; 5e long range has no 3.5/PF1 equivalent.");
		}
		add(stats, "🏷️", "Type", cap((w.dmgType || "").toLowerCase()));
		add(details, "📂", "Category", `${cap(prof)}${info.handedness ? ` ${info.handedness}` : ""} ${w.melee ? "melee" : "ranged"}`.trim());
		add(details, "🏷️", "Special", (info.special || []).join(", "));
	}
	const subtitle = `${cap(prof)} ${w.melee ? "melee" : "ranged"} weapon`;
	return { stats, details, subtitle };
}

function convertArmor(item, target, warnings) {
	const a = item.armor;
	const native = is5e(item.sourceSystem) === is5e(target);
	const stats = [];
	const details = [];
	add(stats, "💰", "Cost", formatGp(item.costGp) || item.costText || "—");
	add(stats, "⚖️", "Weight", item.weight != null ? `${item.weight} lb.` : "—");
	const type = a.type || "light";

	if (is5e(target)) {
		let ac = a.ac;
		let dexCap = a.dexCap;
		let strength = a.strength;
		let stealth = a.stealthDisadvantage;
		if (!native) {
			const bonus = a.bonus ?? 0;
			ac = type === "shield" ? bonus : type === "light" ? 9 + bonus : 10 + bonus;
			dexCap = type === "medium" ? 2 : null;
			strength = type === "heavy" ? (bonus >= 6 ? 15 : 13) : null;
			stealth = type !== "shield" && (a.checkPenalty ?? 0) <= -4;
			warnings.push(`5e AC computed from the armor bonus (${formatMod(bonus)}); Dex cap, Strength requirement, and Stealth disadvantage follow 5e's category rules rather than 3.5's max Dex/check penalty — compare against a similar 5e armor.`);
		}
		const acText = type === "shield" ? `+${ac}` : type === "heavy" ? `${ac}` : `${ac} + Dex modifier${dexCap != null ? ` (max ${dexCap})` : ""}`;
		add(stats, "🛡️", type === "shield" ? "AC Bonus" : "Armor Class", acText);
		add(stats, "💪", "Strength", strength ? `Str ${strength}` : "—");
		add(stats, "🥷", "Stealth", stealth ? "Disadvantage" : "—");
		if (!native) warnings.push("Arcane spell failure and speed reductions have no 5e counterpart and were dropped.");
	} else {
		const d = LEGACY_ARMOR_DEFAULTS[type] || LEGACY_ARMOR_DEFAULTS.light;
		let bonus = a.bonus;
		let maxDex = a.dexCap;
		let check = a.checkPenalty;
		let spell = a.spellFailure;
		if (!native) {
			bonus = type === "shield" ? a.ac : Math.max(1, (a.ac ?? 10) - (type === "light" ? 9 : 10));
			maxDex = d.maxDex;
			check = d.check;
			spell = d.spell;
			warnings.push(`Armor bonus derived from 5e AC (${a.ac}); max Dex, armor check penalty, and arcane spell failure use typical ${type} armor values since 5e doesn't track them.`);
		}
		add(stats, "🛡️", type === "shield" ? "Shield Bonus" : "Armor Bonus", formatMod(bonus ?? 0));
		add(stats, "🤸", "Max Dex", maxDex != null ? formatMod(maxDex) : "—");
		add(stats, "⚠️", "Check Penalty", check != null ? String(check) : "—");
		add(stats, "🔮", "Spell Failure", spell != null ? `${spell}%` : "—");
		if (type === "medium" || type === "heavy") add(stats, "👟", "Speed", "20 ft. (30 ft. base)");
	}
	const subtitle = type === "shield" ? "Shield" : `${cap(type)} armor`;
	return { stats, details, subtitle };
}

function convertMagic(item, target, warnings) {
	const stats = [];
	const details = [];
	const native = is5e(item.sourceSystem) === is5e(target);
	let rarity = item.rarity;
	let gp = item.costGp;

	if (is5e(target)) {
		if (!rarity && gp != null) {
			rarity = rarityFromGp(gp);
			warnings.push(`Rarity (${cap(rarity)}) inferred from the market price (${formatGp(gp)}) using the 5e magic item value table — adjust by hand if the item's power suggests otherwise.`);
		}
		add(stats, "💎", "Rarity", cap(rarity) || "—");
		if (item.bonus) add(stats, "✨", "Bonus", item.bonus);
		add(stats, "🔗", "Attunement", item.attunement ? "Required" : "No");
		const tiered = !native && item.costText && /\(/.test(item.costText);
		if (tiered) add(details, "💰", "Price (source)", item.costText.replace(/\.$/, ""));
		else add(details, "💰", "Value", gp != null && !native ? formatGp(gp) : "");
		if (!native) warnings.push("Whether the item requires attunement isn't stated in 3.5/PF1 — defaulted to No; review by hand.");
	} else {
		if (gp == null && rarity && RARITY_GP[rarity]) {
			gp = RARITY_GP[rarity] / (CONSUMABLE.test(item.subtype) || CONSUMABLE.test(item.name) ? 2 : 1);
			warnings.push(`Price (${formatGp(gp)}) estimated from the 5e rarity (${cap(rarity)}); 3.5/PF1 prices depend on the exact effect, so treat it as a starting point.`);
		}
		add(stats, "💰", "Price", formatGp(gp) || item.costText || "—");
		if (item.bonus) add(stats, "✨", "Bonus", item.bonus);
		if (!native && item.attunement) warnings.push("Attunement doesn't exist in 3.5/PF1 and was dropped.");
		if (item.costText && /\(/.test(item.costText)) add(details, "💰", "Price (by bonus)", item.costText.replace(/\.$/, ""));
		add(details, "🔮", "Aura / Caster Level", item.meta?.aura ? item.meta.aura.replace(/;\s*(Price|Cost).*$/i, "") : "");
	}
	add(stats, "⚖️", "Weight", item.weight != null ? `${item.weight} lb.` : "");
	warnings.push("Magic item effects are carried over as written — bonuses, save DCs, spell references, and charges are not rebuilt for the target system.");
	const subtitle = [item.subtype, is5e(target) ? cap(rarity) + (item.attunement ? ` (${item.attunement})` : "") : ""].filter(Boolean).join(", ");
	return { stats, details, subtitle };
}

function convertGear(item, target, warnings) {
	const stats = [];
	add(stats, "💰", "Cost", formatGp(item.costGp) || item.costText || "—");
	add(stats, "⚖️", "Weight", item.weight != null ? `${item.weight} lb.` : "—");
	if (is5e(item.sourceSystem) !== is5e(target)) warnings.push("Mundane gear costs and weights carry across unchanged (both systems use gp and lb.); some items may have no counterpart in the target system.");
	return { stats, details: [], subtitle: item.subtype || "Adventuring gear" };
}

export function toItem(item, target) {
	const warnings = [];
	const fn = { weapon: convertWeapon, armor: convertArmor, magic: convertMagic, gear: convertGear }[item.category] || convertGear;
	const { stats, details, subtitle } = fn(item, target, warnings);
	return {
		context: {
			name: item.name,
			icon: ICONS[item.category] || "🎒",
			subtitle,
			stats,
			details,
			description: item.description,
		},
		warnings,
	};
}
