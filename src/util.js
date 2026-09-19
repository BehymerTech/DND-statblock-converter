// Shared, dependency-free helpers used by every importer/exporter.
// Pure functions only — no DOM, no Node built-ins — so this file loads
// unmodified in the browser (as an ES module) and under Node (CLI/build script).

export const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

const SIZE_HIT_DIE = {
	Tiny: 4,
	Small: 6,
	Medium: 8,
	Large: 10,
	Huge: 12,
	Gargantuan: 20,
};

// 5e challenge rating -> proficiency bonus (DMG table), also used as a
// reasonable stand-in when converting a monster whose original system
// doesn't have an explicit proficiency bonus concept (3.5/PF1 BAB-based math).
const CR_PROFICIENCY = [
	[0, 2], [1 / 8, 2], [1 / 4, 2], [1 / 2, 2],
	[1, 2], [2, 2], [3, 2], [4, 2],
	[5, 3], [6, 3], [7, 3], [8, 3],
	[9, 4], [10, 4], [11, 4], [12, 4],
	[13, 5], [14, 5], [15, 5], [16, 5],
	[17, 6], [18, 6], [19, 6], [20, 6],
	[21, 7], [22, 7], [23, 7], [24, 7],
	[25, 8], [26, 8], [27, 8], [28, 8],
	[29, 9], [30, 9],
];

/** Parse a CR string ("1/4", "1/2", "5", "½") into a number. */
export function crToNumber(cr) {
	if (cr == null) return 0;
	if (typeof cr === "number") return cr;
	const s = String(cr).trim().replace("½", "1/2").replace("¼", "1/4").replace("⅛", "1/8");
	if (s.includes("/")) {
		const [n, d] = s.split("/").map(Number);
		return n / d;
	}
	const n = parseFloat(s);
	return Number.isFinite(n) ? n : 0;
}

const VALID_5E_CRS = [0, 1 / 8, 1 / 4, 1 / 2, ...Array.from({ length: 30 }, (_, i) => i + 1)];
const CR_LABELS = { 0: "0", [1 / 8]: "1/8", [1 / 4]: "1/4", [1 / 2]: "1/2" };

/** Snap an arbitrary CR number (e.g. Pathfinder's 1/3, which 5e has no slot for) to the nearest valid 5e CR. */
export function numberToCrString(n) {
	if (n <= 0) return "0";
	let best = VALID_5E_CRS[0];
	for (const candidate of VALID_5E_CRS) {
		if (Math.abs(candidate - n) < Math.abs(best - n)) best = candidate;
	}
	return CR_LABELS[best] ?? String(best);
}

/** 5e-style proficiency bonus for a given CR (also reused as a level-scaling proxy for other systems). */
export function proficiencyForCr(cr) {
	const n = crToNumber(cr);
	let best = 2;
	for (const [threshold, bonus] of CR_PROFICIENCY) {
		if (n >= threshold) best = bonus;
	}
	return best;
}

export function abilityMod(score) {
	if (score == null || Number.isNaN(score)) return 0;
	return Math.floor((score - 10) / 2);
}

export function formatMod(mod) {
	return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function hitDieForSize(size) {
	return SIZE_HIT_DIE[size] || 8;
}

/** Average hp for `count` dice of `die` sides plus a flat modifier per die (e.g. Constitution mod). */
export function averageHp(count, die, perDieMod) {
	const avgDie = Math.floor((die + 1) / 2);
	return Math.max(1, count * avgDie + count * perDieMod);
}

/** Very small CR estimator from a monster's defensive/offensive numbers, used when re-deriving CR isn't provided by the source. */
export function estimateCrFromHpAndAc() {
	// Deliberately not implemented with DMG precision — conversions carry the
	// source CR forward whenever one is available instead of re-deriving it.
	return null;
}

const ATK_LABELS = {
	mw: "Melee Weapon Attack:",
	rw: "Ranged Weapon Attack:",
	"mw,rw": "Melee or Ranged Weapon Attack:",
	"rw,mw": "Melee or Ranged Weapon Attack:",
	ms: "Melee Spell Attack:",
	rs: "Ranged Spell Attack:",
};

/**
 * Render 5etools-style {@tag ...} markup down to plain prose. Most tags
 * ({@item x|book}, {@spell x|book}, {@condition x}, ...) just want their
 * first pipe-separated field; a handful used inside attack/damage lines
 * ({@atk}, {@hit}, {@h}, {@dc}) render to the words a printed stat block
 * actually uses instead.
 */
export function stripTags(str) {
	if (!str) return str;
	return String(str).replace(/\{@(\w+)(?: ([^}]*))?\}/g, (_, tag, inner = "") => {
		const first = inner.split("|")[0];
		switch (tag) {
			case "atk":
				return ATK_LABELS[first] || ATK_LABELS[first.split(",").sort().join(",")] || "Attack:";
			case "hit":
				return formatMod(Number(first));
			case "h":
				return "Hit: ";
			case "dc":
				return `DC ${first}`;
			case "damage":
			case "scaledamage":
			case "d20":
				return first;
			default:
				return first;
		}
	});
}

export function titleCase(str) {
	return String(str).replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

/** Collapse repeated whitespace and trim — used after pulling text out of markdown/HTML. */
export function clean(str) {
	return String(str ?? "").replace(/\s+/g, " ").trim();
}

const ENTITIES = {
	amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
	ndash: "–", mdash: "—", minus: "-", hellip: "…", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"',
	times: "×", middot: "·", bull: "•",
};

/**
 * Clean pasted stat block text of markup left over from web/VTT exports: line-break and block tags
 * become spaces, other HTML tags are dropped, HTML entities (&emsp;, &amp;, &#8212;) are decoded, and
 * 5etools {@tags} are flattened. Deliberately leaves markdown (**bold**, _italic_) alone — importers handle it.
 */
export function cleanMarkup(text) {
	if (!text) return text;
	return stripTags(String(text))
		.replace(/<\s*(?:br|\/?p|\/?div|\/?li|\/?ul|\/?ol|\/?tr|hr)\b[^>]*>/gi, " ")
		.replace(/<\/?[a-z][^>]*>/gi, "")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
		.replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
		.replace(/[ \t\u00a0\u2002\u2003]+/g, " ")
		.replace(/ *\n */g, "\n");
}
