#!/usr/bin/env node
// Regenerates /data (the small, committed JSON the live site searches and
// converts from) out of the cloned SRD repos and the 5etools bundle. Run
// this after re-cloning the SRD repos referenced in the README, or after
// updating the importer logic in src/importers/.
//
// Usage: cd tools && npm install && node build-data.mjs

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

import { fromFiveToolsJson } from "../src/importers/dnd5e2014Json.js";
import { parseDnd5e2024Markdown } from "../src/importers/dnd5e2024Md.js";
import { parseDnd35CompendiumFile } from "../src/importers/dnd35.js";
import { extractStatblockYamlSource, parsePf1Yaml, parsePf2Yaml } from "../src/importers/pf.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRD = join(ROOT, "srd-data");
const FIVETOOLS = join(ROOT, "5etools-v2.35.1");
const DATA = join(ROOT, "data");

function slugify(name) {
	return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unnamed";
}

function walk(dir, exts, ignoreDirs = new Set()) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const entry of readdirSync(dir)) {
		if (entry === ".git" || entry === ".obsidian" || entry === ".github" || ignoreDirs.has(entry)) continue;
		const full = join(dir, entry);
		const st = statSync(full);
		if (st.isDirectory()) out.push(...walk(full, exts, ignoreDirs));
		else if (exts.some((e) => entry.endsWith(e))) out.push(full);
	}
	return out;
}

function writeSystem(systemId, creatures) {
	const dir = join(DATA, systemId);
	mkdirSync(dir, { recursive: true });
	const seen = new Map();
	const index = [];
	for (const c of creatures) {
		if (!c || !c.name) continue;
		let slug = slugify(c.name);
		const count = seen.get(slug) || 0;
		seen.set(slug, count + 1);
		if (count > 0) slug = `${slug}-${count + 1}`;
		writeFileSync(join(dir, `${slug}.json`), JSON.stringify(c, null, 2));
		index.push({ slug, name: c.name, cr: c.cr ?? c.level ?? null, size: c.size, type: c.type });
	}
	index.sort((a, b) => a.name.localeCompare(b.name));
	writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2));
	console.log(`${systemId}: wrote ${index.length} creatures`);
}

function buildDnd5e2014() {
	const bestiaryDir = join(FIVETOOLS, "data", "bestiary");
	if (!existsSync(bestiaryDir)) {
		console.warn("Skipping dnd5e2014: 5etools bundle not found at", bestiaryDir);
		return;
	}
	const creatures = [];
	for (const file of readdirSync(bestiaryDir).filter((f) => f.startsWith("bestiary-") && f.endsWith(".json"))) {
		const json = JSON.parse(readFileSync(join(bestiaryDir, file), "utf8"));
		for (const mon of json.monster || []) {
			if (!(mon.srd || mon.basicRules)) continue;
			if (mon._copy) continue; // a {@copy} stub referencing another entry — skip, the real one is filed separately
			creatures.push(fromFiveToolsJson(mon));
		}
	}
	writeSystem("dnd5e2014", creatures);
}

function buildDnd5e2024() {
	const file = join(SRD, "dnd-5e-srd-markdown", "monsters-A-Z.md");
	if (!existsSync(file)) return console.warn("Skipping dnd5e2024: not cloned at", file);
	const text = readFileSync(file, "utf8");
	writeSystem("dnd5e2024", parseDnd5e2024Markdown(text));
}

function buildDnd35() {
	const dir = join(SRD, "DnD-3.5-SRD-Markdown", "3.5 Compendium", "Monsters");
	if (!existsSync(dir)) return console.warn("Skipping dnd35: not cloned at", dir);
	const creatures = [];
	for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
		creatures.push(...parseDnd35CompendiumFile(readFileSync(join(dir, file), "utf8")));
	}
	writeSystem("dnd35", creatures);
}

// The source repos leave some scalar values with an unquoted embedded colon
// (commonly adventure titles like "Pathfinder No. 120: Vault of the Onyx
// Citadel" under `name:`/`desc:`), which YAML reads as a nested mapping and
// rejects. Quoting any plain scalar that contains ": " fixes that without
// touching values that are already quoted, block scalars, or list markers.
function sanitizeYaml(text) {
	return text
		.split("\n")
		.map((line) => {
			const m = line.match(/^(\s*)(-\s+)?([A-Za-z_][\w ]*):\s+(.+)$/);
			if (!m) return line;
			const [, indent, dash, key, value] = m;
			if (/^['"[{|>]/.test(value) || !value.includes(": ")) return line;
			return `${indent}${dash || ""}${key}: "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
		})
		.join("\n");
}

function buildPfSystem(systemId, repoName, parseYaml) {
	const dir = join(SRD, repoName, "fantasy-bestiary");
	if (!existsSync(dir)) return console.warn(`Skipping ${systemId}: not cloned at`, dir);
	const creatures = [];
	for (const file of walk(dir, [".md"], new Set(["_attachments"]))) {
		const text = readFileSync(file, "utf8");
		const yamlSrc = extractStatblockYamlSource(text);
		if (!yamlSrc) continue;
		try {
			const y = yaml.load(sanitizeYaml(yamlSrc));
			creatures.push(parseYaml(y));
		} catch (err) {
			console.warn(`  ! failed to parse ${file}: ${err.message}`);
		}
	}
	writeSystem(systemId, creatures);
}

buildDnd5e2014();
buildDnd5e2024();
buildDnd35();
buildPfSystem("pf1", "Pathfinder-1E-SRD-Markdown", parsePf1Yaml);
buildPfSystem("pf2", "Pathfinder-2E-SRD-Markdown", parsePf2Yaml);
