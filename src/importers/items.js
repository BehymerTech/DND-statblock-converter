// Item importers: turn each source's item data (5etools JSON, SRD markdown in
// three different shapes, or pasted text) into the canonical item record from
// itemSchema.js. Everything here is a pure string/JSON function so the browser
// (paste flow) and Node (data build, CLI) share it.

import { emptyItem } from "../itemSchema.js";
import { stripTags, clean } from "../util.js";

const DMG_TYPES = { B: "Bludgeoning", P: "Piercing", S: "Slashing", N: "Necrotic", R: "Radiant", F: "Fire", C: "Cold", L: "Lightning", A: "Acid", O: "Force", I: "Poison", Y: "Psychic", T: "Thunder" };
const PROPERTY_NAMES = { A: "Ammunition", AF: "Ammunition", BF: "Burst Fire", F: "Finesse", H: "Heavy", L: "Light", LD: "Loading", R: "Reach", RLD: "Reload", S: "Special", T: "Thrown", "2H": "Two-Handed", V: "Versatile", ER: "Extended Reach" };
const RARITY_LABELS = ["very rare", "uncommon", "legendary", "artifact", "common", "rare"];
const MAGIC_TYPE_LABELS = { P: "Potion", RG: "Ring", RD: "Rod", WD: "Wand", SC: "Scroll", SCF: "Spellcasting focus", M: "Weapon", R: "Weapon", A: "Ammunition", LA: "Light armor", MA: "Medium armor", HA: "Heavy armor", S: "Shield" };

export function toGp(amount, unit) {
	const n = Number(String(amount).replace(/,/g, ""));
	if (!Number.isFinite(n)) return null;
	return { gp: n, sp: n / 10, cp: n / 100, pp: n * 10 }[String(unit).toLowerCase()] ?? null;
}

/** "1,500 gp" / "5 SP" -> gold pieces (or null for "Varies", "—", ...). */
export function parseCost(text) {
	const m = String(text || "").match(/([\d,]+(?:\.\d+)?)\s*(gp|sp|cp|pp)\b/i);
	return m ? toGp(m[1], m[2]) : null;
}

function titleCaseWords(s) {
	return String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ---- 5etools (5e 2014) ----

function flattenEntries(entries) {
	const out = [];
	const walk = (e) => {
		if (e == null) return;
		if (typeof e === "string") out.push(stripTags(e));
		else if (Array.isArray(e)) e.forEach(walk);
		else if (e.type === "list") (e.items || []).forEach((it) => out.push(`- ${flattenEntries(typeof it === "string" ? [it] : it.entries || [it.entry || ""]).join(" ")}`));
		else if (e.type === "table") out.push(`(${e.caption || "table"} — see source for the full table)`);
		else if (e.entries) {
			const inner = flattenEntries(e.entries);
			if (e.name && inner.length) inner[0] = `**${e.name}.** ${inner[0]}`;
			out.push(...inner);
		} else if (e.entry) out.push(stripTags(e.entry));
	};
	walk(entries);
	return out;
}

export function fromFiveToolsItem(it) {
	const item = emptyItem();
	item.sourceSystem = "dnd5e2014";
	item.name = it.name;
	item.costGp = it.value != null ? it.value / 100 : null;
	item.weight = it.weight ?? null;
	item.description = flattenEntries(it.entries).join("\n\n");
	const type = String(it.type || "").split("|")[0];
	const rarity = it.rarity && !["none", "unknown", "unknown (magic)", "varies"].includes(it.rarity) ? it.rarity : "";
	const isWeapon = it.weapon || type === "M" || type === "R";
	const isArmor = ["LA", "MA", "HA", "S"].includes(type);

	if (isWeapon) {
		const w = item.weapon;
		w.proficiency = it.weaponCategory || "";
		w.melee = type !== "R";
		w.dmgM = it.dmg1 || "";
		w.dmgType = DMG_TYPES[it.dmgType] || "";
		w.versatile = it.dmg2 || "";
		w.range = it.range || "";
		w.properties = (it.property || []).map((p) => PROPERTY_NAMES[String(typeof p === "string" ? p : p.uid).split("|")[0]]).filter(Boolean);
	}
	if (isArmor) {
		const a = item.armor;
		a.type = { LA: "light", MA: "medium", HA: "heavy", S: "shield" }[type];
		a.ac = it.ac ?? null;
		a.dexCap = a.type === "medium" ? 2 : null;
		a.strength = it.strength ? Number(it.strength) : null;
		a.stealthDisadvantage = Boolean(it.stealth);
	}
	if (rarity) {
		item.category = "magic";
		item.rarity = rarity;
		item.attunement = it.reqAttune ? (typeof it.reqAttune === "string" ? `Requires attunement ${it.reqAttune}` : "Requires attunement") : "";
		item.bonus = it.bonusWeapon || it.bonusAc || "";
		item.subtype = it.wondrous ? "Wondrous item" : MAGIC_TYPE_LABELS[type] || "";
	} else if (isWeapon) {
		item.category = "weapon";
		item.subtype = [titleCaseWords(item.weapon.proficiency), item.weapon.melee ? "melee" : "ranged", "weapon"].filter(Boolean).join(" ");
	} else if (isArmor) {
		item.category = "armor";
		item.subtype = item.armor.type === "shield" ? "Shield" : `${titleCaseWords(item.armor.type)} armor`;
	} else {
		item.category = "gear";
	}
	return item;
}

// ---- 5e 2024 SRD markdown ----

function htmlTableRows(html) {
	return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => ({
		header: /<th colspan/.test(m[1]),
		cells: [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => clean(c[1].replace(/<[^>]+>/g, ""))),
	}));
}

