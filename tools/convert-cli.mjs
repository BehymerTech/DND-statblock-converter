#!/usr/bin/env node
// Command-line entry point to the same conversion engine the web UI uses —
// this is what the Claude/Copilot skills shell out to, so a conversion done
// through an AI assistant matches one done through the site exactly.
//
// Usage:
//   node convert-cli.mjs --from pf1 --to dnd35 --search "Goblin"
//   node convert-cli.mjs --from dnd5e2024 --to dnd5e2014 --file block.txt
//   cat block.txt | node convert-cli.mjs --from dnd35 --to pf1
//   node convert-cli.mjs --list-systems
//   node convert-cli.mjs --from pf1 --search goblin --list-matches

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { importPastedText, exportCreature, SYSTEMS, CONVERTIBLE_TARGETS } from "../src/convert.js";
import { render } from "../src/templateEngine.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith("--")) args[key] = true;
			else {
				args[key] = next;
				i += 1;
			}
		} else args._.push(a);
	}
	return args;
}

function readStdin() {
	try {
		return readFileSync(0, "utf8");
	} catch {
		return "";
	}
}

function loadIndex(system) {
	const file = join(ROOT, "data", system, "index.json");
	if (!existsSync(file)) return [];
	return JSON.parse(readFileSync(file, "utf8"));
}

function loadCreature(system, slug) {
	return JSON.parse(readFileSync(join(ROOT, "data", system, `${slug}.json`), "utf8"));
}

function fail(msg) {
	console.error(`Error: ${msg}`);
	process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args["list-systems"]) {
	console.log(SYSTEMS.map((s) => `${s.id}\t${s.label}`).join("\n"));
	process.exit(0);
}

if (!args.from) fail("--from <system> is required (use --list-systems to see options)");
if (!SYSTEMS.some((s) => s.id === args.from)) fail(`unknown source system "${args.from}"`);
if (!CONVERTIBLE_TARGETS.includes(args.from)) {
	fail(`"${args.from}" isn't a supported conversion source yet (supported: ${CONVERTIBLE_TARGETS.join(", ")})`);
}

let creature;

if (args.search) {
	const index = loadIndex(args.from);
	const query = String(args.search).toLowerCase();
	const matches = index.filter((m) => m.name.toLowerCase().includes(query));
	if (args["list-matches"]) {
		console.log(matches.map((m) => `${m.slug}\t${m.name}\tCR ${m.cr ?? "?"}`).join("\n"));
		process.exit(0);
	}
	if (!matches.length) fail(`no ${args.from} monster matching "${args.search}" — try --list-matches with a shorter query`);
	const exact = matches.find((m) => m.name.toLowerCase() === query);
	if (!exact && matches.length > 1) fail(`${matches.length} matches for "${args.search}" — pass --list-matches to see them, or narrow the query`);
	creature = loadCreature(args.from, (exact || matches[0]).slug);
} else {
	const text = args.file ? readFileSync(args.file, "utf8") : args.text || readStdin();
	if (!text.trim()) fail("provide a stat block via --file, --text, --search, or stdin");
	creature = importPastedText(text, args.from);
}

if (!args.to) {
	// No --to: just print the parsed canonical data, useful for checking how a paste was understood.
	console.log(JSON.stringify(creature, null, 2));
	process.exit(0);
}

if (!CONVERTIBLE_TARGETS.includes(args.to)) {
	fail(`"${args.to}" isn't a supported conversion target yet (supported: ${CONVERTIBLE_TARGETS.join(", ")})`);
}

const templatePath = join(ROOT, "templates", `${args.to}.md`);
const template = readFileSync(templatePath, "utf8");

let result;
try {
	result = exportCreature(creature, args.to);
} catch (err) {
	fail(err.message);
}

console.log(render(template, result.context));

if (result.warnings.length) {
	console.error("\n--- Conversion notes ---");
	for (const w of result.warnings) console.error(`- ${w}`);
}
