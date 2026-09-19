import { SYSTEMS, CONVERTIBLE_SYSTEMS, importPastedText, exportCreature } from "../src/convert.js";
import { render } from "../src/templateEngine.js";
import { createCombobox } from "./combobox.js";
import { renderMarkdownPreview } from "./markdownPreview.js";

// ---- Theme ----

const THEME_KEY = "statblock-converter-theme";
function applyTheme(theme) {
	if (theme) document.documentElement.dataset.theme = theme;
	else delete document.documentElement.dataset.theme;
}
applyTheme(localStorage.getItem(THEME_KEY));

document.getElementById("theme-toggle").addEventListener("click", () => {
	const current = document.documentElement.dataset.theme;
	const next = current === "dark" ? "light" : current === "light" ? null : "dark";
	if (next) localStorage.setItem(THEME_KEY, next);
	else localStorage.removeItem(THEME_KEY);
	applyTheme(next);
});

// ---- System pickers ----

const systemOptions = (systems) => (query) => {
	const q = (query || "").toLowerCase();
	return systems.filter((s) => s.label.toLowerCase().includes(q)).map((s) => ({ value: s.id, label: s.label }));
};

// PF2 is excluded from both pickers for now — see src/exporters/pf2.js; its importer and searchable
// data already exist, so wiring it back in later is just adding it to these two lists.
const convertibleSystems = SYSTEMS.filter((s) => CONVERTIBLE_SYSTEMS.includes(s.id));

const fromCombo = createCombobox(document.querySelector('[data-combobox="from-system"]'), {
	placeholder: "Search systems…",
	getOptions: systemOptions(convertibleSystems),
	onSelect: (value) => onFromSystemChange(value),
});
fromCombo.setValue("dnd35", SYSTEMS.find((s) => s.id === "dnd35").label);

const toCombo = createCombobox(document.querySelector('[data-combobox="to-system"]'), {
	placeholder: "Search systems…",
	getOptions: systemOptions(convertibleSystems),
	onSelect: () => {},
});
toCombo.setValue("dnd5e2014", SYSTEMS.find((s) => s.id === "dnd5e2014").label);

// ---- Monster search ----

let monsterIndex = [];
let sourceCreature = null;
const sourceSummary = document.getElementById("source-summary");
const sourcePreviewEl = document.getElementById("source-preview");

const monsterCombo = createCombobox(document.querySelector('[data-combobox="monster-search"]'), {
	placeholder: "Type to search…",
	getOptions: (query) => {
		if (!query) return [];
		const q = query.toLowerCase();
		return monsterIndex
			.filter((m) => m.name.toLowerCase().includes(q))
			.slice(0, 50)
			.map((m) => ({ value: m.slug, label: m.name, meta: m.cr != null ? `CR ${m.cr}` : m.type || "" }));
	},
	onSelect: async (slug, label) => {
		const system = fromCombo.getValue();
		try {
			const res = await fetch(`data/${system}/${slug}.json`);
			sourceCreature = await res.json();
			sourceSummary.textContent = `Loaded "${label}" — ready to convert.`;
			await showSource(sourceCreature, system);
		} catch (err) {
			sourceCreature = null;
			sourcePreviewEl.innerHTML = "";
			sourceSummary.textContent = `Couldn't load "${label}": ${err.message}`;
		}
	},
});

async function onFromSystemChange(system) {
	monsterCombo.clear();
	sourceCreature = null;
	sourcePreviewEl.innerHTML = "";
	sourceSummary.textContent = "Loading monster list…";
	try {
		const res = await fetch(`data/${system}/index.json`);
		monsterIndex = await res.json();
		sourceSummary.textContent = `${monsterIndex.length} monsters available to search.`;
	} catch {
		monsterIndex = [];
		sourceSummary.textContent = "No searchable data for this system yet — try pasting a stat block instead.";
	}
}
onFromSystemChange(fromCombo.getValue());

// ---- Mode toggle (search vs paste) ----

