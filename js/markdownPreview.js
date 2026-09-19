// A small, deliberately-not-general Markdown renderer: it only needs to
// handle exactly what /templates produces (headers, bold/italic, a pipe
// table, and the raw <table>/<hr> HTML the 2024 layout embeds) — not
// arbitrary CommonMark. Text is HTML-escaped before any tag is added, so
// pasted content can't inject markup even though it flows through into the
// rendered output.

function escapeHtml(str) {
	return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(text) {
	let escaped = escapeHtml(text);
	escaped = escaped.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
	escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	escaped = escaped.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
	escaped = escaped.replace(/_(.+?)_/g, "<em>$1</em>");
	return escaped;
}

function renderPipeTable(lines) {
	const rows = lines.filter((l) => !/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(l));
	const cellsOf = (l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
	const [headerRow, ...bodyRows] = rows;
	let html = "<table><thead><tr>";
	html += cellsOf(headerRow).map((c) => `<th>${inline(c)}</th>`).join("");
	html += "</tr></thead><tbody>";
	for (const row of bodyRows) {
		html += "<tr>" + cellsOf(row).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
	}
	html += "</tbody></table>";
	return html;
}

export function renderMarkdownPreview(markdown) {
	const lines = markdown.split("\n");
	let html = "";
	let paragraph = [];

	function flushParagraph() {
		if (paragraph.length) {
			html += `<p>${paragraph.map(inline).join("<br>")}</p>`;
			paragraph = [];
		}
	}

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const trimmed = line.trim();

		if (/^<table>/.test(trimmed)) {
			flushParagraph();
			let block = [line];
			while (i + 1 < lines.length && !/<\/table>/.test(lines[i])) {
				i += 1;
				block.push(lines[i]);
			}
			html += block.join("\n");
			continue;
		}
		if (trimmed === "<hr>") {
			flushParagraph();
			html += "<hr>";
			continue;
		}
		if (!trimmed) {
			flushParagraph();
			continue;
		}
		const heading = trimmed.match(/^(#{2,4})\s+(.*)$/);
		if (heading) {
			flushParagraph();
			const level = heading[1].length;
			html += `<h${level}>${inline(heading[2])}</h${level}>`;
			continue;
		}
		if (trimmed.startsWith("|")) {
			flushParagraph();
			const tableLines = [trimmed];
			while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) {
				i += 1;
				tableLines.push(lines[i].trim());
			}
			html += renderPipeTable(tableLines);
			continue;
		}

		paragraph.push(trimmed.replace(/<br>$/i, ""));
	}
	flushParagraph();
	return html;
}