function tableToText(html) {
	return htmlTableRows(html).map((r) => r.cells.join(" / ")).join("\n");
}

function sectionOf(text, heading) {
	const start = text.indexOf(`\n## ${heading}`);
	if (start === -1) return "";
	const end = text.indexOf("\n## ", start + 4);
	return text.slice(start, end === -1 ? undefined : end);
}

function parseRange(props) {
	const m = String(props).match(/Range\s*([\d/]+)/i);
	return m ? m[1] : "";
}

export function parseDnd5e2024Equipment(text) {
	const items = [];
	const mk = (name) => {
		const it = emptyItem();
		it.sourceSystem = "dnd5e2024";
		it.name = name;
		return it;
	};

	const weaponsHtml = (sectionOf(text, "Weapons").match(/<table>[\s\S]*?<\/table>/) || [""])[0];
	let group = "";
	for (const row of htmlTableRows(weaponsHtml)) {
		if (row.header) {
			group = row.cells[0];
			continue;
		}
		if (row.cells.length < 6 || row.cells[0] === "Name") continue;
		const [name, damage, props, mastery, weight, cost] = row.cells;
		const it = mk(name);
		it.category = "weapon";
		const dm = damage.match(/^(\S+)\s+(.+)$/);
		Object.assign(it.weapon, {
			proficiency: /simple/i.test(group) ? "simple" : "martial",
			melee: /melee/i.test(group),
			dmgM: dm ? dm[1] : "",
			dmgType: dm ? dm[2] : "",
			versatile: (props.match(/Versatile \(([^)]+)\)/) || [])[1] || "",
			range: parseRange(props),
			properties: props === "—" ? [] : props.split(/,\s*(?![^(]*\))/).map(clean),
			mastery: mastery === "—" ? "" : mastery,
		});
		it.weight = parseFloat(weight) || null;
		it.costGp = parseCost(cost);
		it.subtype = group.replace(/ Weapons$/, " weapon").replace(/^(\w+) (\w+) weapon$/, (_, a, b) => `${a} ${b.toLowerCase()} weapon`);
		items.push(it);
	}

	const armorHtml = (sectionOf(text, "Armor").match(/<table>[\s\S]*?<\/table>/) || [""])[0];
	for (const row of htmlTableRows(armorHtml)) {
		if (row.header) {
			group = row.cells[0];
			continue;
		}
		if (row.cells.length < 6 || row.cells[0] === "Armor") continue;
		const [name, ac, strength, stealth, weight, cost] = row.cells;
		const it = mk(name);
		it.category = "armor";
		const type = /light/i.test(group) ? "light" : /medium/i.test(group) ? "medium" : /heavy/i.test(group) ? "heavy" : "shield";
		Object.assign(it.armor, {
			type,
			ac: parseInt(ac.replace(/^\+/, ""), 10) || null,
			dexCap: (ac.match(/max (\d)/i) || [])[1] ? Number(ac.match(/max (\d)/i)[1]) : null,
			strength: /\d+/.test(strength) ? Number(strength.match(/\d+/)[0]) : null,
			stealthDisadvantage: /disadvantage/i.test(stealth),
		});
		it.weight = parseFloat(weight) || null;
		it.costGp = parseCost(cost);
		it.subtype = type === "shield" ? "Shield" : `${type[0].toUpperCase() + type.slice(1)} armor`;
		items.push(it);
	}

	for (const heading of ["Tools", "Adventuring Gear"]) {
		const section = sectionOf(text, heading);
		for (const block of section.split(/\n#### /).slice(1)) {
			const nl = block.indexOf("\n");
			const title = clean(block.slice(0, nl));
			const m = title.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
			const it = mk(m ? m[1] : title);
			it.category = "gear";
			it.costGp = m ? parseCost(m[2]) : null;
			it.costText = m && it.costGp == null ? m[2] : "";
			it.description = block
				.slice(nl)
				.replace(/<table>[\s\S]*?<\/table>/g, (t) => tableToText(t))
				.replace(/\n{3,}/g, "\n\n")
				.trim();
			items.push(it);
		}
	}
	return items;
}

