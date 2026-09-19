// A tiny Mustache/Handlebars-flavored template engine — just enough to keep
// stat block layouts in plain, editable Markdown files (per-system, see
// /templates) without pulling in a templating dependency.
//
// Supported syntax:
//   {{path.to.value}}            value lookup (dotted paths into the context)
//   {{helper path "literal"}}    helper call, e.g. {{mod abilities.str}}
//   {{#each list}} ... {{/each}} iterate an array; `this` is the current item
//   {{#if path}} ... {{/if}}     render block only if the value is truthy
//   {{#if path}} ... {{else}} ... {{/if}}
//   {{#unless path}} ... {{/unless}}
//
// Deliberately not full Handlebars: no partials, no nested helper calls.
// That keeps it small enough to read top-to-bottom in one sitting, which
// matters more here than generality — the templates it renders are meant to
// be hand-edited by anyone customizing a stat block layout.

import { abilityMod, formatMod } from "./util.js";

const HELPERS = {
	mod: (score) => formatMod(abilityMod(Number(score))),
	plus: (n) => formatMod(Number(n)),
	upper: (s) => String(s ?? "").toUpperCase(),
	join: (list, sep = ", ") => (Array.isArray(list) ? list.join(sep) : String(list ?? "")),
	default: (value, fallback) => (value === null || value === undefined || value === "" ? fallback : value),
};

function getPath(ctx, path) {
	if (path === "this" || path === ".") return ctx;
	return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), ctx);
}

function resolveToken(token, ctx) {
	const parts = token.trim().split(/\s+/);
	if (parts.length === 1) {
		const [path] = parts;
		if (path.startsWith('"') && path.endsWith('"')) return path.slice(1, -1);
		return getPath(ctx, path);
	}
	const [helperName, ...args] = parts;
	const helper = HELPERS[helperName];
	if (!helper) return "";
	const resolvedArgs = args.map((a) => {
		if (a.startsWith('"') && a.endsWith('"')) return a.slice(1, -1);
		return getPath(ctx, a);
	});
	return helper(...resolvedArgs);
}

function isTruthy(value) {
	if (Array.isArray(value)) return value.length > 0;
	if (value == null) return false;
	if (typeof value === "string") return value.trim().length > 0;
	return Boolean(value);
}

// Finds the matching {{/tag}} for a block opened at `openIndex`, respecting nesting.
function findBlockEnd(src, tag, fromIndex) {
	const openRe = new RegExp(`{{#${tag}\\b`, "g");
	const closeRe = new RegExp(`{{/${tag}}}`, "g");
	openRe.lastIndex = fromIndex;
	closeRe.lastIndex = fromIndex;
	let depth = 1;
	let searchFrom = fromIndex;
	while (depth > 0) {
		openRe.lastIndex = searchFrom;
		closeRe.lastIndex = searchFrom;
		const nextOpen = openRe.exec(src);
		const nextClose = closeRe.exec(src);
		if (!nextClose) throw new Error(`Unclosed {{#${tag}}} block in template`);
		if (nextOpen && nextOpen.index < nextClose.index) {
			depth += 1;
			searchFrom = nextOpen.index + nextOpen[0].length;
		} else {
			depth -= 1;
			searchFrom = nextClose.index + nextClose[0].length;
			if (depth === 0) return { start: nextClose.index, end: searchFrom };
		}
	}
	throw new Error(`Unclosed {{#${tag}}} block in template`);
}

function splitElse(body) {
	// top-level {{else}} only (not inside a nested block) — find via depth tracking.
	const re = /{{#(each|if|unless)\b[^}]*}}|{{\/(each|if|unless)}}|{{else}}/g;
	let depth = 0;
	let match;
	while ((match = re.exec(body))) {
		if (match[0] === "{{else}}") {
			if (depth === 0) return [body.slice(0, match.index), body.slice(match.index + match[0].length)];
		} else if (match[1]) depth += 1;
		else if (match[2]) depth -= 1;
	}
	return [body, ""];
}

export function render(template, ctx) {
	let out = "";
	let i = 0;
	const tagRe = /{{(#each|#if|#unless)\s+([^}]+)}}/g;

	while (i < template.length) {
		tagRe.lastIndex = i;
		const blockMatch = tagRe.exec(template);
		const nextVarIndex = template.indexOf("{{", i);

		if (!blockMatch && nextVarIndex === -1) {
			out += template.slice(i);
			break;
		}

		if (blockMatch && blockMatch.index === nextVarIndex) {
			out += template.slice(i, blockMatch.index);
			const [full, kind, rawArg] = blockMatch;
			const tag = kind.slice(1); // each | if | unless
			const blockStart = blockMatch.index + full.length;
			const { start: closeStart, end: blockEnd } = findBlockEnd(template, tag, blockStart);
			const body = template.slice(blockStart, closeStart);

			if (tag === "each") {
				const list = getPath(ctx, rawArg.trim()) || [];
				for (const item of list) {
					out += render(body, { ...ctx, this: item, ...(item && typeof item === "object" ? item : {}) });
				}
			} else {
				const [truthyBody, falsyBody] = splitElse(body);
				const value = getPath(ctx, rawArg.trim());
				const condition = tag === "if" ? isTruthy(value) : !isTruthy(value);
				out += render(condition ? truthyBody : falsyBody, ctx);
			}
			i = blockEnd;
			continue;
		}

		// Plain {{token}} substitution.
		out += template.slice(i, nextVarIndex);
		const close = template.indexOf("}}", nextVarIndex);
		if (close === -1) {
			out += template.slice(nextVarIndex);
			break;
		}
		const token = template.slice(nextVarIndex + 2, close);
		const value = resolveToken(token, ctx);
		out += value == null ? "" : String(value);
		i = close + 2;
	}

	return out;
}
