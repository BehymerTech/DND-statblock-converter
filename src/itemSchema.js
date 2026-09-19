// Canonical item shape — the item-side counterpart of schema.js. Weapons, armor,
// mundane gear, and magic items all share one record; the category-specific
// blocks (weapon / armor) are only filled in for the matching category.

export const ITEM_CATEGORIES = ["weapon", "armor", "gear", "magic"];

/** @returns {object} an empty item record with every field present. */
export function emptyItem() {
	return {
		kind: "item",
		name: "",
		sourceSystem: "", // dnd35 | pf1 | dnd5e2014 | dnd5e2024
		category: "gear", // weapon | armor | gear | magic
		subtype: "", // free text: "Martial melee weapon", "Wondrous item", "Light armor", ...

		costGp: null, // numeric, in gold pieces (fractions for sp/cp); null when unpriced/"varies"
		costText: "", // original wording, kept when it can't be reduced to one number ("4,000 gp (+2), 16,000 gp (+4)")
		weight: null, // pounds

		rarity: "", // 5e-style: common | uncommon | rare | very rare | legendary | artifact
		attunement: "", // 5e attunement requirement text, "" when none
		bonus: "", // "+1" style enhancement, where it's a single number

		weapon: {
			proficiency: "", // simple | martial | exotic
			melee: true,
			handedness: "", // 3.5: light | one-handed | two-handed
			dmgS: "", // 3.5 small-creature damage
			dmgM: "", // damage dice for a Medium wielder (5e's only damage die)
			dmgType: "", // Bludgeoning / Piercing / Slashing
			versatile: "", // 5e versatile dice, e.g. "1d10"
			critical: "", // 3.5/PF1 "19-20/x2"
			range: "", // 5e "80/320", or 3.5/PF1 range increment "100 ft."
			properties: [],
			mastery: "", // 2024 only
		},

		armor: {
			type: "", // light | medium | heavy | shield
			ac: null, // 5e base AC (or shield bonus)
			dexCap: null, // 5e/3.5: max Dex bonus to AC, null = uncapped
			bonus: null, // 3.5/PF1 armor/shield bonus
			checkPenalty: null,
			spellFailure: null, // percent
			strength: null, // 5e minimum Strength
			stealthDisadvantage: false,
		},

		description: "",
		meta: {},
	};
}