export function parseDnd5e2024MagicItems(text) {
	const items = [];
	for (const block of text.split(/\n#### /).slice(1)) {
		const nl = block.indexOf("\n");
		const name = clean(block.slice(0, nl));
		const rest = block.slice(nl).trim();
		const head = rest.match(/^_([^\n]+)_/);
		if (!head || !/(common|uncommon|rare|legendary|artifact|varies)/i.test(head[1])) continue;
		const it = emptyItem();
		it.sourceSystem = "dnd5e2024";
		it.name = name;
		it.category = "magic";
		const attune = head[1].match(/\(([^)]*attunement[^)]*)\)/i);
		it.attunement = attune ? attune[1] : "";
		const noAttune = head[1].replace(/\s*\([^)]*attunement[^)]*\)/i, "");
		const rarityMatch = RARITY_LABELS.find((r) => noAttune.toLowerCase().includes(r));
		it.rarity = rarityMatch || "";
		it.subtype = clean(noAttune.split(/,\s*(?=[^,]*$)/)[0]);
		it.bonus = (name.match(/[+]\d/) || [""])[0];
		it.description = rest
			.slice(head[0].length)
			.replace(/<table>[\s\S]*?<\/table>/g, (t) => tableToText(t))
			.replace(/\n{3,}/g, "\n\n")
			.trim();
		items.push(it);
	}
	return items;
}

// ---- 3.5 SRD markdown ----

function squash(s) {
	return String(s).toLowerCase().replace(/[^a-z]/g, "");
}

/** Reassemble a pandoc grid table (cells wrapped across lines) into rows of cell strings. */
function parseGridTables(text) {
	const lines = text.split("\n");
	const tables = [];
	let cur = null;
	lines.forEach((l, i) => {
		if (/^[+|]/.test(l)) {
			if (!cur) {
				cur = { start: i, lines: [] };
				tables.push(cur);
			}
			cur.lines.push(l);
		} else cur = null;
	});
	return tables.map((t) => {
		const rows = [];
		let row = null;
		for (const l of t.lines) {
			if (/^\+[-=+:]+\+$/.test(l)) {
				if (row) rows.push(row);
				row = null;
				continue;
			}
			const cells = l.slice(1, -1).split("|").map((s) => s.replace(/\s+$/, "").replace(/^ /, ""));
			if (!row) row = cells.map(() => []);
			cells.forEach((c, k) => row[k]?.push(c));
		}
		if (row) rows.push(row);
		return { start: t.start, rows: rows.map((r) => r.map((c) => c.join(""))) };
	});
}