let mode = "search";
document.querySelectorAll(".mode-tab[data-mode]").forEach((btn) => {
	btn.addEventListener("click", () => {
		mode = btn.dataset.mode;
		document.querySelectorAll(".mode-tab[data-mode]").forEach((b) => {
			b.classList.toggle("active", b === btn);
			b.setAttribute("aria-selected", String(b === btn));
		});
		document.querySelectorAll(".mode-panel").forEach((p) => (p.hidden = p.dataset.panel !== mode));
	});
});

// ---- Output view toggle (preview vs markdown) ----

let view = "preview";
document.querySelectorAll(".mode-tab[data-view]").forEach((btn) => {
	btn.addEventListener("click", () => {
		view = btn.dataset.view;
		document.querySelectorAll(".mode-tab[data-view]").forEach((b) => {
			b.classList.toggle("active", b === btn);
			b.setAttribute("aria-selected", String(b === btn));
		});
		document.querySelectorAll("[data-view-panel]").forEach((p) => (p.hidden = p.dataset.viewPanel !== view));
	});
});

// ---- Convert ----

const templateCache = new Map();
async function loadTemplate(system) {
	if (!templateCache.has(system)) {
		const res = await fetch(`templates/${system}.md`);
		if (!res.ok) throw new Error(`No template found for "${system}"`);
		templateCache.set(system, await res.text());
	}
	return templateCache.get(system);
}

const warningsEl = document.getElementById("warnings");
const previewEl = document.getElementById("output-preview");
const markdownEl = document.getElementById("output-markdown");
const copyBtn = document.getElementById("copy-btn");

function showWarnings(warnings) {
	if (!warnings || !warnings.length) {
		warningsEl.hidden = true;
		warningsEl.innerHTML = "";
		return;
	}
	warningsEl.hidden = false;
	warningsEl.innerHTML = `<strong>Conversion notes</strong><ul>${warnings.map((w) => `<li>${w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</li>`).join("")}</ul>`;
}

// Render the imported creature back out in its own system's layout so it can be eyeballed
// against the converted result (same-system export skips recomputation).
async function showSource(creature, fromSystem) {
	if (!creature) {
		sourcePreviewEl.innerHTML = "";
		return;
	}
	try {
		const template = await loadTemplate(fromSystem);
		const { context } = exportCreature(creature, fromSystem);
		sourcePreviewEl.innerHTML = renderMarkdownPreview(render(template, context));
	} catch (err) {
		console.error("Couldn't render source stat block:", err);
		sourcePreviewEl.innerHTML = "";
	}
}

function showOutput(markdown) {
	markdownEl.value = markdown;
	previewEl.innerHTML = renderMarkdownPreview(markdown);
	copyBtn.disabled = !markdown;
}

document.getElementById("convert-btn").addEventListener("click", async () => {
	const fromSystem = fromCombo.getValue();
	const toSystem = toCombo.getValue();
	if (!fromSystem || !toSystem) {
		sourceSummary.textContent = "Pick a source and destination system first.";
		return;
	}

	try {
		let creature;
		if (mode === "paste") {
			const text = document.getElementById("paste-input").value;
			if (!text.trim()) throw new Error("Paste a stat block first.");
			creature = importPastedText(text, fromSystem);
		} else {
			if (!sourceCreature) throw new Error("Search for and select a monster first.");
			creature = sourceCreature;
		}

		const template = await loadTemplate(toSystem);
		const { context, warnings } = exportCreature(creature, toSystem);
		const markdown = render(template, context);
		showOutput(markdown);
		showWarnings(warnings);
		await showSource(creature, fromSystem);
	} catch (err) {
		showWarnings([err.message]);
		showOutput("");
		showSource(null);
	}
});

copyBtn.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(markdownEl.value);
		const original = copyBtn.textContent;
		copyBtn.textContent = "Copied!";
		setTimeout(() => (copyBtn.textContent = original), 1200);
	} catch {
		markdownEl.select();
		document.execCommand("copy");
	}
});