/** ### headings -> paragraph text, keyed by squashed name. */
function headingBodies(text) {
	const map = new Map();
	const names = new Map();
	for (const block of text.split(/\n### /).slice(1)) {
		const nl = block.indexOf("\n");
		const name = clean(block.slice(0, nl));
		const body = block.slice(nl).split(/\n#{1,2} /)[0];
		const paras = body.split(/\n\s*\n/).map((p) => clean(p)).filter((p) => p && !/^[+|:\s-]/.test(p) && !/^\*\*.*\*\*$/.test(p) && !/^\d+ /.test(p));
		map.set(squash(name), paras.join("\n\n"));
		names.set(squash(name), name);
	}
	return { map, names };
}

function findBody(bodies, name) {
	const key = squash(name);
	if (bodies.map.has(key)) return { name: bodies.names.get(key), text: bodies.map.get(key) };
	for (const [k, v] of bodies.map) if (key.startsWith(k) && k.length > 3) return { name: null, text: v };
	return { name: null, text: "" };
}

function fixSpacing(name) {
	return name
		.replace(/,(?=\S)/g, ", ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/repeating(heavy|light)/i, (_, w) => `repeating ${w}`)
		.replace(/^Spikedshield/i, "Spiked shield")
		.replace(/^Unarmedstrike/i, "Unarmed strike");
}

function cleanDamageType(raw) {
	const found = [...String(raw).matchAll(/Bludgeoning|Piercing|Slashing/gi)].map((m) => titleCaseWords(m[0].toLowerCase()));
	if (!found.length) return clean(raw);
	const joiner = /and/i.test(raw.replace(/bludgeoning|piercing|slashing/gi, "")) ? " and " : " or ";
	return found.join(joiner === " and " ? " and " : " or ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

export function parseDnd35Equipment(text) {
	const items = [];
	const mk = (name) => {
		const it = emptyItem();
		it.sourceSystem = "dnd35";
		it.name = name;
		return it;
	};
	const descs = headingBodies(text);
	const tables = parseGridTables(text);

	// Weapons: the first big grid table.
	const wt = tables.find((t) => t.rows.length > 50 && /Cost/.test(t.rows[0].join(" ")));
	if (wt) {
		let prof = "simple";
		let hand = "";
		for (const row of wt.rows.slice(1)) {
			const [label, cost, dmgS, dmgM, crit, , range, weight, type] = row;
			const isSection = !cost && !dmgS && !dmgM;
			if (isSection) {
				const s = squash(label);
				if (/ranged/.test(s)) hand = "ranged";
				else if (/twohanded/.test(s)) hand = "two-handed";
				else if (/onehanded/.test(s)) hand = "one-handed";
				else if (/light/.test(s)) hand = "light";
				else if (/unarmed/.test(s)) hand = "unarmed";
				continue;
			}
			let name = label.replace(/:{3,}\s*\{[^}]*\}/g, "").replace(/:{3,}/g, "").replace(/\^\d+\^/g, "").replace(/(\S)\(/g, "$1 (");
			if (!name) continue;
			const tierRow = squash(name).match(/^(simple|martial|exotic)weapons$/);
			if (tierRow) {
				prof = tierRow[1];
				continue;
			}
			const body = findBody(descs, name);
			name = body.name || fixSpacing(name);
			const it = mk(name);
			it.category = "weapon";
			Object.assign(it.weapon, {
				proficiency: prof,
				melee: hand !== "ranged",
				handedness: hand === "ranged" || hand === "unarmed" ? "" : hand,
				dmgS: dmgS.replace(/\^\d+\^/g, ""),
				dmgM: dmgM.replace(/\^\d+\^/g, ""),
				dmgType: cleanDamageType(type),
				critical: crit.replace(/--/g, "–"),
				range: /^-+$/.test(range) ? "" : range.replace(/ft\./, " ft."),
			});
			it.costGp = parseCost(cost);
			it.weight = parseFloat(weight) || null;
			it.subtype = `${titleCaseWords(prof)} ${hand === "ranged" ? "ranged" : hand || "melee"} weapon`.trim();
			it.description = body.text;
			items.push(it);
		}
	}

	// Armor: a plain-text table (one row per line, some names wrapped onto the next line).
	const armorStart = text.search(/\n {2}Armor\s+Cost\s+Armor\/Shield/);
	const armorLines = armorStart === -1 ? [] : text.slice(armorStart, text.indexOf("### Armor Descriptions")).split("\n");
	let type = "light";
	for (let i = 0; i < armorLines.length; i += 1) {
		const line = armorLines[i];
		const sect = line.match(/^ {2}(Light armor|Medium armor|Heavy armor|Shields)\s*$/);
		if (sect) {
			type = sect[1].toLowerCase().startsWith("shield") ? "shield" : sect[1].split(" ")[0].toLowerCase();
			continue;
		}
		const m = line.match(/^ {2}(\S.*?)\s{2,}([\d,]+)(?:\s*gp)?\s+\+(\d+)\s+(\+\d+|-+)\s+(-+\d+|0)\s+(\d+)%/);
		if (!m) continue;
		let name = m[1];
		let costTail = "";
		const next = armorLines[i + 1] || "";
		const cont = next.match(/^ {2}(\S.*?)\s*$/);
		if (cont && !/\d/.test(cont[1]) && !/armor$|^Shields$/i.test(cont[1])) name += ` ${cont[1]}`;
		costTail = " gp";
		const weight = line.match(/(\d+)\s*lb\./) || (armorLines[i + 1] || "").match(/(\d+)\s*lb\./);
		const it = mk(titleCaseWords(name.replace(/ (mail|plate|leather|shirt)/g, (s) => s)));
		it.name = it.name.replace(/\b(Mail|Plate|Leather|Shirt)\b/g, (s) => s.toLowerCase());
		it.name = name.charAt(0).toUpperCase() + name.slice(1);
		it.category = "armor";
		Object.assign(it.armor, {
			type,
			bonus: Number(m[3]),
			dexCap: /\d/.test(m[4]) ? Number(m[4].replace("+", "")) : null,
			checkPenalty: -Math.abs(Number(m[5].replace(/-/g, ""))),
			spellFailure: Number(m[6]),
		});
		it.costGp = parseCost(`${m[2]}${costTail}`);
		it.weight = weight ? Number(weight[1]) : null;
		it.subtype = type === "shield" ? "Shield" : `${titleCaseWords(type)} armor`;
		it.description = findBody(descs, name).text;
		items.push(it);
	}

	// Goods and services: the second big grid table (Item | Cost | Weight).
	const gt = tables.find((t) => t.rows.some((r) => r[0] === "Item" && r[1] === "Cost"));
	if (gt) {
		let section = "";
		for (const row of gt.rows) {
			const [name, cost, weight] = row;
			if (!name || name === "Item") continue;
			if (!cost && !weight) {
				section = name;
				continue;
			}
			if (/^-+$/.test(cost) || !parseCost(cost)) continue;
			const it = mk(name.replace(/\^\d+\^/g, ""));
			it.category = "gear";
			it.subtype = section;
			it.costGp = parseCost(cost);
			it.weight = parseFloat(weight) || null;
			it.description = findBody(descs, it.name.replace(/\s*\(.*\)$/, "")).text;
			items.push(it);
		}
	}
	return items;
}

const MAGIC_PREFIXES = { ring: "Ring of ", rod: "Rod of ", staff: "Staff of ", wand: "Wand of ", potion: "Potion of " };

export function parseDnd35MagicItems(text, group) {
	const items = [];
	// Two layouts: "### Name" / "#### Name:" headings (armor, weapons, wondrous items) and, for rings, rods,
	// staffs, wands and potions, "**Name:** description" paragraphs under a "## Ring Descriptions" style heading.
	let prefix = "";
	const boldBlocks = [];
	for (const chunk of text.split(/\n(?=## )/)) {
		const h = chunk.match(/^## (\w+) Descriptions/i) || chunk.match(/^## (Potion)s? and Oils/i);
		if (!h) continue;
		prefix = MAGIC_PREFIXES[h[1].toLowerCase()] || "";
		for (const para of chunk.split(/\n(?=\*\*[^*\n]+:\*\*)/).slice(1)) boldBlocks.push({ prefix, para });
	}
	for (const { prefix: pre, para } of boldBlocks) {
		const m = para.match(/^\*\*([^*\n]+):\*\*\s*([\s\S]*)$/);
		if (!m) continue;
		const info = m[2].match(/(?:^|\n)((?:Faint|Moderate|Strong|Overwhelming)[^\n]*(?:\n[^\n]+)*?Price[^\n]*)/i);
		if (!info) continue;
		const priceMatch = info[1].match(/Price\s+([^;]+?)(?:;|\.?\s*Cost|$)/i);
		const it = emptyItem();
		it.sourceSystem = "dnd35";
		it.name = /^(ring|rod|staff|wand|potion|oil)\b/i.test(m[1]) ? m[1] : `${pre}${m[1]}`;
		it.category = "magic";
		it.subtype = group;
		it.costText = priceMatch ? clean(priceMatch[1]) : "";
		it.costGp = priceMatch ? parseCost(priceMatch[1]) : null;
		it.description = m[2].replace(info[1], "").split(/\n\s*\n/).map((p) => clean(p)).filter(Boolean).join("\n\n");
		it.meta.aura = clean(info[1]);
		items.push(it);
	}
	for (const block of text.split(/\n#{3,4} /).slice(1)) {
		const nl = block.indexOf("\n");
		const name = clean(block.slice(0, nl)).replace(/:$/, "");
		const body = block.slice(nl).split(/\n#{1,4} /)[0].trim();
		const info = body.match(/(?:^|\n)((?:Faint|Moderate|Strong|Overwhelming)[^\n]*(?:\n[^\n]+)*?(?:Price|Cost)[^\n]*)/i) || body.match(/(?:^|\n)([^\n]*\bCL \d+\w*[^\n]*)/);
		if (!info) continue;
		const priceMatch = info[1].match(/Price\s+([^;]+?)(?:;|\.?\s*Cost|$)/i);
		const it = emptyItem();
		it.sourceSystem = "dnd35";
		it.name = name;
		it.category = "magic";
		it.subtype = group;
		it.costText = priceMatch ? clean(priceMatch[1]) : "";
		it.costGp = priceMatch ? parseCost(priceMatch[1]) : null;
		it.bonus = (it.costText.match(/\((\+\d)\)/) || [""])[0].replace(/[()]/g, "");
		it.description = clean(body.replace(info[1], "").replace(/\n\s*\n/g, "\n\n")).length
			? body.replace(info[1], "").split(/\n\s*\n/).map((p) => clean(p)).filter(Boolean).join("\n\n")
			: "";
		it.meta.aura = clean(info[1]);
		items.push(it);
	}
	return items;
}

// ---- Pasted text (all systems) ----

const LABELS = [
	[/^(?:cost|price|market price)\b[:.]?\s*(.*)$/i, "cost"],
	[/^weight\b[:.]?\s*(.*)$/i, "weight"],
	[/^(?:dmg|damage)\s*\(?s\)?\b[:.]?\s*(.*)$/i, "dmgS"],
	[/^(?:dmg|damage)\s*\(?m\)?\b[:.]?\s*(.*)$/i, "dmgM"],
	[/^(?:dmg|damage)\b[:.]?\s*(.*)$/i, "damage"],
	[/^crit(?:ical)?\b[:.]?\s*(.*)$/i, "critical"],
	[/^range(?: increment)?\b[:.]?\s*(.*)$/i, "range"],
	[/^(?:damage )?type\b[:.]?\s*(.*)$/i, "dmgType"],
	[/^properties\b[:.]?\s*(.*)$/i, "properties"],
	[/^mastery\b[:.]?\s*(.*)$/i, "mastery"],
	[/^(?:armor(?:\/shield)? bonus|shield bonus)\b[:.]?\s*\+?(\d+)/i, "bonus"],
	[/^(?:armor class|ac)\b[:.]?\s*(.*)$/i, "ac"],
	[/^max(?:imum)?\.? dex(?:terity)?(?: bonus)?\b[:.]?\s*(.*)$/i, "maxDex"],
	[/^armor check penalty\b[:.]?\s*(.*)$/i, "acp"],
	[/^arcane spell failure(?: chance)?\b[:.]?\s*(.*)$/i, "asf"],
	[/^strength\b[:.]?\s*(.*)$/i, "strength"],
	[/^stealth\b[:.]?\s*(.*)$/i, "stealth"],
	[/^rarity\b[:.]?\s*(.*)$/i, "rarity"],
	[/^attunement\b[:.]?\s*(.*)$/i, "attunement"],
	[/^category\b[:.]?\s*(.*)$/i, "categoryText"],
];

export function parseItemText(rawText) {
	const item = emptyItem();
	const lines = String(rawText).split("\n").map((l) => clean(l.replace(/\*\*|^#+\s*/g, "").replace(/^_|_$/g, ""))).filter(Boolean);
	item.name = lines.shift() || "Unnamed Item";
	const found = {};
	const desc = [];
	let subtypeLine = "";
	for (const line of lines) {
		let matched = false;
		for (const [re, key] of LABELS) {
			const m = line.match(re);
			if (m) {
				found[key] = clean(m[1]);
				matched = true;
				break;
			}
		}
		if (matched) continue;
		if (!subtypeLine && desc.length === 0 && /(common|uncommon|rare|legendary|artifact|wondrous|weapon|armor|potion|ring|rod|staff|wand|scroll)/i.test(line) && line.length < 90) subtypeLine = line;
		else desc.push(line);
	}

	item.costGp = parseCost(found.cost);
	item.costText = found.cost && !/^[\d,.]+\s*(gp|sp|cp|pp)$/i.test(found.cost) ? found.cost : "";
	item.weight = found.weight ? parseFloat(found.weight) || null : null;
	item.description = desc.join("\n\n");
	item.subtype = subtypeLine.replace(/,?\s*(very rare|uncommon|legendary|artifact|common|rare)\b.*$/i, "").replace(/,\s*$/, "") || found.categoryText || "";
	const rareText = found.rarity || subtypeLine;
	item.rarity = RARITY_LABELS.find((r) => rareText.toLowerCase().includes(r)) || "";
	const attune = (subtypeLine.match(/\(([^)]*attunement[^)]*)\)/i) || [])[1];
	item.attunement = found.attunement || attune || "";
	item.bonus = (item.name.match(/[+]\d/) || [""])[0];

	const dmg = found.damage || "";
	const dm = dmg.match(/^(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*(.*)$/i);
	const w = item.weapon;
	w.dmgM = found.dmgM || (dm ? dm[1] : "");
	w.dmgS = found.dmgS || "";
	w.dmgType = found.dmgType || (dm ? clean(dm[2]) : "");
	w.versatile = ((found.properties || "").match(/Versatile \(([^)]+)\)/i) || [])[1] || "";
	w.critical = (found.critical || "").replace(/--/g, "–");
	w.range = found.range || "";
	w.mastery = found.mastery || "";
	w.properties = found.properties ? found.properties.split(/,\s*(?![^(]*\))/).map(clean) : [];
	w.proficiency = (/(simple|martial|exotic)/i.exec(`${found.categoryText || ""} ${item.subtype}`) || [""])[0].toLowerCase();
	w.melee = !/ranged/i.test(`${found.categoryText || ""} ${item.subtype}`);
	w.handedness = (/(light|one-handed|two-handed)/i.exec(found.categoryText || "") || [""])[0].toLowerCase();

	const a = item.armor;
	const acNum = found.ac ? parseInt(found.ac.replace(/^\+/, ""), 10) : null;
	a.ac = Number.isFinite(acNum) ? acNum : null;
	a.bonus = found.bonus ? Number(found.bonus) : null;
	a.dexCap = found.maxDex && /\d/.test(found.maxDex) ? Number(found.maxDex.replace(/[^\d]/g, "")) : found.ac && /max (\d)/i.test(found.ac) ? Number(found.ac.match(/max (\d)/i)[1]) : null;
	a.checkPenalty = found.acp && /\d/.test(found.acp) ? -Math.abs(parseInt(found.acp.replace(/[–—-]/g, ""), 10)) : null;
	a.spellFailure = found.asf ? parseInt(found.asf, 10) || null : null;
	a.strength = found.strength && /\d/.test(found.strength) ? Number(found.strength.match(/\d+/)[0]) : null;
	a.stealthDisadvantage = /disadvantage/i.test(found.stealth || "");
	a.type = (/(light|medium|heavy|shield)/i.exec(`${found.categoryText || ""} ${item.subtype}`) || [""])[0].toLowerCase();

	if (w.dmgM || w.dmgS) item.category = "weapon";
	else if (a.ac != null || a.bonus != null || /armor|shield/i.test(item.subtype)) item.category = "armor";
	else if (item.rarity || /wondrous|potion|ring|rod|staff|wand|scroll/i.test(item.subtype) || /\bCL \d/.test(rawText)) item.category = "magic";
	else item.category = "gear";
	return item;
}
